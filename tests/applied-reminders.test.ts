import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openDatabase, type SQL } from "../src/db";
import { fixtureDetails, seedLocalCatalogue } from "../src/catalogue/fixtures";
import {
  readNotificationSettings,
  saveNotificationSettings,
} from "../src/jobs/digests";
import { dispatchDeadlineReminders } from "../src/jobs/deadline-reminders";
import { accountExport } from "../src/privacy/account";
import NotificationSettings from "../app/notifications/settings";
import { LocaleProvider } from "../src/i18n/context";

for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: applied reminders require independent opt-in, preserve owner settings and recheck before acceptance`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-applied-"));
      const schema = "applied_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", `-c search_path=${schema}`);
        url = parsed.href;
      }
      const db = await openDatabase(dir, url);
      const now = new Date("2026-11-06T12:00:00Z");
      try {
        await seedLocalCatalogue(db.sql);
        for (const id of ["applied-owner", "other-owner"])
          await db.sql.query(
            "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
            [id, id + "@example.test"],
          );
        assert.equal(
          (await readNotificationSettings(db.sql, "applied-owner"))
            .appliedRemindersEnabled,
          false,
        );
        const save = async (changes: Record<string, unknown> = {}) => {
          const current = await readNotificationSettings(
            db.sql,
            "applied-owner",
          );
          return saveNotificationSettings(
            db.sql,
            "applied-owner",
            {
              expectedVersion: current.version,
              enabled: true,
              channel: "telegram",
              frequency: "weekly",
              timezone: "UTC",
              consent: true,
              ...changes,
            },
            now,
          );
        };
        await save({ deadlineRemindersEnabled: true });
        await db.sql.query(
          "UPDATE opportunities SET details=$1,verified_at=$2 WHERE id='synthetic-course'",
          [
            JSON.stringify({ ...fixtureDetails, deadline: "2026-11-13" }),
            now.toISOString(),
          ],
        );
        await db.sql.query(
          "INSERT INTO saved_items(user_id,opportunity_id,status,saved) VALUES('applied-owner','synthetic-course','applied',true)",
        );
        assert.equal((await dispatchDeadlineReminders(db.sql, now)).sent, 0);
        await assert.rejects(save({ appliedRemindersEnabled: "yes" }));
        const opted = await save({ appliedRemindersEnabled: true });
        assert.equal(opted.appliedRemindersEnabled, true);
        assert.equal(opted.deadlineRemindersEnabled, true);
        assert.equal(
          (await readNotificationSettings(db.sql, "other-owner"))
            .appliedRemindersEnabled,
          false,
        );
        await assert.rejects(
          saveNotificationSettings(db.sql, "applied-owner", {
            expectedVersion: 0,
            enabled: true,
            channel: "telegram",
            frequency: "weekly",
            timezone: "UTC",
            consent: true,
            appliedRemindersEnabled: false,
          }),
          /changed/,
        );
        // Omission by legacy/onboarding clients preserves the stored choice.
        assert.equal(
          (await save({ frequency: "daily" })).appliedRemindersEnabled,
          true,
        );
        assert.equal(
          (await accountExport(db.sql, "applied-owner")).notifications
            ?.applied_reminders_enabled,
          true,
        );
        for (const [locale, pattern] of [
          ["en", /Keep deadline reminders/],
          ["zh-Hans", /已标记为已申请/],
        ] as const) {
          const html = renderToStaticMarkup(
            createElement(LocaleProvider, {
              locale,
              children: createElement(NotificationSettings, {
                initial: await readNotificationSettings(
                  db.sql,
                  "applied-owner",
                ),
                initialHistory: [],
              }),
            }),
          );
          assert.match(html, pattern);
          assert.match(html, /name="appliedRemindersEnabled"/);
        }
        const sent = await Promise.all([
          dispatchDeadlineReminders(db.sql, now),
          dispatchDeadlineReminders(db.sql, now),
        ]);
        assert.equal(
          sent.reduce((n, r) => n + r.sent, 0),
          1,
        );
        assert.equal((await dispatchDeadlineReminders(db.sql, now)).sent, 0);
        // Each new revision could qualify again, unless a current safety gate blocks it.
        const newRevision = () =>
          db.sql.query(
            "UPDATE opportunities SET revision=revision+1 WHERE id='synthetic-course'",
          );
        await newRevision();
        await save({ deadlineRemindersEnabled: false });
        assert.equal((await dispatchDeadlineReminders(db.sql, now)).sent, 0);
        await save({
          deadlineRemindersEnabled: true,
          enabled: false,
          consent: false,
        });
        assert.equal((await dispatchDeadlineReminders(db.sql, now)).sent, 0);
        await save();
        await db.sql.query(
          "UPDATE notification_preferences SET consent_version=NULL WHERE user_id='applied-owner'",
        );
        assert.equal((await dispatchDeadlineReminders(db.sql, now)).sent, 0);
        await save();
        await db.sql.query(
          "UPDATE saved_items SET saved=false WHERE user_id='applied-owner'",
        );
        assert.equal((await dispatchDeadlineReminders(db.sql, now)).sent, 0);
        await db.sql.query(
          "UPDATE saved_items SET saved=true WHERE user_id='applied-owner'",
        );
        await db.sql.query(
          "UPDATE opportunities SET verified_at=$1 WHERE id='synthetic-course'",
          ["2026-11-01T12:00:00Z"],
        );
        assert.equal((await dispatchDeadlineReminders(db.sql, now)).sent, 0);
        await db.sql.query(
          "UPDATE opportunities SET verified_at=$1 WHERE id='synthetic-course'",
          [now.toISOString()],
        );
        // Interleave an opt-out after the candidate scan and before its transaction.
        let changed = false;
        const interleaved: SQL = {
          query: db.sql.query.bind(db.sql),
          exec: db.sql.exec.bind(db.sql),
          transaction: async (fn) => {
            if (!changed) {
              changed = true;
              await save({ appliedRemindersEnabled: false });
            }
            return db.sql.transaction(fn);
          },
        };
        const rejected = await dispatchDeadlineReminders(interleaved, now);
        assert.equal(rejected.scanned, 1);
        assert.equal(rejected.suppressed, 1);
        assert.equal(rejected.sent, 0);
        // Opt-out does not remove already accepted reminders or block normal saves.
        assert.equal(
          (
            await db.sql.query(
              "SELECT event_key FROM sink_messages WHERE payload->>'type'='deadline_reminder'",
            )
          ).rows.length,
          1,
        );
        await db.sql.query(
          "UPDATE saved_items SET status='applying' WHERE user_id='applied-owner'",
        );
        assert.equal((await dispatchDeadlineReminders(db.sql, now)).sent, 1);
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
