import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import { saveProfile } from "../src/domain/profile";
import {
  saveNotificationSettings,
  readNotificationSettings,
  planOneDigest,
} from "../src/jobs/digests";
import {
  emailControlsConfig,
  verifyEmailWebhook,
  mintUnsubscribeToken,
  unsubscribeEmail,
  processEmailWebhook,
  recordEmailDigestAttempt,
  emailSuppression,
} from "../src/channels/email-controls";
process.env.SMARTMANU_EMAIL_MODE = "local";
process.env.EMAIL_WEBHOOK_SIGNING_SECRET =
  "whsec_" + randomBytes(32).toString("base64");
process.env.NOTIFICATION_UNSUBSCRIBE_KEY = randomBytes(32).toString("hex");
const config = emailControlsConfig();
function headers(
  raw: Buffer,
  id = "msg_test",
  timestamp = String(Math.floor(Date.now() / 1000)),
) {
  return new Headers({
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature":
      "v1," +
      createHmac("sha256", config.webhookKey)
        .update(id + "." + timestamp + ".")
        .update(raw)
        .digest("base64"),
  });
}
test("email callback verifies raw bytes, timestamp and rotated signature lists", () => {
  const raw = Buffer.from('{"type":"email.delivered"}');
  assert.equal(verifyEmailWebhook(raw, headers(raw), config).id, "msg_test");
  assert.throws(
    () =>
      verifyEmailWebhook(
        Buffer.from('{ "type":"email.delivered"}'),
        headers(raw),
        config,
      ),
    /authentication/,
  );
  assert.throws(
    () => verifyEmailWebhook(raw, headers(raw, "msg_old", "1"), config),
    /authentication/,
  );
  assert.throws(
    () => verifyEmailWebhook(raw, new Headers(), config),
    /authentication/,
  );
  const multiple = headers(raw);
  multiple.set(
    "svix-signature",
    "v2,ignored v1,wrong " + multiple.get("svix-signature"),
  );
  assert.equal(verifyEmailWebhook(raw, multiple, config).id, "msg_test");
  assert.throws(() => emailControlsConfig({}));
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: scoped unsubscribe, sticky suppression and callback-before-attempt reconciliation`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-email-")),
        schema = "email_" + randomUUID().replaceAll("-", "");
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
        for (const id of ["a", "b"]) {
          await db.sql.query(
            "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
            [id, id + "@example.test"],
          );
          await saveProfile(db.sql, id, {});
        }
        const base = {
          enabled: true,
          channel: "email",
          frequency: "daily",
          timezone: "UTC",
          consent: true,
        };
        const enable = async (id: string, extra = {}) =>
          saveNotificationSettings(db.sql, id, {
            ...base,
            expectedVersion: (await readNotificationSettings(db.sql, id))
              .version,
            ...extra,
          });
        await enable("a");
        await enable("b");
        const token = await mintUnsubscribeToken(db.sql, "a", 1, config);
        assert.ok(
          !JSON.stringify(
            (
              await db.sql.query(
                "SELECT * FROM notification_unsubscribe_tokens",
              )
            ).rows,
          ).includes(token),
        );
        await db.sql.query(
          "UPDATE notification_preferences SET next_due_at=NOW()-INTERVAL '1 second' WHERE user_id='a'",
        );
        assert.equal(await planOneDigest(db.sql), "queued");
        await assert.rejects(() =>
          unsubscribeEmail(
            db.sql,
            token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"),
            config,
          ),
        );
        // Editing a schedule preserves the email consent epoch and its links.
        await enable("a", { frequency: "weekly" });
        await db.sql.query(
          "UPDATE notification_preferences SET next_due_at=NOW()-INTERVAL '1 second' WHERE user_id='a'",
        );
        assert.equal(await planOneDigest(db.sql), "queued");
        await unsubscribeEmail(db.sql, token, config);
        assert.equal(
          (await readNotificationSettings(db.sql, "a")).enabled,
          false,
        );
        assert.equal(
          (await readNotificationSettings(db.sql, "b")).enabled,
          true,
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT * FROM notification_digests WHERE user_id='a' AND state='queued'",
            )
          ).rows.length,
          0,
        );
        const version = (await readNotificationSettings(db.sql, "a")).version;
        await unsubscribeEmail(db.sql, token, config);
        assert.equal(
          (await readNotificationSettings(db.sql, "a")).version,
          version,
        );
        await enable("a");
        await unsubscribeEmail(db.sql, token, config);
        assert.equal(
          (await readNotificationSettings(db.sql, "a")).enabled,
          true,
        );
        const old = await mintUnsubscribeToken(
          db.sql,
          "a",
          (await readNotificationSettings(db.sql, "a")).version,
          config,
        );
        await enable("a", { channel: "telegram" });
        await unsubscribeEmail(db.sql, old, config);
        assert.equal(
          (await readNotificationSettings(db.sql, "a")).enabled,
          true,
        );
        const expired = await mintUnsubscribeToken(
          db.sql,
          "a",
          1,
          config,
          new Date(Date.now() - 91 * 86400000),
        );
        await assert.rejects(
          () => unsubscribeEmail(db.sql, expired, config),
          /expired/,
        );
        await recordEmailDigestAttempt(
          db.sql,
          "a",
          "email-a",
          "a@example.test",
          config,
        );
        await assert.rejects(
          () =>
            recordEmailDigestAttempt(
              db.sql,
              "b",
              "email-a",
              "b@example.test",
              config,
            ),
          /belongs/,
        );
        const event = (id: string, to: string, type = "email.bounced") => ({
          type,
          data: { email_id: id, to: [to] },
        });
        await processEmailWebhook(
          db.sql,
          "wrong-recipient",
          event("email-a", "b@example.test"),
          config,
        );
        assert.equal(await emailSuppression(db.sql, "a", config), null);
        assert.equal(
          await processEmailWebhook(
            db.sql,
            "bounce-a",
            event("email-a", "a@example.test"),
            config,
          ),
          "processed",
        );
        assert.equal(await emailSuppression(db.sql, "a", config), "bounce");
        assert.equal(
          (await readNotificationSettings(db.sql, "a")).enabled,
          true,
        );
        await assert.rejects(() => enable("a"), /suppressed/);
        await processEmailWebhook(
          db.sql,
          "complaint-a",
          event("email-a", "a@example.test", "email.complained"),
          config,
        );
        assert.equal(await emailSuppression(db.sql, "a", config), "complaint");
        await processEmailWebhook(
          db.sql,
          "late-bounce",
          event("email-a", "a@example.test"),
          config,
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT event_id FROM email_suppressions WHERE reason=$1",
              ["complaint"],
            )
          ).rows[0].event_id,
          "complaint-a",
        );
        assert.equal(
          await processEmailWebhook(
            db.sql,
            "delivered-a",
            { type: "email.delivered" },
            config,
          ),
          "ignored",
        );
        assert.equal(await emailSuppression(db.sql, "a", config), "complaint");
        await processEmailWebhook(
          db.sql,
          "early-b",
          event("email-b", "b@example.test"),
          config,
        );
        assert.equal(await emailSuppression(db.sql, "b", config), null);
        await recordEmailDigestAttempt(
          db.sql,
          "b",
          "email-b",
          "b@example.test",
          config,
        );
        assert.equal(await emailSuppression(db.sql, "b", config), "bounce");
        assert.equal(
          (await readNotificationSettings(db.sql, "b")).enabled,
          false,
        );
        await db.close();
        db = await openDatabase(dir, url);
        assert.equal(
          await processEmailWebhook(
            db.sql,
            "early-b",
            event("email-b", "b@example.test"),
            config,
          ),
          "duplicate",
        );
        assert.equal(await emailSuppression(db.sql, "b", config), "bounce");
        assert.ok(
          !JSON.stringify(
            (await db.sql.query("SELECT * FROM email_webhook_events")).rows,
          ).includes("a@example.test"),
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
