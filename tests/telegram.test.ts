import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import { openDatabase } from "../src/db";
import {
  telegramConfig,
  authenticateTelegram,
  encryptChat,
  decryptChat,
  issueTelegramLink,
  handleTelegramUpdate,
  changeTelegramBinding,
  telegramStatus,
} from "../src/channels/telegram";
const config = telegramConfig({
  SMARTMANU_TELEGRAM_MODE: "local",
  TELEGRAM_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
  TELEGRAM_LINK_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
});
test("Telegram configuration, webhook authentication and encrypted destination boundaries", () => {
  assert.throws(() => telegramConfig({}));
  assert.throws(() => authenticateTelegram(null, config));
  assert.throws(() => authenticateTelegram("x".repeat(64), config));
  authenticateTelegram(config.secret, config);
  const value = encryptChat("123456789", "owner", config);
  assert.ok(!value.includes("123456789"));
  assert.equal(decryptChat(value, "owner", config), "123456789");
  assert.throws(() => decryptChat(value, "other-owner", config));
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: single-use Telegram tokens, owner confirmation, replay, block and disconnect`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-telegram-")),
        schema = "telegram_" + randomUUID().replaceAll("-", "");
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
        for (const id of ["a", "b"])
          await db.sql.query(
            "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
            [id, id + "@example.test"],
          );
        const first = await issueTelegramLink(db.sql, "a");
        assert.equal(first.token.length, 43);
        await assert.rejects(
          () => issueTelegramLink(db.sql, "a"),
          /Wait one minute/,
        );
        assert.ok(
          !JSON.stringify(
            (await db.sql.query("SELECT * FROM telegram_link_tokens")).rows,
          ).includes(first.token),
        );
        const date = Math.floor(Date.now() / 1000),
          start = (
            token: string,
            id = 1,
            chatId = 123456789,
            type = "private",
          ) => ({
            update_id: id,
            message: {
              date,
              chat: { id: chatId, type },
              from: { id: Math.abs(chatId), is_bot: false },
              text: "/start " + token,
            },
          });
        assert.equal(
          await handleTelegramUpdate(
            db.sql,
            start(first.token, 1, -123, "group"),
            config,
          ),
          "ignored",
        );
        assert.equal(
          await handleTelegramUpdate(db.sql, start(first.token, 2), config),
          "pending",
        );
        assert.equal(
          await handleTelegramUpdate(db.sql, start(first.token, 2), config),
          "duplicate",
        );
        assert.equal(
          await handleTelegramUpdate(db.sql, start(first.token, 3), config),
          "ignored",
        );
        assert.equal((await telegramStatus(db.sql, "a")).state, "pending");
        assert.equal((await telegramStatus(db.sql, "b")).state, "disconnected");
        await assert.rejects(
          () =>
            changeTelegramBinding(db.sql, "b", {
              action: "confirm",
              expectedVersion: 0,
            }),
          /No pending/,
        );
        assert.equal(
          await handleTelegramUpdate(
            db.sql,
            {
              ...start(first.token, 8),
              message: {
                ...start(first.token, 8).message,
                from: { id: 999, is_bot: false },
              },
            },
            config,
          ),
          "ignored",
        );
        const confirmed = await changeTelegramBinding(db.sql, "a", {
          action: "confirm",
          expectedVersion: 1,
        });
        assert.equal(confirmed.state, "active");
        const conflict = await issueTelegramLink(db.sql, "b");
        assert.equal(
          await handleTelegramUpdate(db.sql, start(conflict.token, 10), config),
          "ignored",
        );
        await db.sql.query(
          "UPDATE telegram_link_tokens SET issued_at=NOW()-INTERVAL '2 minutes' WHERE user_id='b'",
        );
        const stored = (
          await db.sql.query(
            "SELECT encrypted_chat FROM telegram_bindings WHERE user_id='a'",
          )
        ).rows[0];
        assert.equal(
          decryptChat(String(stored.encrypted_chat), "a", config),
          "123456789",
        );
        await assert.rejects(
          () =>
            changeTelegramBinding(db.sql, "a", {
              action: "disconnect",
              expectedVersion: 1,
            }),
          /changed/,
        );
        await db.sql.query(
          "INSERT INTO notification_preferences(user_id,enabled,channel,consent_version) VALUES('a',true,'telegram','local-sink-v1')",
        );
        await db.sql.query(
          "INSERT INTO notification_digests(id,user_id,preference_version,channel,slot) VALUES('binding-test','a',1,'telegram','fixture')",
        );
        await db.sql.query(
          "INSERT INTO notification_digest_events(user_id,event_key,opportunity_id,fingerprint,digest_id) VALUES('a','binding-test','synthetic-course','fixture','binding-test')",
        );
        const block = {
          update_id: 4,
          my_chat_member: {
            date: date + 1,
            chat: { id: 123456789, type: "private" },
            new_chat_member: { status: "kicked" },
          },
        };
        assert.equal(
          await handleTelegramUpdate(db.sql, block, config),
          "revoked",
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT enabled FROM notification_preferences WHERE user_id='a'",
            )
          ).rows[0].enabled,
          false,
        );
        assert.equal(
          await handleTelegramUpdate(
            db.sql,
            {
              ...block,
              update_id: 5,
              my_chat_member: { ...block.my_chat_member, date: date - 10 },
            },
            config,
          ),
          "ignored",
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT state FROM notification_digests WHERE id='binding-test'",
            )
          ).rows[0].state,
          "suppressed",
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT * FROM notification_digest_events WHERE digest_id='binding-test'",
            )
          ).rows.length,
          0,
        );
        await db.close();
        db = await openDatabase(dir, url);
        assert.equal(
          await handleTelegramUpdate(db.sql, block, config),
          "duplicate",
        );
        assert.equal((await telegramStatus(db.sql, "a")).state, "revoked");
        const competing = await issueTelegramLink(db.sql, "b");
        assert.equal(
          await handleTelegramUpdate(
            db.sql,
            start(competing.token, 9, 987654321),
            config,
          ),
          "pending",
        );
        // A distinct private chat can be linked after owner confirmation.
        await changeTelegramBinding(db.sql, "b", {
          action: "disconnect",
          expectedVersion: 1,
        });
        await db.sql.query(
          "UPDATE telegram_link_tokens SET issued_at=NOW()-INTERVAL '2 minutes' WHERE user_id='b'",
        );
        const b = await issueTelegramLink(db.sql, "b");
        await db.sql.query(
          "UPDATE telegram_link_tokens SET expires_at=NOW()-INTERVAL '1 second' WHERE user_id='b'",
        );
        assert.equal(
          await handleTelegramUpdate(
            db.sql,
            start(b.token, 6, 987654321),
            config,
          ),
          "ignored",
        );
        await db.sql.query(
          "UPDATE telegram_link_tokens SET issued_at=NOW()-INTERVAL '2 minutes' WHERE user_id='b'",
        );
        const replacement = await issueTelegramLink(db.sql, "b");
        await changeTelegramBinding(db.sql, "b", {
          action: "disconnect",
          expectedVersion: 2,
        });
        assert.equal(
          await handleTelegramUpdate(
            db.sql,
            start(replacement.token, 7, 987654321),
            config,
          ),
          "ignored",
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
