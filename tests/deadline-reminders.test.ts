import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db";
import { fixtureDetails, seedLocalCatalogue } from "../src/catalogue/fixtures";
import {
  deadlineReminderEventKey,
  deadlineReminderThreshold,
  daysUntilDeadline,
} from "../src/domain/reminders";
import { dispatchDeadlineReminders } from "../src/jobs/deadline-reminders";

test("date-only reminder windows use UTC calendar days and suppress expired deadlines", () => {
  const now = new Date("2026-11-04T23:59:00.000Z");
  assert.equal(daysUntilDeadline("2026-11-11", now), 7);
  assert.equal(deadlineReminderThreshold("2026-11-11", now), 7);
  assert.equal(deadlineReminderThreshold("2026-11-06", now), 2);
  assert.equal(deadlineReminderThreshold("2026-11-05", now), 2);
  assert.equal(deadlineReminderThreshold("2026-11-12", now), null);
  assert.equal(deadlineReminderThreshold("2026-11-03", now), null);
  assert.throws(() => daysUntilDeadline("2026-02-30", now));
});

test("deadline reminders target interested/applying saves and deduplicate concurrent runs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-deadline-reminders-"));
  const db = await openDatabase(dir);
  const now = new Date("2026-11-04T12:00:00.000Z");
  try {
    await seedLocalCatalogue(db.sql);
    const sourceId = (
      await db.sql.query(
        "SELECT source_id FROM opportunities WHERE id='synthetic-course'",
      )
    ).rows[0].source_id;
    const users = ["interested-user", "applying-user", "applied-user"];
    for (const user of users) {
      await db.sql.query(
        "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
        [user, `${user}@example.test`],
      );
      await db.sql.query(
        "INSERT INTO notification_preferences(user_id,enabled,channel,consent_version) VALUES($1,true,'telegram','local-sink-v1')",
        [user],
      );
    }
    await db.sql.query(
      "INSERT INTO profiles(user_id,preferences) VALUES($1,$2)",
      ["applying-user", JSON.stringify({ alertLanguage: "zh-Hans" })],
    );

    const due7 = new Date(now.getTime() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    const due2 = new Date(now.getTime() + 2 * 86400000)
      .toISOString()
      .slice(0, 10);
    for (const [id, deadline] of [
      ["deadline-seven", due7],
      ["deadline-two", due2],
    ]) {
      const details = {
        ...fixtureDetails,
        deadline,
        deadlineText: `Apply by ${deadline}`,
      };
      await db.sql.query(
        "INSERT INTO opportunities(id,source_id,revision,state,details,evidence,verified_at) VALUES($1,$2,1,'published',$3,'{}',$4)",
        [id, sourceId, JSON.stringify(details), now.toISOString()],
      );
    }
    await db.sql.query(
      "INSERT INTO saved_items(user_id,opportunity_id,status,saved) VALUES('interested-user','deadline-seven','interested',true),('applying-user','deadline-two','applying',true),('applied-user','deadline-seven','applied',true)",
    );

    const concurrent = await Promise.all([
      dispatchDeadlineReminders(db.sql, now),
      dispatchDeadlineReminders(db.sql, now),
    ]);
    assert.equal(
      concurrent.reduce((n, r) => n + r.sent, 0),
      2,
    );
    assert.equal(
      concurrent.reduce((n, r) => n + r.duplicates, 0),
      2,
    );
    const messages = (
      await db.sql.query(
        "SELECT channel,payload FROM sink_messages ORDER BY event_key",
      )
    ).rows;
    assert.equal(messages.length, 2);
    const payloads = messages.map(
      (row) => row.payload as Record<string, unknown>,
    );
    assert.deepEqual(
      payloads.map((payload) => payload.thresholdDays).sort(),
      [2, 7],
    );
    const localized = payloads.find(
      (payload) => payload.language === "zh-Hans",
    );
    assert.ok(
      localized?.message && String(localized.message).includes("申请截止日期"),
    );
    assert.ok(payloads.every((payload) => payload.sourceURL === null));

    const repeated = await dispatchDeadlineReminders(db.sql, now);
    assert.equal(repeated.sent, 0);
    assert.equal(repeated.duplicates, 2);
    assert.equal(
      (
        await db.sql.query(
          "SELECT COUNT(*) AS count FROM sink_messages WHERE payload->>'type'='deadline_reminder'",
        )
      ).rows[0].count,
      2,
    );

    await db.sql.query(
      "UPDATE saved_items SET status='applied' WHERE user_id='interested-user' AND opportunity_id='deadline-seven'",
    );
    const applied = await dispatchDeadlineReminders(db.sql, now);
    assert.equal(applied.sent, 0);
    assert.equal(applied.scanned, 1);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("event keys distinguish deadline revisions and reminder thresholds", () => {
  const base = {
    userId: "user-a",
    opportunityId: "opportunity-a",
    revision: 2,
    deadline: "2026-11-11",
    threshold: 7 as const,
  };
  assert.equal(deadlineReminderEventKey(base), deadlineReminderEventKey(base));
  assert.notEqual(
    deadlineReminderEventKey(base),
    deadlineReminderEventKey({ ...base, threshold: 2 }),
  );
  assert.notEqual(
    deadlineReminderEventKey(base),
    deadlineReminderEventKey({ ...base, revision: 3 }),
  );
});
