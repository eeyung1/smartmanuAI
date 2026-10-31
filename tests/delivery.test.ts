import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import {
  seedLocalCatalogue,
  fixtureDetails,
  fixtureEvidence,
} from "../src/catalogue/fixtures";
import { createDraft, reviewOpportunity } from "../src/catalogue/service";
import { saveProfile } from "../src/domain/profile";
import {
  saveNotificationSettings,
  readNotificationSettings,
  planOneDigest,
  dispatchDigest,
} from "../src/jobs/digests";
import {
  issueTelegramLink,
  handleTelegramUpdate,
  telegramConfig,
  changeTelegramBinding,
  telegramStatus,
} from "../src/channels/telegram";
import {
  simulationAdapter,
  buildSimulationRequest,
  simulationPayloadSchema,
} from "../src/delivery/adapters";
import {
  prepareDeliverySimulation,
  claimDelivery,
  finishDelivery,
  runDeliverySimulation,
  deliverySimulationConfig,
} from "../src/delivery/simulation";
process.env.SMARTMANU_DELIVERY_MODE = "local";
process.env.DELIVERY_SIMULATION_KEY = randomBytes(32).toString("hex");
process.env.SMARTMANU_EMAIL_MODE = "local";
process.env.EMAIL_WEBHOOK_SIGNING_SECRET =
  "whsec_" + randomBytes(32).toString("base64");
process.env.NOTIFICATION_UNSUBSCRIBE_KEY = randomBytes(32).toString("hex");
process.env.SMARTMANU_TELEGRAM_MODE = "local";
process.env.TELEGRAM_WEBHOOK_SECRET = randomBytes(32).toString("hex");
process.env.TELEGRAM_LINK_ENCRYPTION_KEY = randomBytes(32).toString("hex");
const payload = simulationPayloadSchema.parse({
  mode: "local_sink",
  translationFallback: true,
  items: [
    {
      id: "fixture",
      title: '<script>alert("unsafe")</script>',
      funding: "free_participation",
      deadline: null,
      applicationFee: null,
      certificateFee: "USD 20",
      synthetic: true,
    },
  ],
  unsubscribe: {
    landingPath: "/unsubscribe?token=local.fake",
    postPath: "/api/notifications/unsubscribe?token=local.fake",
    postBody: "List-Unsubscribe=One-Click",
  },
});
test("simulation adapters build safe bounded requests and distinguish rejection from ambiguity", async () => {
  assert.throws(() => deliverySimulationConfig({}));
  const request = buildSimulationRequest(
    "email",
    "student@example.test",
    payload,
    "stable-key",
  );
  const body = JSON.parse(request.body);
  assert.equal(request.headers["Idempotency-Key"], "stable-key");
  assert.ok(body.html.includes("&lt;script&gt;"));
  assert.ok(!body.html.includes("<script>"));
  assert.equal(
    body.headers["List-Unsubscribe-Post"],
    "List-Unsubscribe=One-Click",
  );
  assert.throws(() =>
    buildSimulationRequest("email", "student@example.com", payload, "key"),
  );
  const telegram = JSON.parse(
    buildSimulationRequest("telegram", "123456", payload, "key").body,
  );
  assert.equal(telegram.allow_paid_broadcast, false);
  assert.equal(telegram.parse_mode, undefined);
  assert.ok(telegram.text.length <= 4096);
  assert.ok(telegram.text.includes("USD 20"));
  const adapter = (
    status: number,
    response: unknown,
    headers: Record<string, string> = {},
  ) =>
    simulationAdapter("email", async () => ({
      status,
      headers,
      body: response,
    }));
  assert.equal(
    (await adapter(200, { id: "provider-id" }).send(request)).state,
    "accepted",
  );
  assert.equal((await adapter(500, {}).send(request)).state, "uncertain");
  assert.equal((await adapter(200, {}).send(request)).state, "uncertain");
  assert.equal((await adapter(401, {}).send(request)).state, "failed");
  assert.equal(
    (await adapter(409, { name: "invalid_idempotent_request" }).send(request))
      .state,
    "failed",
  );
  assert.equal(
    (
      await adapter(409, { name: "concurrent_idempotent_requests" }).send(
        request,
      )
    ).state,
    "retry",
  );
  const rate = await adapter(429, {}, { "Retry-After": "120" }).send(request);
  assert.equal(rate.state, "retry");
  if (rate.state === "retry") assert.equal(rate.delaySeconds, 120);
  assert.equal(
    (
      await simulationAdapter("telegram", async () => ({
        status: 403,
        headers: {},
        body: { ok: false },
      })).send(request)
    ).state,
    "failed",
  );
  assert.equal(
    (
      await simulationAdapter("telegram", async () => {
        throw Error("network timeout");
      }).send(request)
    ).state,
    "uncertain",
  );
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: delivery snapshots, quota rollback, retry caps, crash uncertainty and binding revocation`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-delivery-")),
        schema = "delivery_" + randomUUID().replaceAll("-", "");
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
        const user = "delivery-user",
          admin = "local-fixture-reviewer";
        await db.sql.query(
          "INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES($1,'Delivery user','delivery@example.test',true,NOW(),NOW())",
          [user],
        );
        await saveProfile(db.sql, user, {});
        const base = {
          enabled: true,
          channel: "email",
          frequency: "daily",
          timezone: "UTC",
          consent: true,
        };
        await saveNotificationSettings(db.sql, user, {
          ...base,
          expectedVersion: 0,
        });
        let slot = 0;
        async function digest(newItem = false) {
          if (newItem) {
            const sourceId = (
              await db.sql.query(
                "SELECT source_id FROM opportunities WHERE id='synthetic-course'",
              )
            ).rows[0].source_id;
            const draft = await createDraft(db.sql, admin, {
              sourceId,
              details: { ...fixtureDetails, title: "Delivery fixture " + slot },
              evidence: fixtureEvidence,
              note: "Synthetic outbound test fixture.",
            });
            await reviewOpportunity(db.sql, admin, draft.id, {
              action: "publish",
              expectedRevision: 1,
              verified: true,
              note: "Approve synthetic outbound fixture.",
            });
          }
          await db.sql.query(
            "UPDATE notification_preferences SET next_due_at=$2 WHERE user_id=$1",
            [user, new Date(Date.now() - ++slot * 86400000).toISOString()],
          );
          assert.equal(await planOneDigest(db.sql), "queued");
          assert.equal(await dispatchDigest(db.sql), "accepted");
          return prepareDeliverySimulation(db.sql, user);
        }
        const first = await digest();
        assert.equal(
          (await prepareDeliverySimulation(db.sql, user)).id,
          first.id,
        );
        assert.ok(
          !JSON.stringify(
            (
              await db.sql.query(
                "SELECT sealed_request FROM delivery_simulations",
              )
            ).rows,
          ).includes("delivery@example.test"),
        );
        let claim = await claimDelivery(db.sql, { daily: 10, monthly: 1 });
        assert.ok(claim);
        const frozen = claim.request.body;
        assert.equal(
          await finishDelivery(db.sql, claim, {
            state: "retry",
            delaySeconds: 120,
            code: "rate_limited",
          }),
          "retry",
        );
        assert.equal(
          await claimDelivery(db.sql, { daily: 10, monthly: 10 }),
          null,
        );
        await db.sql.query(
          "UPDATE delivery_simulations SET available_at=NOW() WHERE id=$1",
          [first.id],
        );
        assert.equal(
          await claimDelivery(db.sql, { daily: 10, monthly: 1 }),
          null,
        );
        assert.equal(
          Number(
            (
              await db.sql.query(
                "SELECT reserved FROM delivery_simulation_quota WHERE period_kind='day'",
              )
            ).rows[0].reserved,
          ),
          1,
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT state FROM delivery_simulations WHERE id=$1",
              [first.id],
            )
          ).rows[0].state,
          "quota_wait",
        );
        await db.sql.query("UPDATE delivery_simulation_quota SET reserved=0");
        await db.sql.query(
          "UPDATE delivery_simulations SET available_at=NOW() WHERE id=$1",
          [first.id],
        );
        claim = await claimDelivery(db.sql, { daily: 10, monthly: 10 });
        assert.ok(claim);
        assert.equal(claim.request.body, frozen);
        await finishDelivery(db.sql, claim, {
          state: "retry",
          delaySeconds: 60,
          code: "rate_limited",
        });
        await db.sql.query(
          "UPDATE delivery_simulations SET available_at=NOW() WHERE id=$1",
          [first.id],
        );
        claim = await claimDelivery(db.sql, { daily: 10, monthly: 10 });
        assert.ok(claim);
        assert.equal(
          await finishDelivery(db.sql, claim, {
            state: "retry",
            delaySeconds: 60,
            code: "rate_limited",
          }),
          "failed",
        );
        const second = await digest(true);
        const abandoned = await claimDelivery(db.sql, {
          daily: 10,
          monthly: 10,
        });
        assert.ok(abandoned);
        await db.sql.query(
          "UPDATE delivery_simulations SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1",
          [second.id],
        );
        await db.close();
        db = await openDatabase(dir, url);
        assert.equal(
          await claimDelivery(db.sql, { daily: 10, monthly: 10 }),
          null,
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT state FROM delivery_simulations WHERE id=$1",
              [second.id],
            )
          ).rows[0].state,
          "uncertain",
        );
        assert.equal(
          await finishDelivery(db.sql, abandoned, {
            state: "accepted",
            id: "late-acceptance",
          }),
          "discarded",
        );
        await db.sql.query(
          "UPDATE delivery_simulations SET state='retry',available_at=NOW(),first_attempt_at=NOW()-INTERVAL '24 hours' WHERE id=$1",
          [second.id],
        );
        assert.equal(
          await claimDelivery(db.sql, { daily: 10, monthly: 10 }),
          null,
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT error_code FROM delivery_simulations WHERE id=$1",
              [second.id],
            )
          ).rows[0].error_code,
          "retry_window_expired",
        );
        const paused = await digest(true);
        await saveNotificationSettings(db.sql, user, {
          ...base,
          enabled: false,
          consent: false,
          expectedVersion: (await readNotificationSettings(db.sql, user))
            .version,
        });
        assert.equal(
          await claimDelivery(db.sql, { daily: 10, monthly: 10 }),
          null,
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT state FROM delivery_simulations WHERE id=$1",
              [paused.id],
            )
          ).rows[0].state,
          "suppressed",
        );
        await saveNotificationSettings(db.sql, user, {
          ...base,
          expectedVersion: (await readNotificationSettings(db.sql, user))
            .version,
        });
        await digest(true);
        let calls = 0;
        const email = simulationAdapter("email", async () => {
          calls++;
          return {
            status: 200,
            headers: {},
            body: { id: "simulation-provider-id" },
          };
        });
        const telegram = simulationAdapter("telegram", async () => ({
          status: 403,
          headers: {},
          body: { ok: false },
        }));
        assert.equal(
          await runDeliverySimulation(
            db.sql,
            { email, telegram },
            { daily: 20, monthly: 20 },
          ),
          "accepted",
        );
        assert.equal(
          await runDeliverySimulation(
            db.sql,
            { email, telegram },
            { daily: 20, monthly: 20 },
          ),
          "empty_or_suppressed",
        );
        assert.equal(calls, 1);
        await db.sql.query(
          "UPDATE delivery_simulations SET mapping_pending=true WHERE provider_id='simulation-provider-id'",
        );
        await db.sql.query(
          "DELETE FROM email_digest_attempts WHERE message_id='simulation-provider-id'",
        );
        await runDeliverySimulation(
          db.sql,
          { email, telegram },
          { daily: 20, monthly: 20 },
        );
        assert.equal(calls, 1);

        assert.equal(
          (
            await db.sql.query(
              "SELECT mapping_pending FROM delivery_simulations WHERE provider_id='simulation-provider-id'",
            )
          ).rows[0].mapping_pending,
          false,
        );
        const link = await issueTelegramLink(db.sql, user);
        await handleTelegramUpdate(
          db.sql,
          {
            update_id: 1,
            message: {
              date: Math.floor(Date.now() / 1000),
              chat: { id: 123456, type: "private" },
              from: { id: 123456, is_bot: false },
              text: link.startCommand,
            },
          },
          telegramConfig(),
        );
        await changeTelegramBinding(db.sql, user, {
          action: "confirm",
          expectedVersion: 1,
        });
        await saveNotificationSettings(db.sql, user, {
          ...base,
          channel: "telegram",
          expectedVersion: (await readNotificationSettings(db.sql, user))
            .version,
        });
        await digest(true);
        assert.equal(
          await runDeliverySimulation(
            db.sql,
            { email, telegram },
            { daily: 20, monthly: 20 },
          ),
          "failed",
        );
        assert.equal((await telegramStatus(db.sql, user)).state, "revoked");
        assert.equal(
          (await readNotificationSettings(db.sql, user)).enabled,
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
