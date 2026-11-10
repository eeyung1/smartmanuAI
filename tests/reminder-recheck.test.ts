import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureDetails, seedLocalCatalogue } from "../src/catalogue/fixtures";
import { createSource } from "../src/catalogue/service";
import { openDatabase } from "../src/db";
import { deadlineReminderEventKey } from "../src/domain/reminders";
import { dispatchDeadlineReminders } from "../src/jobs/deadline-reminders";
import { verifyReminderCandidateFreshness } from "../src/jobs/reminder-recheck";

test("source rechecks verify, suppress and deduplicate reminder attempts without a default network path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-reminder-recheck-"));
  const db = await openDatabase(dir);
  const now = new Date("2026-11-10T12:00:00.000Z");
  try {
    await seedLocalCatalogue(db.sql);
    const fixtures = [
      ["available", 200],
      ["not-found", 404],
      ["gone", 410],
      ["observed", null],
    ] as const;
    const sourceIds: Record<string, string> = {};
    for (const [name] of fixtures) {
      const source = await createSource(db.sql, "local-fixture-reviewer", {
        name: `Reminder ${name}`,
        url: `https://${name}.example.edu/opportunity`,
      });
      sourceIds[name] = source.id;
      const user = `recheck-${name}`;
      await db.sql.query(
        "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
        [user, `${user}@example.test`],
      );
      await db.sql.query(
        "INSERT INTO notification_preferences(user_id,enabled,deadline_reminders_enabled,channel,consent_version) VALUES($1,true,true,'telegram','local-sink-v1')",
        [user],
      );
      await db.sql.query(
        `INSERT INTO opportunities(id,source_id,revision,state,details,evidence,verified_at)
         VALUES($1,$2,1,'published',$3,'{}',$4)`,
        [
          `recheck-${name}`,
          source.id,
          JSON.stringify({
            ...fixtureDetails,
            title: `Private ${name} title`,
            deadline: "2026-11-17",
            deadlineText: "Apply by 2026-11-17",
          }),
          now.toISOString(),
        ],
      );
      await db.sql.query(
        "INSERT INTO saved_items(user_id,opportunity_id,status,saved) VALUES($1,$2,'interested',true)",
        [user, `recheck-${name}`],
      );
    }
    await db.sql.query(
      `INSERT INTO source_snapshots(id,source_id,content_hash,content,last_seen_at)
       VALUES('recheck-observed-snapshot',$1,'recheck-observed-hash','private captured source', $2)`,
      [sourceIds.observed, new Date(now.getTime() - 60_000).toISOString()],
    );

    const calls: string[] = [];
    const transport = async (url: string) => {
      calls.push(url);
      const fixture = fixtures.find(([name]) => url.includes(name));
      return { status: fixture?.[1] ?? 503 };
    };
    const concurrent = await Promise.all([
      dispatchDeadlineReminders(db.sql, now, transport),
      dispatchDeadlineReminders(db.sql, now, transport),
    ]);
    assert.equal(
      concurrent.reduce((total, result) => total + result.sent, 0),
      2,
    );
    assert.equal(
      concurrent.reduce((total, result) => total + result.duplicates, 0),
      2,
    );
    assert.equal(
      concurrent.reduce((total, result) => total + result.suppressed, 0),
      4,
    );
    assert.equal(
      calls.length,
      3,
      "each stale official source is requested once",
    );
    assert.ok(calls.every((url) => !url.includes("observed")));

    const repeated = await dispatchDeadlineReminders(db.sql, now, transport);
    assert.deepEqual(repeated, {
      scanned: 4,
      sent: 0,
      duplicates: 2,
      suppressed: 2,
    });
    assert.equal(calls.length, 3, "stored outcomes prevent repeated requests");
    const staleCached = await verifyReminderCandidateFreshness(db.sql, {
      userId: "recheck-available",
      opportunityId: "recheck-available",
      revision: 1,
      eventKey: deadlineReminderEventKey({
        userId: "recheck-available",
        opportunityId: "recheck-available",
        revision: 1,
        deadline: "2026-11-17",
        threshold: 7,
      }),
      checkedAt: new Date(now.getTime() + 25 * 60 * 60 * 1000),
      transport: async () => {
        throw new Error("an expired decision must suppress without retrying");
      },
    });
    assert.equal(staleCached.cached, true);
    assert.equal(staleCached.fresh, false);
    assert.equal(staleCached.reason, "recheck_unavailable");
    assert.equal(calls.length, 3);
    assert.equal(
      (
        await db.sql.query(
          "SELECT COUNT(*) AS count FROM outbox WHERE payload->>'type'='deadline_reminder_recheck'",
        )
      ).rows[0].count,
      4,
    );
    assert.equal(
      (
        await db.sql.query(
          "SELECT COUNT(*) AS count FROM sink_messages WHERE payload->>'type'='deadline_reminder'",
        )
      ).rows[0].count,
      2,
    );
    assert.doesNotMatch(
      JSON.stringify(
        (
          await db.sql.query(
            "SELECT payload FROM outbox WHERE payload->>'type'='deadline_reminder_recheck'",
          )
        ).rows,
      ),
      /example\.edu|private captured source|@example\.test/,
    );

    const unavailableUser = "recheck-unavailable";
    await db.sql.query(
      "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
      [unavailableUser, `${unavailableUser}@example.test`],
    );
    const unavailableSource = await createSource(
      db.sql,
      "local-fixture-reviewer",
      {
        name: "Reminder unavailable",
        url: "https://unavailable.example.edu/opportunity",
      },
    );
    await db.sql.query(
      `INSERT INTO opportunities(id,source_id,revision,state,details,evidence,verified_at)
       VALUES('recheck-unavailable',$1,1,'published',$2,'{}',$3)`,
      [unavailableSource.id, JSON.stringify(fixtureDetails), now.toISOString()],
    );
    const unavailableKey = deadlineReminderEventKey({
      userId: unavailableUser,
      opportunityId: "recheck-unavailable",
      revision: 1,
      deadline: "2026-11-17",
      threshold: 7,
    });
    const unavailable = await verifyReminderCandidateFreshness(db.sql, {
      userId: unavailableUser,
      opportunityId: "recheck-unavailable",
      revision: 1,
      eventKey: unavailableKey,
      checkedAt: now,
    });
    assert.equal(unavailable.fresh, false);
    assert.equal(unavailable.reason, "recheck_unavailable");
    assert.equal(
      (
        await verifyReminderCandidateFreshness(db.sql, {
          userId: unavailableUser,
          opportunityId: "recheck-unavailable",
          revision: 1,
          eventKey: unavailableKey,
          checkedAt: now,
          transport: async () => {
            throw new Error("cached decisions must not retry");
          },
        })
      ).cached,
      true,
    );

    await db.sql.query(
      "UPDATE opportunities SET state='closed' WHERE id='recheck-unavailable'",
    );
    const closed = await verifyReminderCandidateFreshness(db.sql, {
      userId: unavailableUser,
      opportunityId: "recheck-unavailable",
      revision: 1,
      eventKey: unavailableKey + ":closed",
      checkedAt: now,
      transport: async () => {
        throw new Error("closed records must not use transport");
      },
    });
    assert.equal(closed.reason, "withdrawn");
    assert.equal(closed.fresh, false);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
