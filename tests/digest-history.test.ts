import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import { browseDigestHistory } from "../src/jobs/digest-history";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: digest history reaches older private records with stable microsecond cursors and filters`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-history-")),
        schema = "history_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", `-c search_path=${schema}`);
        url = parsed.href;
      }
      const db = await openDatabase(dir, url);
      try {
        for (const user of ["history-user", "other-user"])
          await db.sql.query(
            "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
            [user, user + "@example.test"],
          );
        const insert = async (
          id: string,
          user: string,
          at: string,
          channel = "email",
          state = "accepted",
        ) =>
          db.sql.query(
            "INSERT INTO notification_digests(id,user_id,preference_version,channel,slot,state,created_at,payload) VALUES($1,$2,1,$3,$1,$4,$5,$6)",
            [
              id,
              user,
              channel,
              state,
              at,
              JSON.stringify({ privateValue: "must-not-leak" }),
            ],
          );
        for (let i = 0; i < 65; i++)
          await insert(
            "record-" + String(i).padStart(3, "0"),
            "history-user",
            i < 35
              ? "2026-01-01T12:00:00.123456Z"
              : "2026-01-01T12:00:00.123455Z",
            i % 2 ? "telegram" : "email",
            i % 3 ? "accepted" : "suppressed",
          );
        await insert("foreign", "other-user", "2026-02-01T00:00:00.000000Z");
        const first = await browseDigestHistory(db.sql, "history-user");
        assert.equal(first.items.length, 20);
        assert.equal(first.items[0].createdAt, "2026-01-01T12:00:00.123456Z");
        assert.ok(first.nextCursor);
        assert.doesNotMatch(
          JSON.stringify(first),
          /foreign|must-not-leak|privateValue|payload/,
        );
        // Insert after reading page one: older pages must not duplicate or skip the original rows.
        await insert("newest", "history-user", "2026-03-01T00:00:00.000001Z");
        const seen = first.items.map((item) => item.id);
        let cursor: string | null = first.nextCursor;
        while (cursor) {
          const page = await browseDigestHistory(db.sql, "history-user", {
            cursor,
          });
          seen.push(...page.items.map((item) => item.id));
          cursor = page.nextCursor;
        }
        assert.equal(seen.length, 65);
        assert.equal(new Set(seen).size, 65);
        assert.ok(seen.includes("record-064"));
        assert.ok(!seen.includes("newest"));
        assert.equal(
          (await browseDigestHistory(db.sql, "history-user")).items[0].id,
          "newest",
        );
        const filtered: string[] = [];
        let filteredCursor: string | null | undefined;
        do {
          const page = await browseDigestHistory(db.sql, "history-user", {
            channel: "email",
            state: "suppressed",
            ...(filteredCursor ? { cursor: filteredCursor } : {}),
          });
          assert.ok(
            page.items.every(
              (item) => item.channel === "email" && item.state === "suppressed",
            ),
          );
          filtered.push(...page.items.map((item) => item.id));
          filteredCursor = page.nextCursor;
        } while (filteredCursor);
        assert.deepEqual(
          filtered,
          Array.from({ length: 65 }, (_, i) => i)
            .filter((i) => i % 6 === 0)
            .map((i) => "record-" + String(i).padStart(3, "0")),
        );
        const other = await browseDigestHistory(db.sql, "other-user", {
          cursor: first.nextCursor,
        });
        assert.deepEqual(
          other.items,
          [],
          "a foreign cursor never authorizes foreign rows",
        );
        for (const query of [
          { userId: "other-user" },
          { channel: ["email", "telegram"] },
          { state: "delivered" },
          { cursor: "not+base64" },
          { cursor: Buffer.from("{}").toString("base64url") },
          { channel: "telegram", cursor: first.nextCursor },
        ])
          await assert.rejects(
            browseDigestHistory(db.sql, "history-user", query),
          );
        assert.deepEqual(
          (await browseDigestHistory(db.sql, "empty-owner")).items,
          [],
        );
      } finally {
        await db.close();
        await rm(dir, { recursive: true, force: true });
        if (pool) {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          await pool.end();
        }
      }
    },
  );
