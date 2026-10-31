import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError } from "../catalogue/service";
export function emailControlsConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const key = env.NOTIFICATION_UNSUBSCRIBE_KEY,
    secret = env.EMAIL_WEBHOOK_SIGNING_SECRET;
  if (
    env.SMARTMANU_EMAIL_MODE !== "local" ||
    !key?.match(/^[a-f0-9]{64}$/i) ||
    !secret?.startsWith("whsec_")
  )
    throw new CatalogueError(503, "Email control testing is unavailable.");
  const webhookKey = Buffer.from(secret.slice(6), "base64");
  if (
    webhookKey.length < 32 ||
    webhookKey.toString("base64") !== secret.slice(6)
  )
    throw new CatalogueError(503, "Email control testing is unavailable.");
  return { key: Buffer.from(key, "hex"), webhookKey, mode: "local" as const };
}
export type EmailControls = ReturnType<typeof emailControlsConfig>;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export const emailHash = (email: string, config: EmailControls) =>
  createHmac("sha256", config.key)
    .update("email-recipient:" + email.trim().toLowerCase())
    .digest("hex");
const signature = (nonce: string, config: EmailControls) =>
  createHmac("sha256", config.key)
    .update("email-unsubscribe-v1:" + nonce)
    .digest("base64url");
export function validateUnsubscribeToken(token: string, config: EmailControls) {
  if (!/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token))
    throw new CatalogueError(400, "Invalid unsubscribe link.");
  const [nonce, sig] = token.split("."),
    expected = signature(nonce, config);
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    throw new CatalogueError(400, "Invalid unsubscribe link.");
  return hash(nonce);
}
export async function mintUnsubscribeToken(
  sql: SQL,
  userId: string,
  consentEpoch: number,
  config: EmailControls,
  now = new Date(),
) {
  const nonce = randomBytes(32).toString("base64url");
  await sql.query(
    "INSERT INTO notification_unsubscribe_tokens(nonce_hash,user_id,consent_epoch,expires_at) VALUES($1,$2,$3,$4)",
    [
      hash(nonce),
      userId,
      consentEpoch,
      new Date(now.getTime() + 90 * 86400000).toISOString(),
    ],
  );
  return nonce + "." + signature(nonce, config);
}
async function pauseEmail(sql: SQL, userId: string) {
  await sql.query(
    "UPDATE notification_preferences SET enabled=false,consent_version=NULL,next_due_at=NULL,version=version+1 WHERE user_id=$1 AND channel='email'",
    [userId],
  );
  await sql.query(
    "DELETE FROM notification_digest_events WHERE state='planned' AND digest_id IN (SELECT id FROM notification_digests WHERE user_id=$1 AND channel='email' AND state='queued')",
    [userId],
  );
  await sql.query(
    "UPDATE notification_digests SET state='suppressed' WHERE user_id=$1 AND channel='email' AND state='queued'",
    [userId],
  );
}
export async function unsubscribeEmail(
  sql: SQL,
  token: string,
  config: EmailControls,
  now = new Date(),
) {
  const nonceHash = validateUnsubscribeToken(token, config);
  const owner = (
    await sql.query(
      "SELECT user_id FROM notification_unsubscribe_tokens WHERE nonce_hash=$1",
      [nonceHash],
    )
  ).rows[0];
  if (!owner) throw new CatalogueError(400, "Invalid unsubscribe link.");
  return sql.transaction(async (tx) => {
    await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
      owner.user_id,
    ]);
    const pref = (
      await tx.query(
        "SELECT * FROM notification_preferences WHERE user_id=$1 FOR UPDATE",
        [owner.user_id],
      )
    ).rows[0];
    const stored = (
      await tx.query(
        "SELECT * FROM notification_unsubscribe_tokens WHERE nonce_hash=$1 FOR UPDATE",
        [nonceHash],
      )
    ).rows[0];
    if (!stored || new Date(String(stored.expires_at)) <= now)
      throw new CatalogueError(400, "Unsubscribe link expired.");
    if (stored.used_at) return { unsubscribed: true };
    if (
      pref?.channel === "email" &&
      Number(pref.email_consent_epoch) === Number(stored.consent_epoch)
    )
      await pauseEmail(tx, String(owner.user_id));
    await tx.query(
      "UPDATE notification_unsubscribe_tokens SET used_at=$2 WHERE nonce_hash=$1",
      [nonceHash, now.toISOString()],
    );
    return { unsubscribed: true };
  });
}
export async function emailSuppression(
  sql: SQL,
  userId: string,
  config: EmailControls,
) {
  const user = (
    await sql.query("SELECT email FROM auth_user WHERE id=$1", [userId])
  ).rows[0];
  if (!user) return null;
  const row = (
    await sql.query(
      "SELECT reason FROM email_suppressions WHERE recipient_hash=$1",
      [emailHash(String(user.email), config)],
    )
  ).rows[0];
  return row ? String(row.reason) : null;
}
export function verifyEmailWebhook(
  raw: Buffer,
  headers: Headers,
  config: EmailControls,
  now = new Date(),
) {
  const id = headers.get("svix-id") ?? "",
    timestamp = headers.get("svix-timestamp") ?? "",
    signatures = headers.get("svix-signature") ?? "";
  if (
    !/^[A-Za-z0-9_-]{1,200}$/.test(id) ||
    !/^\d{1,12}$/.test(timestamp) ||
    Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp)) > 300 ||
    signatures.length > 2048
  )
    throw new CatalogueError(401, "Invalid email webhook authentication.");
  const expected = createHmac("sha256", config.webhookKey)
    .update(id + "." + timestamp + ".")
    .update(raw)
    .digest("base64");
  const valid = signatures.split(" ").some((part) => {
    const [version, value] = part.split(",");
    return (
      version === "v1" &&
      !!value &&
      value.length === expected.length &&
      timingSafeEqual(Buffer.from(value), Buffer.from(expected))
    );
  });
  if (!valid)
    throw new CatalogueError(401, "Invalid email webhook authentication.");
  return {
    id,
    payload: JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(raw),
    ) as unknown,
  };
}
const eventSchema = z.object({
  type: z.string().max(100),
  data: z.object({
    email_id: z.string().min(1).max(200),
    to: z.array(z.email()).min(1).max(50),
  }),
});
async function applyPendingEvents(
  tx: SQL,
  messageId: string,
  config: EmailControls,
) {
  const attempt = (
    await tx.query("SELECT * FROM email_digest_attempts WHERE message_id=$1", [
      messageId,
    ])
  ).rows[0];
  if (!attempt) return;
  const events = (
    await tx.query(
      "SELECT * FROM email_webhook_events WHERE message_id=$1 AND NOT applied",
      [messageId],
    )
  ).rows;
  for (const event of events) {
    if (
      (event.recipient_hashes as string[]).includes(
        String(attempt.recipient_hash),
      )
    ) {
      const reason =
        event.event_type === "email.complained" ? "complaint" : "bounce";
      await tx.query(
        "INSERT INTO email_suppressions(recipient_hash,reason,event_id) VALUES($1,$2,$3) ON CONFLICT(recipient_hash) DO UPDATE SET reason=CASE WHEN email_suppressions.reason='complaint' THEN 'complaint' ELSE EXCLUDED.reason END,event_id=CASE WHEN email_suppressions.reason='complaint' AND EXCLUDED.reason='bounce' THEN email_suppressions.event_id ELSE EXCLUDED.event_id END",
        [attempt.recipient_hash, reason, event.event_id],
      );
      const user = (
        await tx.query("SELECT email FROM auth_user WHERE id=$1 FOR SHARE", [
          attempt.user_id,
        ])
      ).rows[0];
      if (
        user &&
        emailHash(String(user.email), config) === attempt.recipient_hash
      )
        await pauseEmail(tx, String(attempt.user_id));
    }
    await tx.query(
      "UPDATE email_webhook_events SET applied=true WHERE event_id=$1",
      [event.event_id],
    );
  }
}
export async function recordEmailDigestAttempt(
  sql: SQL,
  userId: string,
  messageId: string,
  recipient: string,
  config: EmailControls,
) {
  const email = z.email().parse(recipient);
  z.string().min(1).max(200).parse(messageId);
  await sql.transaction(async (tx) => {
    await tx.query("SELECT id FROM email_control_lock WHERE id=1 FOR UPDATE");
    const user = (
      await tx.query("SELECT email FROM auth_user WHERE id=$1 FOR SHARE", [
        userId,
      ])
    ).rows[0];
    if (
      !user ||
      emailHash(String(user.email), config) !== emailHash(email, config)
    )
      throw new CatalogueError(
        400,
        "Digest recipient does not match its owner.",
      );
    const existing = (
      await tx.query(
        "SELECT * FROM email_digest_attempts WHERE message_id=$1",
        [messageId],
      )
    ).rows[0];
    if (
      existing &&
      (existing.user_id !== userId ||
        existing.recipient_hash !== emailHash(email, config))
    )
      throw new CatalogueError(
        409,
        "Provider message ID already belongs to another attempt.",
      );
    await tx.query(
      "INSERT INTO email_digest_attempts(message_id,user_id,recipient_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [messageId, userId, emailHash(email, config)],
    );
    await applyPendingEvents(tx, messageId, config);
  });
}
export async function processEmailWebhook(
  sql: SQL,
  eventId: string,
  input: unknown,
  config: EmailControls,
) {
  const envelope = z.object({ type: z.string() }).parse(input);
  if (!["email.bounced", "email.complained"].includes(envelope.type))
    return "ignored";
  const value = eventSchema.parse(input);
  return sql.transaction(async (tx) => {
    await tx.query("SELECT id FROM email_control_lock WHERE id=1 FOR UPDATE");
    if (
      !(
        await tx.query(
          "INSERT INTO email_webhook_events(event_id,message_id,event_type,recipient_hashes) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id",
          [
            eventId,
            value.data.email_id,
            value.type,
            JSON.stringify(
              value.data.to.map((email) => emailHash(email, config)),
            ),
          ],
        )
      ).rows.length
    )
      return "duplicate";
    await applyPendingEvents(tx, value.data.email_id, config);
    return "processed";
  });
}
