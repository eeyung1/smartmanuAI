import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import { saveProfile } from "../src/domain/profile";
import {
  liveEmailConfig,
  brevoCallbackConfig,
  requireBearer,
  LIVE_EMAIL_CONSENT,
} from "../src/email/config";
import {
  saveLiveEmailSettings,
  liveEmailSettings,
} from "../src/email/settings";
import {
  queueLiveEmail,
  dispatchLiveEmail,
  runLiveEmailCycle,
} from "../src/email/worker";
import { registerBrevoAlertWebhook } from "../src/email/provider";
import { processBrevoAlertWebhook } from "../src/email/webhook";
import {
  unsubscribeEmail,
  emailSuppression,
  verifyEmailWebhook,
} from "../src/channels/email-controls";
import {
  accountExport,
  requestAccountDeletion,
  purgeOneAccount,
} from "../src/privacy/account";
const env = {
  SMARTMANU_MODE: "production",
  SMARTMANU_EMAIL_ALERTS_ENABLED: "1",
  BETTER_AUTH_URL: "https://smartmanuai.vercel.app",
  BREVO_API_KEY: "fixture-only",
  EMAIL_FROM: "sender@example.test",
  SMARTMANU_OPERATOR_EMAIL: "operator@example.test",
  CRON_SECRET: "a".repeat(64),
  BREVO_WEBHOOK_SECRET: "b".repeat(64),
  NOTIFICATION_UNSUBSCRIBE_KEY: "c".repeat(64),
};
const config = liveEmailConfig(env);
test("live email configuration fails closed; callbacks and opt-out survive send kill switch", () => {
  assert.throws(() =>
    liveEmailConfig({ ...env, SMARTMANU_EMAIL_ALERTS_ENABLED: "0" }),
  );
  assert.throws(() =>
    liveEmailConfig({ ...env, BETTER_AUTH_URL: "https://example.test/path" }),
  );
  assert.throws(() => requireBearer(new Headers(), config.cronSecret));
  requireBearer(
    new Headers({ authorization: "Bearer " + config.cronSecret }),
    config.cronSecret,
  );
  assert.equal(
    brevoCallbackConfig({
      ...env,
      SMARTMANU_EMAIL_ALERTS_ENABLED: "0",
      BREVO_API_KEY: undefined,
      CRON_SECRET: undefined,
    }).controls.mode,
    "production",
  );
  assert.throws(() =>
    verifyEmailWebhook(Buffer.from("{}"), new Headers(), config.controls),
  );
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: live consent, safe provider setup, one send, callbacks, unsubscribe and privacy`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "live-email-")),
        schema = "live_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", "-c search_path=" + schema);
        url = parsed.href;
      }
      const db = await openDatabase(dir, url),
        sql = db.sql;
      try {
        await seedLocalCatalogue(sql);
        for (const id of ["a", "b"]) {
          await sql.query(
            "INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,NOW(),NOW())",
            [id, id + "@example.test"],
          );
          await saveProfile(sql, id, {});
        }
        const save = async (id: string, enabled = true) =>
          saveLiveEmailSettings(
            sql,
            id,
            {
              expectedVersion: (await liveEmailSettings(sql, id, config))
                .version,
              enabled,
              consent: true,
              frequency: "daily",
              timezone: "UTC",
            },
            config,
          );
        await assert.rejects(() => save("a"), /callbacks/);
        const calls: {
          url: string;
          method: string;
          body: Record<string, unknown>;
        }[] = [];
        const provider: typeof fetch = async (url, init) => {
          calls.push({
            url: String(url),
            method: init?.method ?? "GET",
            body: init?.body ? JSON.parse(String(init.body)) : {},
          });
          return init?.method === "GET"
            ? Response.json({
                webhooks: [
                  { id: 99, url: "https://another-project.test/callback" },
                ],
              })
            : Response.json({ id: 123 }, { status: 201 });
        };
        await registerBrevoAlertWebhook(sql, config, provider);
        assert.equal(calls.length, 2);
        assert.equal(calls[1].method, "POST");
        assert.equal(calls[1].body.type, "transactional");
        assert.deepEqual(calls[1].body.auth, {
          type: "bearer",
          token: config.webhookSecret,
        });
        assert.ok(!calls.some((c) => c.url.endsWith("/99")));
        const updates: string[] = [];
        await registerBrevoAlertWebhook(sql, config, async (_, init) => {
          updates.push(init!.method!);
          if (init!.method === "GET")
            return Response.json({
              webhooks: [
                { id: 123, url: config.origin + "/api/webhooks/brevo-alerts" },
              ],
            });
          assert.equal(JSON.parse(String(init!.body)).type, undefined);
          return new Response(null, { status: 204 });
        });
        assert.deepEqual(updates, ["GET", "PUT"]);
        await assert.rejects(
          () =>
            registerBrevoAlertWebhook(sql, config, async () =>
              Response.json({ unexpected: [] }),
            ),
          /setup failed/,
        );
        await sql.query(
          "INSERT INTO notification_preferences(user_id,enabled,channel,consent_version) VALUES('a',true,'email','local-sink-v1')",
        );
        assert.equal(
          (await liveEmailSettings(sql, "a", config)).enabled,
          false,
        );
        await assert.rejects(
          () => queueLiveEmail(sql, "a", config, "test"),
          /fresh consent/,
        );
        await save("a");
        await save("b");
        assert.equal(
          (
            await sql.query(
              "SELECT consent_version FROM notification_preferences WHERE user_id='a'",
            )
          ).rows[0].consent_version,
          LIVE_EMAIL_CONSENT,
        );
        const now = new Date();
        await sql.query(
          "UPDATE notification_preferences SET next_due_at=$1 WHERE user_id='a'",
          [new Date(now.getTime() - 1000).toISOString()],
        );
        assert.equal(
          await queueLiveEmail(sql, "a", config, "digest", now),
          null,
          "synthetic records must never be emailed",
        );
        const id = (await queueLiveEmail(sql, "a", config, "test"))!;
        let sends = 0,
          token = "";
        const send = async (request: { body: string }) => {
          sends++;
          const body = JSON.parse(request.body);
          assert.equal(body.to[0].email, "a@example.test");
          assert.match(body.htmlContent, /not an application opportunity/);
          assert.equal(
            body.headers["X-Mailin-custom"],
            "smartmanuai-alert:" + id,
          );
          token = /token=([A-Za-z0-9_.-]+)/.exec(body.htmlContent)![1];
          return {
            status: 201,
            headers: {},
            body: { messageId: "<test-receipt@example.test>" },
          };
        };
        const outcomes = await Promise.all([
          dispatchLiveEmail(sql, id, config, send),
          dispatchLiveEmail(sql, id, config, send),
        ]);
        assert.equal(sends, 1);
        assert.ok(outcomes.includes("accepted"));
        assert.ok(outcomes.includes("not_pending"));
        const callback = {
          event: "delivered",
          email: "a@example.test",
          "message-id": "<test-receipt@example.test>",
          "X-Mailin-custom": "smartmanuai-alert:" + id,
          ts_event: Math.floor(Date.now() / 1000),
        };
        assert.equal(
          await processBrevoAlertWebhook(
            sql,
            { ...callback, email: "b@example.test" },
            config,
          ),
          "ignored",
        );
        assert.equal(
          await processBrevoAlertWebhook(
            sql,
            { ...callback, "message-id": "wrong" },
            config,
          ),
          "ignored",
        );
        assert.equal(
          await processBrevoAlertWebhook(sql, { event: "delivered" }, config),
          "ignored",
        );
        assert.equal(
          await processBrevoAlertWebhook(sql, callback, config),
          "processed",
        );
        assert.equal(
          await processBrevoAlertWebhook(sql, callback, config),
          "duplicate",
        );
        assert.equal(
          (await liveEmailSettings(sql, "b", config)).history.length,
          0,
        );
        assert.equal(
          (await liveEmailSettings(sql, "a", config)).history[0].provider_state,
          "delivered",
        );
        const pending = (await queueLiveEmail(sql, "a", config, "test"))!;
        await unsubscribeEmail(sql, token, config.controls);
        assert.equal(
          (await liveEmailSettings(sql, "a", config)).enabled,
          false,
        );
        assert.equal(
          await dispatchLiveEmail(sql, pending, config, send),
          "not_pending",
        );
        await save("a");
        await unsubscribeEmail(sql, token, config.controls);
        assert.equal(
          (await liveEmailSettings(sql, "a", config)).enabled,
          true,
          "old consent token cannot pause fresh consent",
        );
        await processBrevoAlertWebhook(
          sql,
          { ...callback, event: "hard_bounce" },
          config,
        );
        await processBrevoAlertWebhook(sql, callback, config);
        assert.equal(
          await emailSuppression(sql, "a", config.controls),
          "bounce",
        );
        assert.equal(
          (await liveEmailSettings(sql, "a", config)).history.find(
            (r) => r.id === id,
          )?.provider_state,
          "hard_bounce",
        );
        assert.equal(
          (await accountExport(sql, "a")).liveEmailDeliveries.length,
          2,
        );
        const other = (await queueLiveEmail(sql, "b", config, "test"))!;
        await requestAccountDeletion(sql, "b", { confirmation: "DELETE" });
        assert.equal(
          await dispatchLiveEmail(sql, other, config, send),
          "not_pending",
        );
        await purgeOneAccount(sql, dir);
        assert.equal(
          (
            await sql.query(
              "SELECT 1 FROM live_email_deliveries WHERE user_id='b'",
            )
          ).rows.length,
          0,
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
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: real-record freshness, deduplication, uncertain recovery and daily limits`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "live-digest-")),
        schema = "live_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", "-c search_path=" + schema);
        url = parsed.href;
      }
      const db = await openDatabase(dir, url),
        sql = db.sql;
      try {
        await seedLocalCatalogue(sql);
        await sql.query(
          "INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES('owner','Owner','owner@example.test',true,NOW(),NOW())",
        );
        await saveProfile(sql, "owner", {});
        await sql.query(
          "INSERT INTO live_email_provider(id,webhook_id,configuration_hash) VALUES(1,123,$1)",
          [config.configurationHash],
        );
        await saveLiveEmailSettings(
          sql,
          "owner",
          {
            expectedVersion: 0,
            enabled: true,
            consent: true,
            frequency: "daily",
            timezone: "UTC",
          },
          config,
        );
        // An isolated fixture stands in for a reviewed real source; never used on the hosted database.
        await sql.query(
          "UPDATE sources SET synthetic=false WHERE id=(SELECT source_id FROM opportunities WHERE id='synthetic-course')",
        );
        const now = new Date();
        await sql.query("UPDATE opportunities SET verified_at=$1", [
          now.toISOString(),
        ]);
        const due = async (offset: number) =>
          sql.query(
            "UPDATE notification_preferences SET next_due_at=$1 WHERE user_id='owner'",
            [new Date(now.getTime() - offset).toISOString()],
          );
        await due(1000);
        const id = (await queueLiveEmail(sql, "owner", config, "digest", now))!;
        assert.ok(id);
        await due(2000);
        assert.equal(
          await queueLiveEmail(sql, "owner", config, "digest", now),
          null,
        );
        await sql.query("UPDATE opportunities SET verified_at=$1", [
          new Date(now.getTime() - 90000000).toISOString(),
        ]);
        let sent = 0;
        assert.equal(
          await dispatchLiveEmail(
            sql,
            id,
            config,
            async () => {
              sent++;
              throw Error("must not send");
            },
            now,
          ),
          "suppressed",
        );
        assert.equal(sent, 0);
        await sql.query(
          "INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES('digest','Digest','digest@example.test',true,NOW(),NOW())",
        );
        await saveProfile(sql, "digest", {});
        await saveLiveEmailSettings(
          sql,
          "digest",
          {
            expectedVersion: 0,
            enabled: true,
            consent: true,
            frequency: "daily",
            timezone: "UTC",
          },
          config,
          now,
        );
        await sql.query("UPDATE opportunities SET verified_at=$1", [
          now.toISOString(),
        ]);
        await sql.query(
          "UPDATE notification_preferences SET next_due_at=$1 WHERE user_id='digest'",
          [new Date(now.getTime() - 3000).toISOString()],
        );
        const digest = (await queueLiveEmail(
          sql,
          "digest",
          config,
          "digest",
          now,
        ))!;
        assert.ok(digest);
        assert.equal(
          await dispatchLiveEmail(
            sql,
            digest,
            config,
            async (request) => {
              const payload = JSON.parse(request.body);
              assert.match(payload.htmlContent, /Smart Manufacturing Basics/);
              assert.match(
                payload.htmlContent,
                /smartmanuai.vercel.app\/opportunities/,
              );
              assert.ok(!payload.htmlContent.includes("LOCAL DIGEST PREVIEW"));
              return {
                status: 201,
                headers: {},
                body: { messageId: "digest@example.test" },
              };
            },
            now,
          ),
          "accepted",
        );
        const uncertain = (await queueLiveEmail(
          sql,
          "owner",
          config,
          "test",
          now,
        ))!;
        assert.equal(
          await dispatchLiveEmail(
            sql,
            uncertain,
            config,
            async () => {
              sent++;
              throw Error("network interrupted");
            },
            now,
          ),
          "uncertain",
        );
        assert.equal(
          await dispatchLiveEmail(sql, uncertain, config),
          "not_pending",
        );
        await processBrevoAlertWebhook(
          sql,
          {
            event: "delivered",
            email: "owner@example.test",
            "message-id": "recovered@example.test",
            "X-Mailin-custom": "smartmanuai-alert:" + uncertain,
            ts_event: Math.floor(now.getTime() / 1000),
          },
          config,
        );
        assert.equal(
          (
            await sql.query(
              "SELECT state FROM live_email_deliveries WHERE id=$1",
              [uncertain],
            )
          ).rows[0].state,
          "accepted",
        );
        const third = (await queueLiveEmail(
          sql,
          "owner",
          config,
          "test",
          now,
        ))!;
        assert.equal(
          await dispatchLiveEmail(
            sql,
            third,
            config,
            async () => ({
              status: 201,
              headers: {},
              body: { messageId: "third@example.test" },
            }),
            now,
          ),
          "accepted",
        );
        const fourth = (await queueLiveEmail(
          sql,
          "owner",
          config,
          "test",
          now,
        ))!;
        assert.equal(
          await dispatchLiveEmail(
            sql,
            fourth,
            config,
            async () => {
              sent++;
              throw Error("must not send");
            },
            now,
          ),
          "failed",
        );
        assert.equal(sent, 1);
        const crashed = (await queueLiveEmail(
          sql,
          "owner",
          config,
          "test",
          now,
        ))!;
        await sql.query(
          "UPDATE live_email_deliveries SET state='dispatching',started_at=$2 WHERE id=$1",
          [crashed, new Date(now.getTime() - 600000).toISOString()],
        );
        await runLiveEmailCycle(sql, config, now);
        assert.equal(
          (
            await sql.query(
              "SELECT state FROM live_email_deliveries WHERE id=$1",
              [crashed],
            )
          ).rows[0].state,
          "uncertain",
        );
        assert.equal(
          (
            await liveEmailSettings(sql, "owner", {
              ...config,
              configurationHash: "rotated",
            })
          ).providerConnected,
          false,
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
