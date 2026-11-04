import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import { saveProfile } from "../src/domain/profile";
import {
  readNotificationSettings,
  saveNotificationSettings,
} from "../src/jobs/digests";
import { buildUpcomingDigestPreview } from "../app/api/me/notifications/preview/route";

test("PGlite: previews fresh unseen digest content without scheduling or sending", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-digest-preview-"));
  const db = await openDatabase(dir);
  try {
    await seedLocalCatalogue(db.sql);
    await db.sql.query(
      "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('preview-user','Preview user','preview@example.test',NOW(),NOW())",
    );
    await saveProfile(db.sql, "preview-user", { alertLanguage: "zh-Hans" });
    const preview = await buildUpcomingDigestPreview(
      db.sql,
      "preview-user",
      new Date(Date.now() + 1000),
    );
    assert.equal(preview.enabled, false);
    assert.equal(preview.channel, "email");
    assert.equal(preview.language, "zh-Hans");
    assert.equal(preview.translationFallback, false);
    assert.equal(preview.providerMessageSent, false);
    assert.equal(preview.items.length, 1);
    assert.equal(preview.items[0].id, "synthetic-course");
    assert.equal(preview.items[0].sourceURL, null);
    assert.match(preview.renderedText, /模拟投递测试/);
    assert.equal(
      (await db.sql.query("SELECT id FROM notification_digests")).rows.length,
      0,
    );
    assert.equal(
      (await db.sql.query("SELECT event_key FROM notification_digest_events"))
        .rows.length,
      0,
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("deadline reminder preference persists independently from digest settings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-reminder-setting-"));
  const db = await openDatabase(dir);
  try {
    await db.sql.query(
      "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('setting-user','Setting user','setting@example.test',NOW(),NOW())",
    );
    assert.equal(
      (await readNotificationSettings(db.sql, "setting-user"))
        .deadlineRemindersEnabled,
      false,
    );
    const enabled = await saveNotificationSettings(db.sql, "setting-user", {
      expectedVersion: 0,
      enabled: true,
      deadlineRemindersEnabled: true,
      channel: "telegram",
      frequency: "weekly",
      timezone: "UTC",
      consent: true,
    });
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.deadlineRemindersEnabled, true);
    const disabled = await saveNotificationSettings(db.sql, "setting-user", {
      expectedVersion: 1,
      enabled: true,
      deadlineRemindersEnabled: false,
      channel: "telegram",
      frequency: "weekly",
      timezone: "UTC",
      consent: true,
    });
    assert.equal(disabled.enabled, true);
    assert.equal(disabled.deadlineRemindersEnabled, false);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
