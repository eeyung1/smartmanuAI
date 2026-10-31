import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import { createLocalAuth } from "../src/auth";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import { saveProfile, saveItem } from "../src/domain/profile";
import { planOneDigest } from "../src/jobs/digests";
import { queueNotification, dispatchOne } from "../src/jobs/local";
import {
  requireFreshSession,
  accountExport,
  requestAccountDeletion,
  purgeOneAccount,
  deletionStatus,
} from "../src/privacy/account";
import { appendLocalMail, purgeLocalMail } from "../src/auth/local-mail";
process.env.SMARTMANU_MODE = "local";
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
test("privacy requires recent authentication and mail cleanup preserves other writers", async () => {
  const now = new Date();
  requireFreshSession(now, now);
  assert.throws(
    () => requireFreshSession(new Date(now.getTime() - 601000), now),
    /Sign in again/,
  );
  assert.throws(() => requireFreshSession("invalid", now));
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-mail-"));
  try {
    await appendLocalMail(
      dir,
      { to: "a@example.test", url: "private-a" },
      async () => true,
    );
    await Promise.all([
      purgeLocalMail(dir, "a@example.test"),
      appendLocalMail(
        dir,
        { to: "b@example.test", url: "private-b" },
        async () => true,
      ),
      appendLocalMail(
        dir,
        { to: "c@example.test", url: "private-c" },
        async () => true,
      ),
    ]);
    const text = await readFile(join(dir, "mail.jsonl"), "utf8");
    assert.ok(!text.includes("private-a"));
    assert.ok(text.includes("private-b"));
    assert.ok(text.includes("private-c"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: private export, immediate revocation, write fencing and transactional account purge`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-privacy-")),
        schema = "privacy_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", `-c search_path=${schema}`);
        url = parsed.href;
      }
      let db = await openDatabase(dir, url);
      try {
        await seedLocalCatalogue(db.sql);
        const auth = await createLocalAuth(db, dir);
        async function login(email: string) {
          const sent = await auth.handler(
            new Request("http://127.0.0.1:3000/api/auth/sign-in/magic-link", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Origin: "http://127.0.0.1:3000",
              },
              body: JSON.stringify({ email }),
            }),
          );
          assert.equal(sent.status, 200);
          const lines = (await readFile(join(dir, "mail.jsonl"), "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
          const link = lines.findLast((line) => line.to === email).url;
          const verified = await auth.handler(new Request(link));
          const cookie = verified.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; ");
          const session = await auth.api.getSession({
            headers: new Headers({ cookie }),
          });
          assert.ok(session);
          return { id: session.user.id, cookie };
        }
        const a = await login("privacy-a@example.test"),
          b = await login("privacy-b@example.test");
        await saveProfile(db.sql, a.id, { nationality: "NG", age: 25 });
        await saveProfile(db.sql, b.id, { nationality: "GH" });
        await saveItem(db.sql, a.id, "synthetic-course");
        await saveItem(db.sql, b.id, "synthetic-course");
        await db.sql.query(
          "INSERT INTO notification_preferences(user_id,enabled,channel) VALUES($1,true,'email'),($2,true,'email')",
          [a.id, b.id],
        );
        await queueNotification(db.sql, a.id, "private-a");
        await dispatchOne(db.sql);
        await queueNotification(db.sql, b.id, "private-b");
        await dispatchOne(db.sql);
        await db.sql.query(
          "INSERT INTO telegram_bindings(user_id,state,chat_hash,encrypted_chat,chat_suffix,event_date,update_id) VALUES($1,'active','privacy-chat','private-cipher','0001',0,0)",
          [a.id],
        );
        await db.sql.query(
          "INSERT INTO telegram_chat_events VALUES('privacy-chat',0,0,false)",
        );
        await db.sql.query(
          "INSERT INTO auth_account(id,account_id,provider_id,user_id,access_token,created_at,updated_at) VALUES($1,'fixture','fixture',$2,'private-access-token',NOW(),NOW())",
          [randomUUID(), a.id],
        );
        const exported = await accountExport(db.sql, a.id),
          json = JSON.stringify(exported);
        assert.ok(json.includes("privacy-a@example.test"));
        assert.ok(!json.includes("privacy-b@example.test"));
        assert.ok(!json.includes("private-access-token"));
        assert.ok(!json.includes("private-cipher"));
        assert.equal(exported.tracker.length, 1);
        await assert.rejects(() =>
          requestAccountDeletion(db.sql, a.id, {
            confirmation: "DELETE",
            userId: b.id,
          }),
        );
        await assert.rejects(
          () =>
            requestAccountDeletion(db.sql, "local-fixture-reviewer", {
              confirmation: "DELETE",
            }),
          /operator-assisted/,
        );
        await db.sql.query(
          "UPDATE notification_preferences SET channel='telegram',consent_version='local-sink-v1',next_due_at=NOW()-INTERVAL '1 day' WHERE user_id=$1",
          [a.id],
        );
        await queueNotification(db.sql, a.id, "deletion-race");
        const [request] = await Promise.all([
          requestAccountDeletion(db.sql, a.id, { confirmation: "DELETE" }),
          dispatchOne(db.sql),
          planOneDigest(db.sql),
        ]);
        assert.equal(
          (await deletionStatus(db.sql, request.receipt)).state,
          "queued",
        );
        assert.ok(
          !JSON.stringify(
            (await db.sql.query("SELECT * FROM account_deletion_requests"))
              .rows,
          ).includes(request.receipt),
        );
        assert.equal(
          await auth.api.getSession({
            headers: new Headers({ cookie: a.cookie }),
          }),
          null,
        );
        assert.ok(
          await auth.api.getSession({
            headers: new Headers({ cookie: b.cookie }),
          }),
        );
        await assert.rejects(
          () => saveProfile(db.sql, a.id, { nationality: "US" }),
          /deletion is pending/,
        );
        await assert.rejects(
          () => saveItem(db.sql, a.id, "synthetic-course"),
          /deletion is pending/,
        );
        await assert.rejects(
          () =>
            requestAccountDeletion(db.sql, a.id, { confirmation: "DELETE" }),
          /already requested/,
        );
        const before = await readFile(join(dir, "mail.jsonl"), "utf8");
        await auth.handler(
          new Request("http://127.0.0.1:3000/api/auth/sign-in/magic-link", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: "http://127.0.0.1:3000",
            },
            body: JSON.stringify({ email: "privacy-a@example.test" }),
          }),
        );
        assert.equal(await readFile(join(dir, "mail.jsonl"), "utf8"), before);
        await writeFile(join(dir, "mail.jsonl"), before + "invalid-json\n");
        await assert.rejects(() => purgeOneAccount(db.sql, dir));
        assert.equal(
          (await deletionStatus(db.sql, request.receipt)).state,
          "queued",
        );
        assert.equal(
          (await db.sql.query("SELECT id FROM auth_user WHERE id=$1", [a.id]))
            .rows.length,
          1,
        );
        await writeFile(join(dir, "mail.jsonl"), before);
        await db.close();
        db = await openDatabase(dir, url);
        assert.equal(await purgeOneAccount(db.sql, dir), "purged");
        assert.equal(await purgeOneAccount(db.sql, dir), "empty");
        assert.equal(
          (await deletionStatus(db.sql, request.receipt)).state,
          "done",
        );
        assert.equal(
          (await db.sql.query("SELECT user_id FROM account_deletion_requests"))
            .rows[0].user_id,
          null,
        );
        assert.equal(
          (await db.sql.query("SELECT id FROM auth_user WHERE id=$1", [a.id]))
            .rows.length,
          0,
        );
        assert.equal(
          (await db.sql.query("SELECT id FROM auth_user WHERE id=$1", [b.id]))
            .rows.length,
          1,
        );
        assert.equal(
          (
            await db.sql.query("SELECT * FROM profiles WHERE user_id=$1", [
              a.id,
            ])
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.sql.query("SELECT * FROM saved_items WHERE user_id=$1", [
              b.id,
            ])
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT * FROM telegram_chat_events WHERE chat_hash='privacy-chat'",
            )
          ).rows.length,
          0,
        );
        const mail = await readFile(join(dir, "mail.jsonl"), "utf8");
        assert.ok(!mail.includes("privacy-a@example.test"));
        assert.ok(mail.includes("privacy-b@example.test"));
        assert.equal(
          (await db.sql.query("SELECT * FROM sink_messages")).rows.length,
          1,
        );
        await assert.rejects(
          () => deletionStatus(db.sql, "0".repeat(64)),
          /not found/,
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
