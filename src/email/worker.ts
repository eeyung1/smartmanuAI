import { createHash, randomUUID } from "node:crypto";
import type { SQL } from "../db";
import { CatalogueError } from "../catalogue/service";
import { allMatchesForUser, materialFingerprint } from "../domain/matching";
import { nextDigestSlot } from "../jobs/digest-schedule";
import {
  emailHash,
  emailSuppression,
  mintUnsubscribeToken,
  recordEmailDigestAttempt,
} from "../channels/email-controls";
import { buildBrevoRequest, brevoTransport } from "../delivery/brevo";
import { BrevoDeliveryError } from "../delivery/brevo-error";
import type { Transport } from "../delivery/adapters";
import { renderAlertText, alertCopy } from "../i18n/alerts";
import { resolveAlertLanguage } from "../i18n/locale";
import { LIVE_EMAIL_CONSENT, type LiveEmailConfig } from "./config";
const eventKey = (id: string, fingerprint: string) =>
  createHash("sha256")
    .update(JSON.stringify([id, fingerprint]))
    .digest("hex");
export async function currentEmailItems(sql: SQL, userId: string, now: Date) {
  const matches = await allMatchesForUser(sql, userId);
  const rows = (
    await sql.query(
      "SELECT o.id,s.url FROM opportunities o JOIN sources s ON s.id=o.source_id WHERE o.state='published' AND NOT s.synthetic AND o.verified_at >= $1 AND o.verified_at <= $2",
      [new Date(now.getTime() - 86400000).toISOString(), now.toISOString()],
    )
  ).rows;
  const sources = new Map(rows.map((r) => [String(r.id), String(r.url)]));
  return matches.items
    .filter(
      (item) =>
        sources.has(item.id) && /^https:\/\//.test(sources.get(item.id)!),
    )
    .map((item) => ({
      ...item,
      sourceURL: sources.get(item.id)!,
      fingerprint: materialFingerprint(item.details),
    }));
}
export async function queueLiveEmail(
  sql: SQL,
  userId: string,
  config: LiveEmailConfig,
  kind: "test" | "digest",
  now = new Date(),
) {
  return sql.transaction(async (tx) => {
    const user = (
      await tx.query("SELECT * FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
        userId,
      ])
    ).rows[0];
    const pref = (
      await tx.query(
        "SELECT * FROM notification_preferences WHERE user_id=$1 FOR UPDATE",
        [userId],
      )
    ).rows[0];
    if (
      !user?.email_verified ||
      !pref?.enabled ||
      pref.channel !== "email" ||
      pref.consent_version !== LIVE_EMAIL_CONSENT
    )
      throw new CatalogueError(
        409,
        "Enable live email with fresh consent first.",
      );
    if (await emailSuppression(tx, userId, config.controls))
      throw new CatalogueError(409, "Email destination is suppressed.");
    if (
      !(
        await tx.query(
          "SELECT 1 FROM live_email_provider WHERE id=1 AND configuration_hash=$1",
          [config.configurationHash],
        )
      ).rows.length
    )
      throw new CatalogueError(409, "Connect Brevo callbacks first.");
    if (
      kind === "digest" &&
      (!pref.next_due_at || new Date(String(pref.next_due_at)) > now)
    )
      return null;
    const slot =
      kind === "test"
        ? "test:" + randomUUID()
        : new Date(String(pref.next_due_at)).toISOString();
    if (kind === "digest")
      await tx.query(
        "UPDATE notification_preferences SET next_due_at=$2 WHERE user_id=$1",
        [
          userId,
          nextDigestSlot(
            now,
            String(pref.timezone),
            pref.frequency as "daily" | "weekly",
          ).toISOString(),
        ],
      );
    const seen = new Set(
      (
        await tx.query(
          "SELECT event_key FROM live_email_seen WHERE user_id=$1",
          [userId],
        )
      ).rows.map((r) => String(r.event_key)),
    );
    const items =
      kind === "test"
        ? []
        : (await currentEmailItems(tx, userId, now))
            .filter((i) => !seen.has(eventKey(i.id, i.fingerprint)))
            .slice(0, 10)
            .map((i) => ({ id: i.id, fingerprint: i.fingerprint }));
    if (kind === "digest" && !items.length) return null;
    const id = randomUUID();
    const inserted = await tx.query(
      "INSERT INTO live_email_deliveries(id,user_id,kind,slot,preference_version,consent_epoch,recipient_hash,items) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id",
      [
        id,
        userId,
        kind,
        slot,
        pref.version,
        pref.email_consent_epoch,
        emailHash(String(user.email), config.controls),
        JSON.stringify(items),
      ],
    );
    if (!inserted.rows.length) return null;
    for (const item of items)
      await tx.query(
        "INSERT INTO live_email_seen(user_id,event_key,delivery_id) VALUES($1,$2,$3)",
        [userId, eventKey(item.id, item.fingerprint), id],
      );
    return id;
  });
}
export async function dispatchLiveEmail(
  sql: SQL,
  id: string,
  config: LiveEmailConfig,
  transport: Transport = brevoTransport(),
  now = new Date(),
) {
  // Commit the fence before any network I/O. A crash or timeout never replays a send.
  const job = (
    await sql.query(
      "UPDATE live_email_deliveries SET state='dispatching',started_at=$2 WHERE id=$1 AND state='pending' RETURNING *",
      [id, now.toISOString()],
    )
  ).rows[0];
  if (!job) return "not_pending";
  const userId = String(job.user_id);
  try {
    const token = await sql.transaction(async (tx) => {
      // Quota reservations survive rollbacks of the send transaction.
      for (const [bucket, limit] of [
        ["global", 10],
        ["recipient:" + job.recipient_hash, 3],
      ] as const) {
        const reserved = await tx.query(
          "INSERT INTO live_email_quota(bucket,day,attempts) VALUES($1,$2,1) ON CONFLICT(bucket,day) DO UPDATE SET attempts=live_email_quota.attempts+1 WHERE live_email_quota.attempts<$3 RETURNING attempts",
          [bucket, now.toISOString().slice(0, 10), limit],
        );
        if (!reserved.rows.length)
          throw new CatalogueError(429, "Daily live email limit reached.");
      }
      return mintUnsubscribeToken(
        tx,
        userId,
        Number(job.consent_epoch),
        config.controls,
        now,
      );
    });
    const outcome = await sql.transaction(async (tx) => {
      const user = (
        await tx.query(
          "SELECT * FROM auth_user WHERE id=$1 FOR NO KEY UPDATE",
          [userId],
        )
      ).rows[0];
      const pref = (
        await tx.query(
          "SELECT * FROM notification_preferences WHERE user_id=$1 FOR UPDATE",
          [userId],
        )
      ).rows[0];
      const stored = (
        await tx.query(
          "SELECT state FROM live_email_deliveries WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!stored || stored.state !== "dispatching") return "not_pending";
      const finish = async (
        state: string,
        error: string | null = null,
        message: string | null = null,
      ) => {
        await tx.query(
          "UPDATE live_email_deliveries SET state=$2,error_code=$3,message_id=$4,completed_at=$5 WHERE id=$1",
          [id, state, error, message, now.toISOString()],
        );
        return state;
      };
      if (
        (
          await tx.query(
            "SELECT 1 FROM account_deletion_requests WHERE user_id=$1 AND state='queued'",
            [userId],
          )
        ).rows.length
      )
        return "suppressed";
      if (
        !user?.email_verified ||
        !pref?.enabled ||
        pref.channel !== "email" ||
        pref.consent_version !== LIVE_EMAIL_CONSENT ||
        Number(pref.version) !== Number(job.preference_version) ||
        Number(pref.email_consent_epoch) !== Number(job.consent_epoch) ||
        emailHash(String(user.email), config.controls) !== job.recipient_hash ||
        (await emailSuppression(tx, userId, config.controls)) ||
        !(
          await tx.query(
            "SELECT 1 FROM live_email_provider WHERE id=1 AND configuration_hash=$1",
            [config.configurationHash],
          )
        ).rows.length
      )
        return finish("suppressed", "state_changed");
      const profile = (
        await tx.query(
          "SELECT preferences FROM profiles WHERE user_id=$1 FOR SHARE",
          [userId],
        )
      ).rows[0];
      const expected = job.items as { id: string; fingerprint: string }[];
      if (expected.length) {
        await tx.query(
          "SELECT id FROM opportunities WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE",
          [expected.map((i) => i.id)],
        );
        await tx.query(
          "SELECT id FROM sources WHERE id IN (SELECT source_id FROM opportunities WHERE id=ANY($1::text[])) ORDER BY id FOR SHARE",
          [expected.map((i) => i.id)],
        );
      }
      const items =
        job.kind === "test"
          ? []
          : (await currentEmailItems(tx, userId, now)).filter((i) =>
              expected.some(
                (e) => e.id === i.id && e.fingerprint === i.fingerprint,
              ),
            );
      if (job.kind !== "test" && !items.length)
        return finish("suppressed", "no_current_matches");
      const language = resolveAlertLanguage(
          (profile?.preferences as Record<string, unknown> | undefined)
            ?.alertLanguage ?? "en",
        ),
        zh = language.language === "zh-Hans";
      const title =
        job.kind === "test"
          ? zh
            ? "smartmanuAI 邮件投递测试"
            : "smartmanuAI email delivery test"
          : zh
            ? "smartmanuAI 学习机会摘要"
            : "smartmanuAI opportunity digest";
      const text =
        job.kind === "test"
          ? zh
            ? "这是您请求的投递测试，不是可申请的学习机会。"
            : "This is your requested email delivery test, not an application opportunity."
          : renderAlertText({
              ...language,
              synthetic: false,
              items: items.map((i) => ({ id: i.id, ...i.details })),
            })
              .replace(alertCopy(language.language).preview, title)
              .replaceAll("https://smartmanu.example.test", config.origin) +
            "\n\n" +
            items.map((i) => i.sourceURL).join("\n");
      const unsubscribe = config.origin + "/unsubscribe?token=" + token;
      const request = buildBrevoRequest(config.brevo, {
        to: String(user.email),
        subject: title,
        text:
          text +
          "\n\n" +
          (zh ? "退订邮件摘要：" : "Unsubscribe from email digests:") +
          "\n" +
          unsubscribe,
        headers: { "X-Mailin-custom": "smartmanuai-alert:" + id },
      });
      let result: Awaited<ReturnType<Transport>>;
      try {
        result = await transport(request, AbortSignal.timeout(15000));
      } catch {
        return finish("uncertain", "network_outcome_unknown");
      }
      const body = result.body as Record<string, unknown> | null;
      if (
        result.status >= 200 &&
        result.status < 300 &&
        typeof body?.messageId === "string" &&
        body.messageId.length > 0 &&
        body.messageId.length <= 200
      )
        return finish("accepted", null, body.messageId.replace(/^<|>$/g, ""));
      const reason = new BrevoDeliveryError(result.status, result.body).reason;
      return finish(
        result.status >= 400 && result.status < 500 ? "failed" : "uncertain",
        reason,
      );
    });
    if (outcome === "accepted") await reconcileAttempt(sql, id, config);
    return outcome;
  } catch (e) {
    const quota = e instanceof CatalogueError && e.status === 429;
    await sql.query(
      "UPDATE live_email_deliveries SET state=$2,error_code=$3,completed_at=$4 WHERE id=$1 AND state='dispatching'",
      [
        id,
        quota ? "failed" : "uncertain",
        quota ? "quota_exhausted" : "interrupted",
        now.toISOString(),
      ],
    );
    if (quota) return "failed";
    throw new CatalogueError(
      503,
      "Email outcome needs operator review. Do not retry automatically.",
    );
  }
}
async function reconcileAttempt(sql: SQL, id: string, config: LiveEmailConfig) {
  const row = (
    await sql.query(
      "SELECT d.*,u.email FROM live_email_deliveries d JOIN auth_user u ON u.id=d.user_id WHERE d.id=$1 AND d.message_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM account_deletion_requests a WHERE a.user_id=d.user_id AND a.state='queued')",
      [id],
    )
  ).rows[0];
  if (
    !row ||
    emailHash(String(row.email), config.controls) !== row.recipient_hash
  )
    return;
  await recordEmailDigestAttempt(
    sql,
    String(row.user_id),
    String(row.message_id),
    String(row.email),
    config.controls,
  );
}
export async function runLiveEmailCycle(
  sql: SQL,
  config: LiveEmailConfig,
  now = new Date(),
) {
  await sql.query(
    "UPDATE live_email_deliveries SET state='uncertain',error_code='interrupted',completed_at=$1 WHERE state='dispatching' AND started_at<$2",
    [now.toISOString(), new Date(now.getTime() - 300000).toISOString()],
  );
  let errors = 0,
    planned = 0;
  const outcomes: Record<string, number> = {};
  const repairs = (
    await sql.query(
      "SELECT id FROM live_email_deliveries d WHERE d.state='accepted' AND d.message_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM email_digest_attempts a WHERE a.message_id=d.message_id) LIMIT 5",
    )
  ).rows;
  for (const row of repairs)
    try {
      await reconcileAttempt(sql, String(row.id), config);
    } catch {
      errors++;
    }
  const due = (
    await sql.query(
      "SELECT user_id FROM notification_preferences WHERE enabled AND channel='email' AND consent_version=$1 AND next_due_at<=$2 ORDER BY next_due_at,user_id LIMIT 5",
      [LIVE_EMAIL_CONSENT, now.toISOString()],
    )
  ).rows;
  for (const row of due)
    try {
      if (await queueLiveEmail(sql, String(row.user_id), config, "digest", now))
        planned++;
    } catch {
      errors++;
    }
  const pending = (
    await sql.query(
      "SELECT id FROM live_email_deliveries WHERE state='pending' ORDER BY created_at,id LIMIT 5",
    )
  ).rows;
  for (const row of pending)
    try {
      const state = await dispatchLiveEmail(
        sql,
        String(row.id),
        config,
        undefined,
        now,
      );
      outcomes[state] = (outcomes[state] ?? 0) + 1;
    } catch {
      errors++;
    }
  return { planned, outcomes, errors };
}
