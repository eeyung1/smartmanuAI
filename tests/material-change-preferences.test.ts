import { accountExport } from "../src/privacy/account";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openDatabase } from "../src/db";
import { fixtureDetails, seedLocalCatalogue } from "../src/catalogue/fixtures";
import {
  readNotificationSettings,
  saveNotificationSettings,
} from "../src/jobs/digests";
import { detectMaterialChangeAlerts } from "../src/jobs/material-changes";
import { dispatchOne } from "../src/jobs/local";
import NotificationSettings from "../app/notifications/settings";
import { LocaleProvider } from "../src/i18n/context";
process.env.SMARTMANU_EMAIL_MODE = "local";
process.env.NOTIFICATION_UNSUBSCRIBE_KEY = "a".repeat(64);
process.env.EMAIL_WEBHOOK_SIGNING_SECRET =
  "whsec_" + Buffer.alloc(32, 1).toString("base64");
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: change-alert opt-in is independent, owner-scoped and serialized with queue cancellation`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-change-prefs-")),
        schema = "change_prefs_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", `-c search_path=${schema}`);
        url = parsed.href;
      }
      const db = await openDatabase(dir, url);
      try {
        await seedLocalCatalogue(db.sql);
        for (const user of ["change-user", "other-user"]) {
          await db.sql.query(
            "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
            [user, user + "@example.test"],
          );
          await db.sql.query(
            "INSERT INTO saved_items(user_id,opportunity_id,status,saved) VALUES($1,'synthetic-course','applying',true)",
            [user],
          );
          await saveNotificationSettings(db.sql, user, {
            expectedVersion: 0,
            enabled: true,
            channel: "telegram",
            frequency: "weekly",
            timezone: "UTC",
            consent: true,
            deadlineRemindersEnabled: true,
          });
        }
        const revised = { ...fixtureDetails, funding: "unclear" };
        await db.sql.query(
          "INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note) VALUES('synthetic-course',3,'published',$1,'{}','local-fixture-reviewer','Funding withdrawal fixture')",
          [JSON.stringify(revised)],
        );
        await db.sql.query(
          "UPDATE opportunities SET revision=3,details=$1 WHERE id='synthetic-course'",
          [JSON.stringify(revised)],
        );
        assert.equal(
          (await readNotificationSettings(db.sql, "change-user"))
            .materialChangesEnabled,
          false,
        );
        assert.equal(
          (await detectMaterialChangeAlerts(db.sql)).queued,
          0,
          "legacy users are not automatically opted in",
        );
        const save = async (changes: Record<string, unknown>) => {
          const current = await readNotificationSettings(db.sql, "change-user");
          return saveNotificationSettings(db.sql, "change-user", {
            expectedVersion: current.version,
            enabled: current.enabled,
            channel: current.channel,
            frequency: current.frequency,
            timezone: current.timezone,
            consent: true,
            ...changes,
          });
        };
        const enabled = await save({
          materialChangesEnabled: true,
          deadlineRemindersEnabled: false,
        });
        assert.equal(enabled.materialChangesEnabled, true);
        assert.equal(
          (await accountExport(db.sql, "change-user")).notifications
            ?.material_changes_enabled,
          true,
        );
        assert.equal(enabled.deadlineRemindersEnabled, false);
        assert.equal((await detectMaterialChangeAlerts(db.sql)).queued, 1);
        let rows = (
          await db.sql.query(
            "SELECT id,payload,state FROM outbox WHERE user_id='change-user'",
          )
        ).rows;
        assert.equal(
          (rows[0].payload as Record<string, unknown>).channel,
          "telegram",
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT id FROM outbox WHERE user_id='other-user'",
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          saveNotificationSettings(db.sql, "change-user", {
            expectedVersion: 0,
            enabled: true,
            channel: "telegram",
            frequency: "weekly",
            timezone: "UTC",
            consent: true,
            materialChangesEnabled: false,
          }),
          /changed/,
        );
        await Promise.all([
          detectMaterialChangeAlerts(db.sql),
          save({ materialChangesEnabled: false }),
        ]);
        assert.equal(
          (await db.sql.query("SELECT id FROM outbox WHERE state='queued'"))
            .rows.length,
          0,
        );
        assert.equal(
          (
            await db.sql.query("SELECT state FROM outbox WHERE id=$1", [
              rows[0].id,
            ])
          ).rows[0].state,
          "suppressed",
        );
        await save({ materialChangesEnabled: true });
        assert.equal(
          (await detectMaterialChangeAlerts(db.sql)).queued,
          0,
          "re-enabling does not replay suppressed revisions",
        );
        await db.sql.query("UPDATE outbox SET state='queued' WHERE id=$1", [
          rows[0].id,
        ]);
        assert.equal(
          (await save({ channel: "email" })).materialChangesEnabled,
          true,
        );
        assert.equal(
          (
            await db.sql.query("SELECT state FROM outbox WHERE id=$1", [
              rows[0].id,
            ])
          ).rows[0].state,
          "suppressed",
          "channel changes cancel queued updates",
        );
        await db.sql.query("UPDATE outbox SET state='queued' WHERE id=$1", [
          rows[0].id,
        ]);
        assert.equal(
          await dispatchOne(db.sql),
          "suppressed",
          "local consumer cannot reroute an old-channel update",
        );
        await db.sql.query("UPDATE outbox SET state='queued' WHERE id=$1", [
          rows[0].id,
        ]);
        await save({ enabled: false });
        assert.equal(
          (
            await db.sql.query("SELECT state FROM outbox WHERE id=$1", [
              rows[0].id,
            ])
          ).rows[0].state,
          "suppressed",
          "master pause cancels updates",
        );
        assert.equal(
          (await readNotificationSettings(db.sql, "other-user"))
            .materialChangesEnabled,
          false,
        );
        const settings = await readNotificationSettings(db.sql, "change-user");
        for (const locale of ["en", "zh-Hans"] as const) {
          const html = renderToStaticMarkup(
            createElement(LocaleProvider, {
              locale,
              children: createElement(NotificationSettings, {
                initial: settings,
                initialHistory: [],
              }),
            }),
          );
          assert.match(html, /name="materialChangesEnabled"/);
          assert.match(
            html,
            locale === "en" ? /Send separate saved-item/ : /单独接收收藏项目/,
          );
        }
      } finally {
        await db.close();
        await rm(dir, { recursive: true, force: true });
        if (pool) {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          await pool.end();
        }
      }
    },
  );
