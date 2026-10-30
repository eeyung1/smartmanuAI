import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createLocalAuth } from "../src/auth";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../src/db";
import {
  seedLocalCatalogue,
  fixtureDetails,
  fixtureEvidence,
} from "../src/catalogue/fixtures";
import {
  createDraft,
  createSource,
  reviewOpportunity,
  listPublic,
  publicOpportunity,
  revisionHistory,
} from "../src/catalogue/service";
import { saveItem, listSaved } from "../src/domain/profile";
import {
  reserveBudget,
  queueNotification,
  dispatchOne,
} from "../src/jobs/local";
process.env.SMARTMANU_MODE = "local";
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
for (const kind of ["pglite", "postgres"]) {
  test(
    `${kind}: review gates, revisions, filtering, stale records, saved history and rollback`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-catalogue-"));
      const schema = "test_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined;
      let url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", `-c search_path=${schema}`);
        url = parsed.href;
      }
      const db = await openDatabase(dir, url);
      try {
        await seedLocalCatalogue(db.sql);
        if (kind === "postgres") {
          const auth = await createLocalAuth(db, dir);
          const sent = await auth.handler(
            new Request("http://127.0.0.1:3000/api/auth/sign-in/magic-link", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Origin: "http://127.0.0.1:3000",
              },
              body: JSON.stringify({
                email: "postgres-login@example.test",
                callbackURL: "/matches",
              }),
            }),
          );
          assert.equal(sent.status, 200);
          const link = JSON.parse(
            (await readFile(join(dir, "mail.jsonl"), "utf8")).trim(),
          ).url;
          const verified = await auth.handler(new Request(link));
          assert.equal(verified.status, 302);
          const cookie = verified.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; ");
          assert.equal(
            (await auth.api.getSession({ headers: new Headers({ cookie }) }))
              ?.user.email,
            "postgres-login@example.test",
          );
        }
        const admin = "local-fixture-reviewer";
        await db.sql.query(
          "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('reader','Reader','reader@example.test',NOW(),NOW())",
        );
        await assert.rejects(
          () =>
            createSource(db.sql, "reader", {
              name: "Bad source",
              url: "https://example.test/bad",
            }),
          /Administrator/,
        );
        await assert.rejects(() =>
          createSource(db.sql, admin, {
            name: "Private URL",
            url: "https://127.0.0.1/path",
          }),
        );
        const source = await createSource(db.sql, admin, {
          name: "Official fixture",
          url: "https://example.test/other",
          synthetic: true,
        });
        const draft = await createDraft(db.sql, admin, {
          sourceId: source.id,
          details: {
            ...fixtureDetails,
            title: "Factory systems scholarship",
            category: "scholarship",
            country: "CN",
            funding: "fully_funded",
          },
          evidence: fixtureEvidence,
          note: "Record supplied field evidence.",
        });
        assert.equal(await publicOpportunity(db.sql, draft.id), null);
        assert.equal((await listPublic(db.sql)).total, 1);
        await assert.rejects(
          () =>
            reviewOpportunity(db.sql, admin, draft.id, {
              action: "publish",
              expectedRevision: 1,
              note: "Verify source evidence.",
            }),
          /Verify/,
        );
        await assert.rejects(
          () =>
            reviewOpportunity(db.sql, admin, draft.id, {
              action: "publish",
              expectedRevision: 1,
              verified: true,
              note: "Verify source evidence.",
            }),
          /coverage|covered|fully|funded/i,
        );
        await reviewOpportunity(db.sql, admin, draft.id, {
          action: "revise",
          expectedRevision: 1,
          details: {
            ...fixtureDetails,
            title: "Factory systems scholarship",
            category: "scholarship",
            country: "CN",
            funding: "tuition_only",
            tuitionCovered: true,
          },
          evidence: fixtureEvidence,
          note: "Correct unsupported full funding claim.",
        });
        await assert.rejects(
          () =>
            reviewOpportunity(db.sql, admin, draft.id, {
              action: "publish",
              expectedRevision: 1,
              verified: true,
              note: "Verify source evidence.",
            }),
          /changed/,
        );
        await reviewOpportunity(db.sql, admin, draft.id, {
          action: "publish",
          expectedRevision: 2,
          verified: true,
          note: "Verify source evidence.",
        });
        assert.equal(
          (
            await listPublic(db.sql, {
              category: "scholarship",
              language: "en",
              funding: "tuition_only",
              q: "Factory",
            })
          ).total,
          1,
        );
        assert.equal((await listPublic(db.sql, { q: "%" })).total, 0);
        await saveItem(db.sql, "reader", draft.id);
        await saveItem(db.sql, "reader", draft.id);
        assert.equal((await listSaved(db.sql, "reader")).length, 1);
        await reviewOpportunity(db.sql, admin, draft.id, {
          action: "close",
          expectedRevision: 3,
          note: "Source confirms applications closed.",
        });
        assert.equal(
          (await publicOpportunity(db.sql, draft.id))?.available,
          false,
        );
        assert.equal(
          (await listPublic(db.sql, { category: "scholarship" })).total,
          0,
        );
        await assert.rejects(() => saveItem(db.sql, "reader", draft.id));
        assert.equal((await listSaved(db.sql, "reader")).length, 1);
        assert.equal(
          (await revisionHistory(db.sql, admin, draft.id)).length,
          4,
        );
        await db.sql.query(
          "UPDATE opportunities SET verified_at=NOW()-INTERVAL '8 days' WHERE id='synthetic-course'",
        );
        assert.equal((await listPublic(db.sql)).total, 0);
        await assert.rejects(() =>
          saveItem(db.sql, "reader", "synthetic-course"),
        );
        await assert.rejects(() =>
          db.sql.transaction(async (tx) => {
            await tx.query(
              "UPDATE opportunities SET state='draft' WHERE id=$1",
              [draft.id],
            );
            throw Error("rollback");
          }),
        );
        assert.equal(
          (await publicOpportunity(db.sql, draft.id))?.state,
          "closed",
        );
        const budget = await Promise.all([
          reserveBudget(db.sql, 2000000),
          reserveBudget(db.sql, 2000000),
        ]);
        assert.equal(budget.filter(Boolean).length, 1);
        await db.sql.query(
          "INSERT INTO notification_preferences(user_id,enabled) VALUES('reader',true)",
        );
        await queueNotification(db.sql, "reader", "reviewed-record");
        await queueNotification(db.sql, "reader", "reviewed-record");
        await dispatchOne(db.sql);
        await dispatchOne(db.sql);
        assert.equal(
          (await db.sql.query("SELECT * FROM sink_messages")).rows.length,
          1,
        );
      } finally {
        await db.close();
        if (pool) {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          await pool.end();
        }
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
}
