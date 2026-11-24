import { createHash } from "node:crypto";
import { z } from "zod";
import type { SQL } from "../db";
import {
  emailHash,
  processEmailWebhook,
  recordEmailDigestAttempt,
} from "../channels/email-controls";
import type { LiveEmailConfig } from "./config";
const schema = z.object({
  event: z.string().max(50),
  email: z.email(),
  "message-id": z.string().min(1).max(200),
  "X-Mailin-custom": z.string().regex(/^smartmanuai-alert:[a-f0-9-]{36}$/),
  ts_event: z.number().int().nonnegative(),
});
const negative = new Set([
  "hard_bounce",
  "soft_bounce",
  "spam",
  "blocked",
  "invalid",
  "unsubscribed",
]);
export async function processBrevoAlertWebhook(
  sql: SQL,
  input: unknown,
  config: Pick<LiveEmailConfig, "controls">,
) {
  const raw = input as Record<string, unknown> | null;
  if (
    !raw ||
    typeof raw["X-Mailin-custom"] !== "string" ||
    !/^smartmanuai-alert:[a-f0-9-]{36}$/.test(raw["X-Mailin-custom"])
  )
    return "ignored";
  const event = schema.parse(input);
  if (
    !negative.has(event.event) &&
    !["request", "delivered", "deferred"].includes(event.event)
  )
    return "ignored";
  const id = event["X-Mailin-custom"].slice("smartmanuai-alert:".length),
    message = event["message-id"].replace(/^<|>$/g, "");
  const row = (
    await sql.query(
      "SELECT d.*,u.email FROM live_email_deliveries d JOIN auth_user u ON u.id=d.user_id WHERE d.id=$1 AND d.state IN ('dispatching','accepted','uncertain') AND NOT EXISTS(SELECT 1 FROM account_deletion_requests a WHERE a.user_id=d.user_id AND a.state='queued')",
      [id],
    )
  ).rows[0];
  if (
    !row ||
    emailHash(event.email, config.controls) !== row.recipient_hash ||
    (row.message_id && row.message_id !== message)
  )
    return "ignored";
  const key = createHash("sha256")
    .update(JSON.stringify([id, message, event.event, event.ts_event]))
    .digest("hex");
  const inserted = await sql.query(
    "INSERT INTO live_email_events(event_key,delivery_id,message_id,event_type) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_key",
    [key, id, message, event.event],
  );
  // Repeat normalized suppression safely on replay: an earlier request may have crashed after its receipt.
  if (negative.has(event.event))
    await processEmailWebhook(
      sql,
      "brevo:" + key,
      {
        type: ["spam", "unsubscribed"].includes(event.event)
          ? "email.complained"
          : "email.bounced",
        data: { email_id: message, to: [event.email] },
      },
      config.controls,
    );
  await sql.query(
    "UPDATE live_email_deliveries SET message_id=COALESCE(message_id,$2),state=CASE WHEN state='uncertain' THEN 'accepted' ELSE state END,provider_state=CASE WHEN provider_state IN ('hard_bounce','soft_bounce','spam','blocked','invalid','unsubscribed') THEN provider_state WHEN provider_state='delivered' AND $3 IN ('request','deferred') THEN provider_state ELSE $3 END WHERE id=$1 AND (message_id IS NULL OR message_id=$2)",
    [id, message, event.event],
  );
  if (emailHash(String(row.email), config.controls) === row.recipient_hash)
    await recordEmailDigestAttempt(
      sql,
      String(row.user_id),
      message,
      String(row.email),
      config.controls,
    );
  return inserted.rows.length ? "processed" : "duplicate";
}
