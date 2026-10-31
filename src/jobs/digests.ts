import {
  emailControlsConfig,
  emailSuppression,
  mintUnsubscribeToken,
} from "../channels/email-controls";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError } from "../catalogue/service";
import { materialFingerprint, matchesForUser } from "../domain/matching";
import {
  nextDigestSlot,
  localSlotKey,
  timezoneSchema,
} from "./digest-schedule";
export const LOCAL_CONSENT_VERSION = "local-sink-v1";
export const notificationSettingsSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    enabled: z.boolean(),
    channel: z.enum(["email", "telegram"]),
    frequency: z.enum(["daily", "weekly"]),
    timezone: timezoneSchema,
    consent: z.boolean(),
  })
  .strict()
  .refine(
    (v) => !v.enabled || v.consent,
    "Explicit consent is required to enable digests.",
  );
export async function readNotificationSettings(sql: SQL, userId: string) {
  const row = (
    await sql.query(
      "SELECT enabled,channel,version,consent_version,timezone,frequency,next_due_at FROM notification_preferences WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  let controls: ReturnType<typeof emailControlsConfig> | null = null;
  try {
    controls = emailControlsConfig();
  } catch {}
  const emailSuppressionReason = controls
    ? await emailSuppression(sql, userId, controls)
    : null;
  return {
    enabled: row?.enabled === true,
    emailSuppressionReason,
    channel: (row?.channel ?? "email") as "email" | "telegram",
    version: Number(row?.version ?? 0),
    consentVersion: row?.consent_version ? String(row.consent_version) : null,
    timezone: String(row?.timezone ?? "UTC"),
    frequency: (row?.frequency ?? "weekly") as "daily" | "weekly",
    nextDueAt: row?.next_due_at
      ? new Date(String(row.next_due_at)).toISOString()
      : null,
    deliveryMode: "local_sink" as const,
  };
}
export async function saveNotificationSettings(
  sql: SQL,
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const value = notificationSettingsSchema.parse(input);
  await sql.transaction(async (tx) => {
    await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
      userId,
    ]);
    const row = (
      await tx.query(
        "SELECT * FROM notification_preferences WHERE user_id=$1 FOR UPDATE",
        [userId],
      )
    ).rows[0];
    if (Number(row?.version ?? 0) !== value.expectedVersion)
      throw new CatalogueError(
        409,
        "Notification settings changed. Reload before saving.",
      );
    if (
      value.enabled &&
      value.channel === "email" &&
      (await emailSuppression(tx, userId, emailControlsConfig()))
    )
      throw new CatalogueError(
        409,
        "Email digests are suppressed after a bounce or complaint. Use another channel or contact support.",
      );
    const emailEpoch =
      Number(row?.email_consent_epoch ?? 0) +
      (value.enabled &&
      value.channel === "email" &&
      (!row?.enabled ||
        row?.channel !== "email" ||
        row?.consent_version !== LOCAL_CONSENT_VERSION)
        ? 1
        : 0);
    const next = value.enabled
      ? nextDigestSlot(now, value.timezone, value.frequency).toISOString()
      : null;
    await tx.query(
      "INSERT INTO notification_preferences(user_id,enabled,channel,version,consent_version,timezone,frequency,next_due_at,email_consent_epoch) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id) DO UPDATE SET enabled=$2,channel=$3,version=$4,consent_version=$5,timezone=$6,frequency=$7,next_due_at=$8,email_consent_epoch=$9",
      [
        userId,
        value.enabled,
        value.channel,
        value.expectedVersion + 1,
        value.enabled ? LOCAL_CONSENT_VERSION : null,
        value.timezone,
        value.frequency,
        next,
        emailEpoch,
      ],
    );
    await tx.query(
      "DELETE FROM notification_digest_events WHERE user_id=$1 AND state='planned'",
      [userId],
    );
    await tx.query(
      "UPDATE notification_digests SET state='suppressed' WHERE user_id=$1 AND state='queued'",
      [userId],
    );
  });
  return readNotificationSettings(sql, userId);
}
export async function planOneDigest(sql: SQL, now = new Date()) {
  return sql.transaction(async (tx) => {
    const pref = (
      await tx.query(
        "SELECT * FROM notification_preferences WHERE enabled AND consent_version=$2 AND next_due_at<=$1 ORDER BY next_due_at,user_id LIMIT 1 FOR UPDATE SKIP LOCKED",
        [now.toISOString(), LOCAL_CONSENT_VERSION],
      )
    ).rows[0];
    if (!pref) return "empty";
    const userId = String(pref.user_id),
      due = new Date(String(pref.next_due_at)),
      timezone = String(pref.timezone);
    await tx.query(
      "UPDATE notification_preferences SET next_due_at=$2 WHERE user_id=$1",
      [
        userId,
        nextDigestSlot(
          now,
          timezone,
          pref.frequency as "daily" | "weekly",
        ).toISOString(),
      ],
    );
    if (
      (
        await tx.query(
          "SELECT id FROM notification_digests WHERE user_id=$1 AND state='queued'",
          [userId],
        )
      ).rows.length
    )
      return "pending";
    if (
      pref.channel === "email" &&
      (await emailSuppression(tx, userId, emailControlsConfig()))
    ) {
      await tx.query(
        "UPDATE notification_preferences SET enabled=false,consent_version=NULL,next_due_at=NULL,version=version+1 WHERE user_id=$1",
        [userId],
      );
      return "suppressed";
    }
    const matches = await matchesForUser(tx, userId, 1, 1000);
    const seen = new Set(
      (
        await tx.query(
          "SELECT event_key FROM notification_digest_events WHERE user_id=$1",
          [userId],
        )
      ).rows.map((r) => String(r.event_key)),
    );
    const freshIds = new Set(
      (
        await tx.query(
          "SELECT id FROM opportunities WHERE verified_at>=$1 AND id=ANY($2::text[])",
          [
            new Date(now.getTime() - 86400000).toISOString(),
            matches.items.map((item) => item.id),
          ],
        )
      ).rows.map((r) => String(r.id)),
    );
    const items = matches.items
      .filter((item) => freshIds.has(item.id))
      .map((item) => ({
        id: item.id,
        fingerprint: materialFingerprint(item.details),
        key: JSON.stringify([item.id, materialFingerprint(item.details)]),
      }))
      .filter((item) => !seen.has(item.key))
      .slice(0, 10);
    if (!items.length) return "empty_digest";
    const id = randomUUID(),
      inserted = await tx.query(
        "INSERT INTO notification_digests(id,user_id,preference_version,channel,slot) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id",
        [id, userId, pref.version, pref.channel, localSlotKey(due, timezone)],
      );
    if (!inserted.rows.length) return "duplicate_slot";
    for (const item of items)
      await tx.query(
        "INSERT INTO notification_digest_events(user_id,event_key,opportunity_id,fingerprint,digest_id) VALUES($1,$2,$3,$4,$5)",
        [userId, item.key, item.id, item.fingerprint, id],
      );
    return "queued";
  });
}
export async function dispatchDigest(sql: SQL, now = new Date()) {
  // Preference then digest is the same lock order used by settings writes.
  const candidate = (
    await sql.query(
      "SELECT id,user_id FROM notification_digests WHERE state='queued' ORDER BY created_at,id LIMIT 1",
    )
  ).rows[0];
  if (!candidate) return "empty";
  return sql.transaction(async (tx) => {
    await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
      candidate.user_id,
    ]);
    const pref = (
      await tx.query(
        "SELECT * FROM notification_preferences WHERE user_id=$1 FOR UPDATE",
        [candidate.user_id],
      )
    ).rows[0];
    const digest = (
      await tx.query(
        "SELECT * FROM notification_digests WHERE id=$1 AND state='queued' FOR UPDATE SKIP LOCKED",
        [candidate.id],
      )
    ).rows[0];
    if (!digest) return "empty";
    let valid =
      pref?.enabled === true &&
      pref.consent_version === LOCAL_CONSENT_VERSION &&
      pref.version === digest.preference_version &&
      pref.channel === digest.channel;
    if (
      valid &&
      digest.channel === "email" &&
      (await emailSuppression(
        tx,
        String(candidate.user_id),
        emailControlsConfig(),
      ))
    )
      valid = false;
    const events = (
      await tx.query(
        "SELECT * FROM notification_digest_events WHERE digest_id=$1 AND state='planned'",
        [digest.id],
      )
    ).rows;
    await tx.query("SELECT user_id FROM profiles WHERE user_id=$1 FOR SHARE", [
      candidate.user_id,
    ]);
    await tx.query(
      "SELECT id FROM opportunities WHERE id IN (SELECT opportunity_id FROM notification_digest_events WHERE digest_id=$1) ORDER BY id FOR SHARE",
      [digest.id],
    );
    const matches = valid
      ? await matchesForUser(tx, String(candidate.user_id), 1, 1000)
      : null;
    const byId = new Map(matches?.items.map((item) => [item.id, item]));
    const items = [];
    for (const event of events) {
      const match = byId.get(String(event.opportunity_id));
      const source =
        match &&
        (
          await tx.query(
            "SELECT o.id,o.verified_at,s.url,s.synthetic FROM opportunities o JOIN sources s ON s.id=o.source_id WHERE o.id=$1 AND o.verified_at>=$2 FOR SHARE OF o",
            [
              event.opportunity_id,
              new Date(now.getTime() - 86400000).toISOString(),
            ],
          )
        ).rows[0];
      if (
        match &&
        source &&
        materialFingerprint(match.details) === event.fingerprint
      ) {
        items.push({
          id: match.id,
          title: match.details.title,
          revision: match.revision,
          organizer: match.details.organizer,
          studyLevel: match.details.studyLevel,
          mode: match.details.mode,
          country: match.details.country,
          teachingLanguage: match.details.teachingLanguage,
          reasons: match.reasons,
          sourceURL: source.synthetic ? null : String(source.url),
          lastVerifiedAt: new Date(String(source.verified_at)).toISOString(),
          funding: match.details.funding,
          travelCosts: match.details.travelCosts,
          coverageDuration: match.details.coverageDuration,
          applicationFee: match.details.applicationFee,
          certificateFee: match.details.certificateFee,
          deadline: match.details.deadline,
          deadlineText: match.details.deadlineText,
          deadlineTimezone: null,
          unknowns: match.unknowns,
          synthetic: match.synthetic,
        });
        await tx.query(
          "UPDATE notification_digest_events SET state='accepted' WHERE user_id=$1 AND event_key=$2",
          [candidate.user_id, event.event_key],
        );
      } else
        await tx.query(
          "DELETE FROM notification_digest_events WHERE user_id=$1 AND event_key=$2 AND state='planned'",
          [candidate.user_id, event.event_key],
        );
    }
    if (!items.length) {
      await tx.query(
        "UPDATE notification_digests SET state='suppressed' WHERE id=$1",
        [digest.id],
      );
      return "suppressed";
    }
    const profile = (
      await tx.query(
        "SELECT preferences->>'alertLanguage' AS language FROM profiles WHERE user_id=$1",
        [candidate.user_id],
      )
    ).rows[0];
    const unsubscribeToken =
      digest.channel === "email"
        ? await mintUnsubscribeToken(
            tx,
            String(candidate.user_id),
            Number(pref.email_consent_epoch),
            emailControlsConfig(),
            now,
          )
        : null;
    const payload = {
      mode: "local_sink",
      unsubscribe: unsubscribeToken
        ? {
            landingPath: "/unsubscribe?token=" + unsubscribeToken,
            postPath:
              "/api/notifications/unsubscribe?token=" + unsubscribeToken,
            postBody: "List-Unsubscribe=One-Click",
          }
        : null,
      language: "en",
      requestedLanguage: profile?.language ?? "en",
      translationFallback: (profile?.language ?? "en") !== "en",
      slot: digest.slot,
      items,
    };
    await tx.query(
      "INSERT INTO sink_messages(event_key,channel,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      ["digest:" + digest.id, digest.channel, JSON.stringify(payload)],
    );
    await tx.query(
      "UPDATE notification_digests SET state='accepted',payload=$2 WHERE id=$1",
      [digest.id, JSON.stringify(payload)],
    );
    return "accepted";
  });
}
export async function digestHistory(sql: SQL, userId: string) {
  return (
    await sql.query(
      "SELECT id,channel,slot,state,created_at FROM notification_digests WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 20",
      [userId],
    )
  ).rows;
}
