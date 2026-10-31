import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import {
  seedLocalCatalogue,
  fixtureDetails,
  fixtureEvidence,
} from "../src/catalogue/fixtures";
import { createDraft, reviewOpportunity } from "../src/catalogue/service";
import { updateTracker } from "../src/domain/tracker";
import { saveProfile } from "../src/domain/profile";
import { nextDigestSlot } from "../src/jobs/digest-schedule";
import {
  saveNotificationSettings,
  readNotificationSettings,
  planOneDigest,
  dispatchDigest,
  digestHistory,
} from "../src/jobs/digests";
test("digest scheduling uses local 09:00, Monday slots and DST offsets", () => {
  const next = (
    date: string,
    zone: string,
    frequency: "daily" | "weekly" = "daily",
  ) => nextDigestSlot(new Date(date), zone, frequency).toISOString();
  assert.equal(
    next("2026-10-31T07:59:00Z", "Africa/Lagos"),
    "2026-10-31T08:00:00.000Z",
  );
  assert.equal(
    next("2026-10-31T08:00:00Z", "Africa/Lagos"),
    "2026-11-01T08:00:00.000Z",
  );
  assert.equal(
    next("2026-03-07T15:00:00Z", "America/New_York"),
    "2026-03-08T13:00:00.000Z",
  );
  assert.equal(
    next("2026-10-31T15:00:00Z", "America/New_York"),
    "2026-11-01T14:00:00.000Z",
  );
  assert.equal(
    next("2026-10-31T15:00:00Z", "America/New_York", "weekly"),
    "2026-11-02T14:00:00.000Z",
  );
  assert.equal(
    next("2011-12-29T21:00:00Z", "Pacific/Apia"),
    "2011-12-30T19:00:00.000Z",
  );
  assert.throws(() => next("2026-10-31T07:59:00Z", "invalid/zone"));
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: consent, capped digest overflow, deduplication, rechecks and pause persist`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-digests-")),
        schema = "digest_" + randomUUID().replaceAll("-", "");
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
        const admin = "local-fixture-reviewer",
          user = "digest-user";
        await db.sql.query(
          "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,'Digest user','digest@example.test',NOW(),NOW())",
          [user],
        );
        await saveProfile(db.sql, user, {
          alertLanguage: "zh-Hans",
          teachingLanguages: ["en"],
        });
        const sourceId = (
          await db.sql.query(
            "SELECT source_id FROM opportunities WHERE id='synthetic-course'",
          )
        ).rows[0].source_id;
        async function publish(title: string) {
          const draft = await createDraft(db.sql, admin, {
            sourceId,
            details: { ...fixtureDetails, title },
            evidence: fixtureEvidence,
            note: "Synthetic digest fixture.",
          });
          await reviewOpportunity(db.sql, admin, draft.id, {
            action: "publish",
            expectedRevision: 1,
            verified: true,
            note: "Approve synthetic digest fixture.",
          });
          return draft.id;
        }
        for (let n = 0; n < 11; n++)
          await publish("Synthetic digest course " + n);
        const settings = {
          expectedVersion: 0,
          enabled: true,
          channel: "email",
          frequency: "daily",
          timezone: "Africa/Lagos",
          consent: true,
        };
        await assert.rejects(() =>
          saveNotificationSettings(db.sql, user, {
            ...settings,
            consent: false,
          }),
        );
        await assert.rejects(() =>
          saveNotificationSettings(db.sql, user, {
            ...settings,
            userId: "another-user",
          }),
        );
        await assert.rejects(() =>
          saveNotificationSettings(db.sql, user, {
            ...settings,
            timezone: "invalid/zone",
          }),
        );
        assert.equal((await readNotificationSettings(db.sql, user)).version, 0);
        await saveNotificationSettings(db.sql, user, settings);
        await assert.rejects(
          () => saveNotificationSettings(db.sql, user, settings),
          /changed/,
        );
        const due = async (days = 0) =>
          db.sql.query(
            "UPDATE notification_preferences SET next_due_at=$2 WHERE user_id=$1",
            [user, new Date(Date.now() - days * 86400000 - 1000).toISOString()],
          );
        await due();
        const planned = await Promise.all([
          planOneDigest(db.sql),
          planOneDigest(db.sql),
        ]);
        assert.equal(planned.filter((v) => v === "queued").length, 1);
        assert.equal(
          (await db.sql.query("SELECT * FROM notification_digest_events")).rows
            .length,
          10,
        );
        await db.close();
        db = await openDatabase(dir, url);
        const sent = await Promise.all([
          dispatchDigest(db.sql),
          dispatchDigest(db.sql),
        ]);
        assert.equal(sent.filter((v) => v === "accepted").length, 1);
        let messages = (await db.sql.query("SELECT payload FROM sink_messages"))
          .rows;
        assert.equal(messages.length, 1);
        assert.equal(
          (messages[0].payload as { items: unknown[] }).items.length,
          10,
        );
        assert.equal(
          (messages[0].payload as { translationFallback: boolean })
            .translationFallback,
          true,
        );
        await due(1);
        assert.equal(await planOneDigest(db.sql), "queued");
        assert.equal(await dispatchDigest(db.sql), "accepted");
        messages = (await db.sql.query("SELECT payload FROM sink_messages"))
          .rows;
        assert.equal(messages.length, 2);
        assert.equal(
          messages.reduce(
            (n, row) => n + (row.payload as { items: unknown[] }).items.length,
            0,
          ),
          12,
        );
        await due(2);
        assert.equal(await planOneDigest(db.sql), "empty_digest");
        await saveNotificationSettings(db.sql, user, {
          ...settings,
          expectedVersion: 1,
          channel: "telegram",
        });
        await due();
        assert.equal(await planOneDigest(db.sql), "empty_digest");
        const pendingId = await publish("Synthetic pending channel course");
        await due();
        assert.equal(await planOneDigest(db.sql), "queued");
        await saveNotificationSettings(db.sql, user, {
          ...settings,
          expectedVersion: 2,
          enabled: false,
          consent: false,
          channel: "telegram",
        });
        assert.equal(await dispatchDigest(db.sql), "empty");
        assert.equal(
          (
            await db.sql.query(
              "SELECT * FROM notification_digest_events WHERE state='planned'",
            )
          ).rows.length,
          0,
        );
        await saveNotificationSettings(db.sql, user, {
          ...settings,
          expectedVersion: 3,
          channel: "telegram",
        });
        await due();
        assert.equal(await planOneDigest(db.sql), "queued");
        await saveProfile(db.sql, user, { teachingLanguages: ["zh"] });
        assert.equal(await dispatchDigest(db.sql), "suppressed");
        await saveProfile(db.sql, user, { teachingLanguages: ["en"] });
        await due(1);
        assert.equal(await planOneDigest(db.sql), "queued");
        await db.sql.query(
          "UPDATE opportunities SET verified_at=NOW()-INTERVAL '2 days' WHERE id=$1",
          [pendingId],
        );
        assert.equal(await dispatchDigest(db.sql), "suppressed");
        await due(2);
        assert.equal(await planOneDigest(db.sql), "empty_digest");
        const closedId = await publish("Synthetic closed digest course");
        await due(3);
        assert.equal(await planOneDigest(db.sql), "queued");
        await reviewOpportunity(db.sql, admin, closedId, {
          action: "close",
          expectedRevision: 2,
          note: "Close before any local dispatch.",
        });
        assert.equal(await dispatchDigest(db.sql), "suppressed");
        assert.equal(
          (await db.sql.query("SELECT * FROM sink_messages")).rows.length,
          2,
        );
        assert.equal(
          (await readNotificationSettings(db.sql, admin)).enabled,
          false,
        );
        assert.equal((await digestHistory(db.sql, admin)).length, 0);
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
