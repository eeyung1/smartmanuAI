import {
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import type { SQL } from "../db";
import { CatalogueError } from "../catalogue/service";
import {
  telegramConfig,
  decryptChat,
  changeTelegramBinding,
} from "../channels/telegram";
import {
  emailControlsConfig,
  emailSuppression,
  recordEmailDigestAttempt,
} from "../channels/email-controls";
import { matchesForUser, materialFingerprint } from "../domain/matching";
import {
  buildSimulationRequest,
  simulationPayloadSchema,
  type ProviderRequest,
  type SimulationAdapter,
  type Outcome,
} from "./adapters";
export function deliverySimulationConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (
    env.SMARTMANU_DELIVERY_MODE !== "local" ||
    !env.DELIVERY_SIMULATION_KEY?.match(/^[a-f0-9]{64}$/i)
  )
    throw new CatalogueError(503, "Outbound simulation is unavailable.");
  return { key: Buffer.from(env.DELIVERY_SIMULATION_KEY, "hex") };
}
const seal = (value: unknown, userId: string, key: Buffer) => {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("delivery:" + userId));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: data.toString("base64url"),
  });
};
function open(value: string, userId: string, key: Buffer) {
  const v = JSON.parse(value),
    cipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(v.iv, "base64url"),
    );
  cipher.setAAD(Buffer.from("delivery:" + userId));
  cipher.setAuthTag(Buffer.from(v.tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(v.data, "base64url")),
      cipher.final(),
    ]).toString("utf8"),
  ) as { request: ProviderRequest; recipient: string };
}
export async function deliveryHistory(sql: SQL, userId: string) {
  return (
    await sql.query(
      "SELECT id,channel,state,attempts,error_code,created_at,mapping_pending FROM delivery_simulations WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 20",
      [userId],
    )
  ).rows;
}
export async function prepareDeliverySimulation(sql: SQL, userId: string) {
  const config = deliverySimulationConfig();
  return sql.transaction(async (tx) => {
    await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
      userId,
    ]);
    const pref = (
      await tx.query(
        "SELECT * FROM notification_preferences WHERE user_id=$1 FOR SHARE",
        [userId],
      )
    ).rows[0];
    if (!pref?.enabled || pref.consent_version !== "local-sink-v1")
      throw new CatalogueError(409, "Enable local digests first.");
    const digest = (
      await tx.query(
        "SELECT * FROM notification_digests WHERE user_id=$1 AND state='accepted' AND preference_version=$2 ORDER BY created_at DESC,id LIMIT 1",
        [userId, pref.version],
      )
    ).rows[0];
    if (!digest)
      throw new CatalogueError(
        409,
        "No accepted local digest for the current settings.",
      );
    const existing = (
      await tx.query(
        "SELECT id,state FROM delivery_simulations WHERE digest_id=$1",
        [digest.id],
      )
    ).rows[0];
    if (existing) return existing;
    const payload = simulationPayloadSchema.parse(digest.payload);
    let recipient: string,
      bindingVersion: number | null = null;
    if (pref.channel === "email") {
      recipient = String(
        (await tx.query("SELECT email FROM auth_user WHERE id=$1", [userId]))
          .rows[0].email,
      );
      if (await emailSuppression(tx, userId, emailControlsConfig()))
        throw new CatalogueError(409, "Email destination is suppressed.");
    } else {
      const binding = (
        await tx.query(
          "SELECT * FROM telegram_bindings WHERE user_id=$1 AND state='active'",
          [userId],
        )
      ).rows[0];
      if (!binding)
        throw new CatalogueError(
          409,
          "Confirm a local Telegram binding first.",
        );
      recipient = decryptChat(
        String(binding.encrypted_chat),
        userId,
        telegramConfig(),
      );
      bindingVersion = Number(binding.version);
    }
    const id = randomUUID(),
      request = buildSimulationRequest(
        pref.channel as "email" | "telegram",
        recipient,
        payload,
        "simulation/" + id,
      );
    await tx.query(
      "INSERT INTO delivery_simulations(id,user_id,digest_id,channel,preference_version,binding_version,sealed_request) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id,
        userId,
        digest.id,
        pref.channel,
        pref.version,
        bindingVersion,
        seal({ request, recipient }, userId, config.key),
      ],
    );
    return { id, state: "ready" };
  });
}
async function reserveQuota(
  tx: SQL,
  channel: string,
  limits: { daily: number; monthly: number },
  now: Date,
) {
  for (const [kind, period, limit] of [
    ["day", now.toISOString().slice(0, 10), limits.daily],
    ["month", now.toISOString().slice(0, 7), limits.monthly],
  ] as const) {
    await tx.query(
      "INSERT INTO delivery_simulation_quota(channel,period_kind,period_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [channel, kind, period],
    );
    if (
      !(
        await tx.query(
          "UPDATE delivery_simulation_quota SET reserved=reserved+1 WHERE channel=$1 AND period_kind=$2 AND period_key=$3 AND reserved<$4 RETURNING reserved",
          [channel, kind, period, limit],
        )
      ).rows.length
    )
      throw new CatalogueError(429, "simulation_quota_" + kind);
  }
}
export async function claimDelivery(
  sql: SQL,
  limits: { daily: number; monthly: number },
  now = new Date(),
) {
  for (const limit of [limits.daily, limits.monthly])
    if (!Number.isSafeInteger(limit) || limit <= 0)
      throw Error("Explicit positive simulation quotas are required.");
  await sql.query(
    "UPDATE delivery_simulations SET state='uncertain',error_code='worker_lost' WHERE state='sending' AND lease_until<=$1",
    [now.toISOString()],
  );
  const candidate = (
    await sql.query(
      "SELECT id,user_id FROM delivery_simulations WHERE state IN ('ready','retry','quota_wait') AND available_at<=$1 ORDER BY created_at,id LIMIT 1",
      [now.toISOString()],
    )
  ).rows[0];
  if (!candidate) return null;
  try {
    return await sql.transaction(async (tx) => {
      await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
        candidate.user_id,
      ]);
      const pref = (
        await tx.query(
          "SELECT * FROM notification_preferences WHERE user_id=$1 FOR SHARE",
          [candidate.user_id],
        )
      ).rows[0];
      const job = (
        await tx.query(
          "SELECT * FROM delivery_simulations WHERE id=$1 AND state IN ('ready','retry','quota_wait') AND available_at<=$2 FOR UPDATE SKIP LOCKED",
          [candidate.id, now.toISOString()],
        )
      ).rows[0];
      if (!job) return null;
      if (
        job.attempts &&
        job.first_attempt_at &&
        now.getTime() - new Date(String(job.first_attempt_at)).getTime() >=
          23 * 3600000
      ) {
        await tx.query(
          "UPDATE delivery_simulations SET state='uncertain',error_code='retry_window_expired' WHERE id=$1",
          [job.id],
        );
        return null;
      }
      if (
        now.getTime() - new Date(String(job.created_at)).getTime() >=
        24 * 3600000
      ) {
        await tx.query(
          "UPDATE delivery_simulations SET state='suppressed',error_code='snapshot_expired' WHERE id=$1",
          [job.id],
        );
        return null;
      }

      let valid =
        pref?.enabled === true &&
        pref.consent_version === "local-sink-v1" &&
        pref.version === job.preference_version &&
        pref.channel === job.channel;
      const snapshot = open(
        String(job.sealed_request),
        String(job.user_id),
        deliverySimulationConfig().key,
      );
      if (valid && job.channel === "email") {
        const user = (
          await tx.query("SELECT email FROM auth_user WHERE id=$1", [
            job.user_id,
          ])
        ).rows[0];
        valid =
          user?.email === snapshot.recipient &&
          !(await emailSuppression(
            tx,
            String(job.user_id),
            emailControlsConfig(),
          ));
      }
      if (valid && job.channel === "telegram") {
        const binding = (
          await tx.query("SELECT * FROM telegram_bindings WHERE user_id=$1", [
            job.user_id,
          ])
        ).rows[0];
        valid =
          binding?.state === "active" &&
          binding.version === job.binding_version;
      }
      const events = (
        await tx.query(
          "SELECT opportunity_id,fingerprint FROM notification_digest_events WHERE digest_id=$1",
          [job.digest_id],
        )
      ).rows;
      await tx.query(
        "SELECT user_id FROM profiles WHERE user_id=$1 FOR SHARE",
        [job.user_id],
      );
      await tx.query(
        "SELECT id FROM opportunities WHERE id IN (SELECT opportunity_id FROM notification_digest_events WHERE digest_id=$1) ORDER BY id FOR SHARE",
        [job.digest_id],
      );
      const matches = valid
        ? await matchesForUser(tx, String(job.user_id), 1, 1000)
        : null;
      const current = new Map(matches?.items.map((item) => [item.id, item]));
      for (const event of events) {
        const match = current.get(String(event.opportunity_id));
        if (!match || materialFingerprint(match.details) !== event.fingerprint)
          valid = false;
      }
      const fresh = Number(
        (
          await tx.query(
            "SELECT COUNT(*) AS n FROM opportunities WHERE id IN (SELECT opportunity_id FROM notification_digest_events WHERE digest_id=$1) AND verified_at>=$2",
            [job.digest_id, new Date(now.getTime() - 86400000).toISOString()],
          )
        ).rows[0].n,
      );
      if (!events.length || fresh !== events.length) valid = false;
      if (!valid) {
        await tx.query(
          "UPDATE delivery_simulations SET state='suppressed',error_code='current_state_changed' WHERE id=$1",
          [job.id],
        );
        return null;
      }
      await reserveQuota(tx, String(job.channel), limits, now);
      const token = randomUUID();
      await tx.query(
        "UPDATE delivery_simulations SET state='sending',attempts=attempts+1,lease_token=$2,lease_until=$3,first_attempt_at=COALESCE(first_attempt_at,$4) WHERE id=$1",
        [
          job.id,
          token,
          new Date(now.getTime() + 60000).toISOString(),
          now.toISOString(),
        ],
      );
      return {
        id: String(job.id),
        userId: String(job.user_id),
        channel: job.channel as "email" | "telegram",
        token,
        request: snapshot.request,
        recipient: snapshot.recipient,
        bindingVersion: Number(job.binding_version),
        attempts: Number(job.attempts) + 1,
      };
    });
  } catch (e) {
    if (e instanceof CatalogueError && e.status === 429) {
      const monthly = e.message.endsWith("month");
      const next = monthly
        ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
        : new Date(
            Date.UTC(
              now.getUTCFullYear(),
              now.getUTCMonth(),
              now.getUTCDate() + 1,
            ),
          );
      await sql.query(
        "UPDATE delivery_simulations SET state='quota_wait',available_at=$2,error_code=$3 WHERE id=$1 AND state IN ('ready','retry','quota_wait')",
        [candidate.id, next.toISOString(), e.message],
      );
      return null;
    }
    throw e;
  }
}
export type DeliveryClaim = NonNullable<
  Awaited<ReturnType<typeof claimDelivery>>
>;
export async function finishDelivery(
  sql: SQL,
  claim: DeliveryClaim,
  outcome: Outcome,
  now = new Date(),
) {
  const state =
    outcome.state === "retry" && claim.attempts >= 3 ? "failed" : outcome.state;
  const changed = await sql.query(
    "UPDATE delivery_simulations SET state=$3,provider_id=$4,error_code=$5,available_at=$6,lease_token=NULL,lease_until=NULL,mapping_pending=$7 WHERE id=$1 AND state='sending' AND lease_token=$2 AND lease_until>$8 RETURNING id",
    [
      claim.id,
      claim.token,
      state,
      outcome.state === "accepted" ? outcome.id : null,
      outcome.state === "accepted" ? null : outcome.code,
      new Date(
        now.getTime() +
          (outcome.state === "retry"
            ? Math.max(60, outcome.delaySeconds) * 1000
            : 0),
      ).toISOString(),
      state === "accepted" && claim.channel === "email",
      now.toISOString(),
    ],
  );
  if (!changed.rows.length) return "discarded";
  if (outcome.state === "accepted" && claim.channel === "email") {
    try {
      await recordEmailDigestAttempt(
        sql,
        claim.userId,
        outcome.id,
        claim.recipient,
        emailControlsConfig(),
      );
      await sql.query(
        "UPDATE delivery_simulations SET mapping_pending=false WHERE id=$1",
        [claim.id],
      );
    } catch {
      /* Acceptance is durable: mapping repair must never resend. */
    }
  }
  if (outcome.state === "failed" && outcome.code === "telegram_forbidden") {
    try {
      await changeTelegramBinding(sql, claim.userId, {
        action: "disconnect",
        expectedVersion: claim.bindingVersion,
      });
    } catch {
      /* A newer binding must not be revoked. */
    }
  }
  return state;
}
export async function repairSimulationEmailMapping(sql: SQL) {
  const job = (
    await sql.query(
      "SELECT id,user_id,provider_id,sealed_request FROM delivery_simulations WHERE state='accepted' AND channel='email' AND mapping_pending ORDER BY created_at,id LIMIT 1",
    )
  ).rows[0];
  if (!job) return false;
  try {
    const snapshot = open(
      String(job.sealed_request),
      String(job.user_id),
      deliverySimulationConfig().key,
    );
    await recordEmailDigestAttempt(
      sql,
      String(job.user_id),
      String(job.provider_id),
      snapshot.recipient,
      emailControlsConfig(),
    );
    await sql.query(
      "UPDATE delivery_simulations SET mapping_pending=false WHERE id=$1 AND state='accepted' AND provider_id=$2",
      [job.id, job.provider_id],
    );
    return true;
  } catch {
    return false;
  }
}
export async function runDeliverySimulation(
  sql: SQL,
  adapters: { email: SimulationAdapter; telegram: SimulationAdapter },
  limits: { daily: number; monthly: number },
) {
  if (
    adapters.email.mode !== "simulation" ||
    adapters.telegram.mode !== "simulation"
  )
    throw Error("Only simulation adapters are enabled.");
  await repairSimulationEmailMapping(sql);
  const claim = await claimDelivery(sql, limits);
  if (!claim) return "empty_or_suppressed";
  let result: Outcome;
  try {
    result = await adapters[claim.channel].send(claim.request);
  } catch {
    result = { state: "uncertain", code: "transport_unknown" };
  }
  return finishDelivery(sql, claim, result);
}
