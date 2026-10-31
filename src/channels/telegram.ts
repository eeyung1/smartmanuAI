import {
  createHash,
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError } from "../catalogue/service";
export function telegramConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (
    env.SMARTMANU_TELEGRAM_MODE !== "local" ||
    !env.TELEGRAM_WEBHOOK_SECRET ||
    env.TELEGRAM_WEBHOOK_SECRET.length < 32 ||
    !env.TELEGRAM_LINK_ENCRYPTION_KEY?.match(/^[a-f0-9]{64}$/i)
  )
    throw new CatalogueError(
      503,
      "Telegram connection testing is unavailable.",
    );
  return {
    mode: "local" as const,
    secret: env.TELEGRAM_WEBHOOK_SECRET,
    key: Buffer.from(env.TELEGRAM_LINK_ENCRYPTION_KEY, "hex"),
  };
}
export type TelegramConfig = ReturnType<typeof telegramConfig>;
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const chatHash = (chat: string, config: TelegramConfig) =>
  createHmac("sha256", config.key)
    .update("telegram-chat:" + chat)
    .digest("hex");
export function encryptChat(
  chat: string,
  userId: string,
  config: TelegramConfig,
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", config.key, iv);
  cipher.setAAD(Buffer.from(userId));
  const data = Buffer.concat([cipher.update(chat, "utf8"), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: data.toString("base64url"),
  });
}
export function decryptChat(
  value: string,
  userId: string,
  config: TelegramConfig,
) {
  const v = JSON.parse(value),
    decipher = createDecipheriv(
      "aes-256-gcm",
      config.key,
      Buffer.from(v.iv, "base64url"),
    );
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(v.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(v.data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
export function authenticateTelegram(
  secret: string | null,
  config: TelegramConfig,
) {
  const actual = Buffer.from(secret ?? ""),
    expected = Buffer.from(config.secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new CatalogueError(401, "Invalid webhook authentication.");
}
export async function telegramStatus(sql: SQL, userId: string) {
  const row = (
    await sql.query(
      "SELECT state,version,chat_suffix FROM telegram_bindings WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  return {
    state: (row?.state ?? "disconnected") as
      "disconnected" | "pending" | "active" | "revoked",
    version: Number(row?.version ?? 0),
    chatSuffix: row?.chat_suffix ? String(row.chat_suffix) : null,
    mode: "local" as const,
  };
}
export async function issueTelegramLink(
  sql: SQL,
  userId: string,
  now = new Date(),
) {
  return sql.transaction(async (tx) => {
    await tx.query(
      "SELECT id FROM telegram_connection_lock WHERE id=1 FOR UPDATE",
    );
    await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
      userId,
    ]);
    const recent = (
      await tx.query(
        "SELECT issued_at FROM telegram_link_tokens WHERE user_id=$1 ORDER BY issued_at DESC LIMIT 1",
        [userId],
      )
    ).rows[0];
    if (
      recent &&
      new Date(String(recent.issued_at)).getTime() > now.getTime() - 60000
    )
      throw new CatalogueError(
        429,
        "Wait one minute before creating another link.",
      );
    await tx.query(
      "UPDATE telegram_link_tokens SET used_at=$2 WHERE user_id=$1 AND used_at IS NULL",
      [userId, now.toISOString()],
    );
    const token = randomBytes(32).toString("base64url"),
      expiresAt = new Date(now.getTime() + 600000).toISOString();
    await tx.query(
      "INSERT INTO telegram_link_tokens(token_hash,user_id,issued_at,expires_at) VALUES($1,$2,$3,$4)",
      [tokenHash(token), userId, now.toISOString(), expiresAt],
    );
    return {
      token,
      expiresAt,
      startCommand: "/start " + token,
      mode: "local" as const,
    };
  });
}
async function pauseTelegram(tx: SQL, userId: string) {
  await tx.query(
    "UPDATE notification_preferences SET enabled=false,consent_version=NULL,next_due_at=NULL,version=version+1 WHERE user_id=$1 AND channel='telegram'",
    [userId],
  );
  await tx.query(
    "DELETE FROM notification_digest_events WHERE state='planned' AND digest_id IN (SELECT id FROM notification_digests WHERE user_id=$1 AND channel='telegram' AND state='queued')",
    [userId],
  );
  await tx.query(
    "UPDATE notification_digests SET state='suppressed' WHERE user_id=$1 AND channel='telegram' AND state='queued'",
    [userId],
  );
}
export async function changeTelegramBinding(
  sql: SQL,
  userId: string,
  input: unknown,
) {
  const value = z
    .object({
      action: z.enum(["confirm", "disconnect"]),
      expectedVersion: z.number().int().min(0),
    })
    .strict()
    .parse(input);
  return sql.transaction(async (tx) => {
    await tx.query(
      "SELECT id FROM telegram_connection_lock WHERE id=1 FOR UPDATE",
    );
    await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
      userId,
    ]);
    const binding = (
      await tx.query(
        "SELECT state,version FROM telegram_bindings WHERE user_id=$1 FOR UPDATE",
        [userId],
      )
    ).rows[0];
    if (Number(binding?.version ?? 0) !== value.expectedVersion)
      throw new CatalogueError(409, "Connection changed. Reload and retry.");
    if (value.action === "confirm") {
      if (binding?.state !== "pending")
        throw new CatalogueError(409, "No pending connection to confirm.");
      await tx.query(
        "UPDATE telegram_bindings SET state='active',version=version+1,updated_at=NOW() WHERE user_id=$1",
        [userId],
      );
    } else {
      await tx.query(
        "UPDATE telegram_link_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL",
        [userId],
      );
      await tx.query(
        "UPDATE telegram_bindings SET state='revoked',version=version+1,updated_at=NOW() WHERE user_id=$1",
        [userId],
      );
      await pauseTelegram(tx, userId);
    }
    return telegramStatus(tx, userId);
  });
}
const id = z.number().int().positive().safe();
const chat = z.object({ id: z.number().int().safe(), type: z.string() });
const sender = z.object({ id, is_bot: z.boolean() });
const message = z.object({
  date: z.number().int().nonnegative().safe(),
  chat,
  from: sender.optional(),
  text: z.string().max(4096).optional(),
});
const member = z.object({
  date: z.number().int().nonnegative().safe(),
  chat,
  new_chat_member: z.object({ status: z.string() }),
});
const updateSchema = z.object({
  update_id: z.number().int().nonnegative().safe(),
  message: message.optional(),
  my_chat_member: member.optional(),
});
async function lockChatEvent(
  tx: SQL,
  hash: string,
  date: number,
  updateId: number,
) {
  await tx.query(
    "INSERT INTO telegram_chat_events(chat_hash,event_date,update_id,blocked) VALUES($1,-1,-1,false) ON CONFLICT DO NOTHING",
    [hash],
  );
  const row = (
    await tx.query(
      "SELECT * FROM telegram_chat_events WHERE chat_hash=$1 FOR UPDATE",
      [hash],
    )
  ).rows[0];
  return (
    Number(row.event_date) < date ||
    (Number(row.event_date) === date && Number(row.update_id) < updateId)
  );
}
export async function handleTelegramUpdate(
  sql: SQL,
  input: unknown,
  config: TelegramConfig,
  now = new Date(),
) {
  const update = updateSchema.parse(input),
    m = update.message;
  const token = m?.text?.match(/^\/start ([A-Za-z0-9_-]{43})$/)?.[1];
  return sql.transaction(async (tx) => {
    await tx.query(
      "SELECT id FROM telegram_connection_lock WHERE id=1 FOR UPDATE",
    );
    let owner: string | undefined;
    if (
      token &&
      m?.chat.type === "private" &&
      m.from &&
      !m.from.is_bot &&
      m.from.id === m.chat.id
    ) {
      owner = (
        await tx.query(
          "SELECT user_id FROM telegram_link_tokens WHERE token_hash=$1",
          [tokenHash(token)],
        )
      ).rows[0]?.user_id as string | undefined;
    }
    const blocked =
      update.my_chat_member?.chat.type === "private" &&
      ["kicked", "left"].includes(update.my_chat_member.new_chat_member.status);
    if (blocked) {
      owner = (
        await tx.query(
          "SELECT user_id FROM telegram_bindings WHERE chat_hash=$1 AND state IN ('pending','active')",
          [chatHash(String(update.my_chat_member!.chat.id), config)],
        )
      ).rows[0]?.user_id as string | undefined;
    }

    if (owner)
      await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
        owner,
      ]);
    if (
      !(
        await tx.query(
          "INSERT INTO telegram_webhook_updates(update_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING update_id",
          [update.update_id],
        )
      ).rows.length
    )
      return "duplicate";
    if (blocked) {
      const event = update.my_chat_member!,
        hash = chatHash(String(event.chat.id), config);
      if (!(await lockChatEvent(tx, hash, event.date, update.update_id)))
        return "ignored";
      await tx.query(
        "UPDATE telegram_chat_events SET event_date=$2,update_id=$3,blocked=true WHERE chat_hash=$1",
        [hash, event.date, update.update_id],
      );
    }
    if (!owner) return "ignored";
    if (blocked) {
      const event = update.my_chat_member!;
      const binding = (
        await tx.query(
          "SELECT * FROM telegram_bindings WHERE user_id=$1 FOR UPDATE",
          [owner],
        )
      ).rows[0];
      if (
        !binding ||
        binding.chat_hash !== chatHash(String(event.chat.id), config) ||
        Number(binding.event_date) > event.date ||
        (Number(binding.event_date) === event.date &&
          Number(binding.update_id) >= update.update_id)
      )
        return "ignored";
      await tx.query(
        "UPDATE telegram_bindings SET state='revoked',version=version+1,event_date=$2,update_id=$3,updated_at=NOW() WHERE user_id=$1",
        [owner, event.date, update.update_id],
      );
      await tx.query(
        "UPDATE telegram_link_tokens SET used_at=$2 WHERE user_id=$1 AND used_at IS NULL",
        [owner, now.toISOString()],
      );
      await pauseTelegram(tx, owner);
      return "revoked";
    }
    if (!token || !m || m.date > Math.floor(now.getTime() / 1000) + 300)
      return "ignored";
    const link = (
      await tx.query(
        "SELECT * FROM telegram_link_tokens WHERE token_hash=$1 FOR UPDATE",
        [tokenHash(token)],
      )
    ).rows[0];
    if (!link || link.used_at || new Date(String(link.expires_at)) <= now)
      return "ignored";
    const previous = (
      await tx.query(
        "SELECT * FROM telegram_bindings WHERE user_id=$1 FOR UPDATE",
        [owner],
      )
    ).rows[0];
    if (
      previous &&
      (Number(previous.event_date) > m.date ||
        (Number(previous.event_date) === m.date &&
          Number(previous.update_id) >= update.update_id))
    )
      return "ignored";
    const hash = chatHash(String(m.chat.id), config);
    if (!(await lockChatEvent(tx, hash, m.date, update.update_id)))
      return "ignored";
    if (
      (
        await tx.query(
          "SELECT user_id FROM telegram_bindings WHERE chat_hash=$1 AND user_id<>$2 AND state IN ('pending','active')",
          [hash, owner],
        )
      ).rows.length
    )
      return "ignored";
    await tx.query(
      "INSERT INTO telegram_bindings(user_id,state,chat_hash,encrypted_chat,chat_suffix,event_date,update_id) VALUES($1,'pending',$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET state='pending',chat_hash=$2,encrypted_chat=$3,chat_suffix=$4,event_date=$5,update_id=$6,version=telegram_bindings.version+1,updated_at=NOW()",
      [
        owner,
        hash,
        encryptChat(String(m.chat.id), owner, config),
        String(m.chat.id).slice(-4),
        m.date,
        update.update_id,
      ],
    );
    await tx.query(
      "UPDATE telegram_chat_events SET event_date=$2,update_id=$3,blocked=false WHERE chat_hash=$1",
      [hash, m.date, update.update_id],
    );
    await tx.query(
      "UPDATE telegram_link_tokens SET used_at=$2 WHERE token_hash=$1",
      [tokenHash(token), now.toISOString()],
    );
    await pauseTelegram(tx, owner);
    return "pending";
  });
}
