import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError } from "../catalogue/service";
import { emailSuppression } from "../channels/email-controls";
import { nextDigestSlot, timezoneSchema } from "../jobs/digest-schedule";
import { LIVE_EMAIL_CONSENT, type LiveEmailConfig } from "./config";
export async function liveEmailSettings(
  sql: SQL,
  userId: string,
  config: LiveEmailConfig,
) {
  const row = (
    await sql.query("SELECT * FROM notification_preferences WHERE user_id=$1", [
      userId,
    ])
  ).rows[0];
  return {
    enabled:
      row?.enabled === true &&
      row.channel === "email" &&
      row.consent_version === LIVE_EMAIL_CONSENT,
    version: Number(row?.version ?? 0),
    frequency: String(row?.frequency ?? "weekly"),
    timezone: String(row?.timezone ?? "UTC"),
    nextDueAt: row?.next_due_at
      ? new Date(String(row.next_due_at)).toISOString()
      : null,
    profileReady: !!(
      await sql.query("SELECT 1 FROM profiles WHERE user_id=$1", [userId])
    ).rows.length,
    providerConnected: !!(
      await sql.query(
        "SELECT 1 FROM live_email_provider WHERE id=1 AND configuration_hash=$1",
        [config.configurationHash],
      )
    ).rows.length,
    suppressionReason: await emailSuppression(sql, userId, config.controls),
    history: (
      await sql.query(
        "SELECT id,kind,state,provider_state,error_code,created_at FROM live_email_deliveries WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 20",
        [userId],
      )
    ).rows,
  };
}
const schema = z
  .object({
    expectedVersion: z.number().int().min(0),
    enabled: z.boolean(),
    consent: z.boolean(),
    frequency: z.enum(["daily", "weekly"]),
    timezone: timezoneSchema,
  })
  .strict();
export async function saveLiveEmailSettings(
  sql: SQL,
  userId: string,
  input: unknown,
  config: LiveEmailConfig,
  now = new Date(),
) {
  const value = schema.parse(input);
  if (value.enabled && !value.consent)
    throw new CatalogueError(400, "Consent to live email is required.");
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
      !(
        await tx.query(
          "SELECT 1 FROM live_email_provider WHERE id=1 AND configuration_hash=$1",
          [config.configurationHash],
        )
      ).rows.length
    )
      throw new CatalogueError(409, "Connect Brevo callbacks first.");
    if (value.enabled && (await emailSuppression(tx, userId, config.controls)))
      throw new CatalogueError(409, "Email destination is suppressed.");
    const epoch =
      Number(row?.email_consent_epoch ?? 0) +
      (value.enabled &&
      (!row?.enabled ||
        row.channel !== "email" ||
        row.consent_version !== LIVE_EMAIL_CONSENT)
        ? 1
        : 0);
    await tx.query(
      "INSERT INTO notification_preferences(user_id,enabled,channel,version,consent_version,timezone,frequency,next_due_at,email_consent_epoch,deadline_reminders_enabled,applied_reminders_enabled,material_changes_enabled) VALUES($1,$2,'email',$3,$4,$5,$6,$7,$8,false,false,false) ON CONFLICT(user_id) DO UPDATE SET enabled=$2,channel='email',version=$3,consent_version=$4,timezone=$5,frequency=$6,next_due_at=$7,email_consent_epoch=$8,deadline_reminders_enabled=false,applied_reminders_enabled=false,material_changes_enabled=false",
      [
        userId,
        value.enabled,
        value.expectedVersion + 1,
        value.enabled ? LIVE_EMAIL_CONSENT : null,
        value.timezone,
        value.frequency,
        value.enabled
          ? nextDigestSlot(now, value.timezone, value.frequency).toISOString()
          : null,
        epoch,
      ],
    );
    await tx.query(
      "UPDATE live_email_deliveries SET state='suppressed',error_code='settings_changed' WHERE user_id=$1 AND state='pending'",
      [userId],
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
  return liveEmailSettings(sql, userId, config);
}
