import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError } from "../catalogue/service";
import { purgeLocalMail } from "../auth/local-mail";
const receiptHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function requireFreshSession(
  createdAt: Date | string,
  now = new Date(),
) {
  const time = new Date(createdAt).getTime();
  if (
    !Number.isFinite(time) ||
    time > now.getTime() + 60000 ||
    now.getTime() - time > 600000
  )
    throw new CatalogueError(
      403,
      "Sign in again before exporting or deleting account data.",
    );
}
export async function accountExport(sql: SQL, userId: string) {
  return sql.transaction(async (tx) => {
    const user = (
      await tx.query(
        "SELECT id,name,email,email_verified,created_at FROM auth_user WHERE id=$1 FOR SHARE",
        [userId],
      )
    ).rows[0];
    if (!user) throw new CatalogueError(404, "Account not found.");
    return {
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      account: user,
      profile:
        (
          await tx.query(
            "SELECT preferences,version FROM profiles WHERE user_id=$1",
            [userId],
          )
        ).rows[0] ?? null,
      tracker: (
        await tx.query(
          "SELECT s.opportunity_id,s.status,s.saved,(s.dismissed_fingerprint IS NOT NULL) AS dismissed,s.version,s.updated_at FROM saved_items s WHERE s.user_id=$1 ORDER BY s.opportunity_id",
          [userId],
        )
      ).rows,
      notifications:
        (
          await tx.query(
            "SELECT enabled,channel,version,consent_version,timezone,frequency,next_due_at FROM notification_preferences WHERE user_id=$1",
            [userId],
          )
        ).rows[0] ?? null,
      telegram:
        (
          await tx.query(
            "SELECT state,version,chat_suffix,updated_at FROM telegram_bindings WHERE user_id=$1",
            [userId],
          )
        ).rows[0] ?? null,
      digests: (
        await tx.query(
          "SELECT id,channel,slot,state,created_at FROM notification_digests WHERE user_id=$1 ORDER BY created_at,id",
          [userId],
        )
      ).rows,
      deliveries: (
        await tx.query(
          "SELECT id,channel,state,attempts,error_code,created_at FROM delivery_simulations WHERE user_id=$1 ORDER BY created_at,id",
          [userId],
        )
      ).rows,
      sessions: (
        await tx.query(
          "SELECT created_at,expires_at FROM auth_session WHERE user_id=$1 ORDER BY created_at",
          [userId],
        )
      ).rows,
      scope:
        "Application profile and activity export; security credentials, link tokens, raw mail, shared catalogue and provider records are excluded.",
    };
  });
}
export async function requestAccountDeletion(
  sql: SQL,
  userId: string,
  input: unknown,
) {
  z.object({ confirmation: z.literal("DELETE") })
    .strict()
    .parse(input);
  return sql.transaction(async (tx) => {
    const user = (
      await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
        userId,
      ])
    ).rows[0];
    if (!user) throw new CatalogueError(404, "Account not found.");
    const contributed = (
      await tx.query(
        "SELECT 1 FROM sources WHERE created_by=$1 UNION ALL SELECT 1 FROM opportunity_revisions WHERE actor_id=$1 UNION ALL SELECT 1 FROM source_collection_policies WHERE actor_id=$1 LIMIT 1",
        [userId],
      )
    ).rows.length;
    if (contributed)
      throw new CatalogueError(
        409,
        "Public review contributions require operator-assisted deletion. No request was created.",
      );
    if (
      (
        await tx.query(
          "SELECT id FROM account_deletion_requests WHERE user_id=$1",
          [userId],
        )
      ).rows.length
    )
      throw new CatalogueError(409, "Deletion was already requested.");
    await tx.query(
      "UPDATE outbox SET state='suppressed' WHERE user_id=$1 AND state='queued'",
      [userId],
    );
    await tx.query(
      "UPDATE notification_preferences SET enabled=false,consent_version=NULL,next_due_at=NULL,version=version+1 WHERE user_id=$1",
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
    await tx.query(
      "UPDATE delivery_simulations SET state=CASE WHEN state='sending' THEN 'uncertain' ELSE 'suppressed' END,error_code='deletion_requested' WHERE user_id=$1 AND state IN ('ready','retry','quota_wait','sending')",
      [userId],
    );
    await tx.query(
      "UPDATE telegram_bindings SET state='revoked',version=version+1 WHERE user_id=$1",
      [userId],
    );
    await tx.query(
      "UPDATE telegram_link_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL",
      [userId],
    );
    await tx.query("DELETE FROM auth_session WHERE user_id=$1", [userId]);
    const receipt = randomBytes(32).toString("hex"),
      id = randomUUID();
    await tx.query(
      "INSERT INTO account_deletion_requests(id,user_id,receipt_hash) VALUES($1,$2,$3)",
      [id, userId, receiptHash(receipt)],
    );
    return { receipt, state: "queued" };
  });
}
export async function deletionStatus(sql: SQL, receipt: string) {
  if (!/^[a-f0-9]{64}$/.test(receipt))
    throw new CatalogueError(404, "Receipt not found.");
  const row = (
    await sql.query(
      "SELECT state,created_at,completed_at FROM account_deletion_requests WHERE receipt_hash=$1",
      [receiptHash(receipt)],
    )
  ).rows[0];
  if (!row) throw new CatalogueError(404, "Receipt not found.");
  return row;
}
export async function purgeOneAccount(sql: SQL, dataDir: string) {
  return sql.transaction(async (tx) => {
    const request = (
      await tx.query(
        "SELECT id,user_id FROM account_deletion_requests WHERE state='queued' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
      )
    ).rows[0];
    if (!request) return "empty";
    const user = (
      await tx.query("SELECT id,email FROM auth_user WHERE id=$1 FOR UPDATE", [
        request.user_id,
      ])
    ).rows[0];
    if (!user) throw Error("Deletion account is missing.");
    // Local fixture mail writes use the same lock and reject pending accounts.
    await purgeLocalMail(dataDir, String(user.email));
    await tx.query(
      "DELETE FROM sink_messages WHERE event_key IN (SELECT event_key FROM outbox WHERE user_id=$1) OR event_key IN (SELECT 'digest:'||id FROM notification_digests WHERE user_id=$1)",
      [user.id],
    );
    await tx.query(
      "DELETE FROM auth_verification WHERE lower(privacy_verification_email(value))=lower($1)",
      [user.email],
    );
    await tx.query(
      "DELETE FROM telegram_chat_events WHERE chat_hash IN (SELECT chat_hash FROM telegram_bindings WHERE user_id=$1)",
      [user.id],
    );
    // Retain minimal destination suppression markers; remove callback correlation to this account.
    await tx.query(
      "UPDATE email_webhook_events SET recipient_hashes='[]'::jsonb,message_id='erased:'||event_id WHERE message_id IN (SELECT message_id FROM email_digest_attempts WHERE user_id=$1)",
      [user.id],
    );
    await tx.query("DELETE FROM delivery_simulations WHERE user_id=$1", [
      user.id,
    ]);
    await tx.query("DELETE FROM auth_user WHERE id=$1", [user.id]);
    await tx.query(
      "UPDATE account_deletion_requests SET state='done',completed_at=NOW() WHERE id=$1",
      [request.id],
    );
    return "purged";
  });
}
