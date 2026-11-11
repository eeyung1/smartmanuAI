import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateNextScheduleTime,
  isScheduleDue,
  reminderFreshnessTime,
} from "../src/jobs/deadline-schedule";

const now = new Date("2026-11-10T00:00:00.000Z");
const options = { now, dailyHourUtc: 3, weeklyWeekdayUtc: 1 };

test("deadline proximity selects the hourly, daily and weekly cadences", () => {
  const urgent = calculateNextScheduleTime({ deadline: "2026-11-11" }, options);
  assert.equal(urgent.cadence, "hourly");
  assert.equal(urgent.nextScheduleTime, "2026-11-10T01:00:00.000Z");

  const approaching = calculateNextScheduleTime(
    { deadline: "2026-11-20" },
    options,
  );
  assert.equal(approaching.cadence, "daily");
  assert.equal(approaching.nextScheduleTime, "2026-11-10T03:00:00.000Z");

  const standard = calculateNextScheduleTime(
    { deadline: "2026-12-20" },
    options,
  );
  assert.equal(standard.cadence, "weekly");
  assert.equal(standard.nextScheduleTime, "2026-11-16T03:00:00.000Z");
  assert.equal(standard.reason, "standard_horizon");
});

test("rolling, unstated and malformed deadlines fall back to a bi-weekly cadence", () => {
  for (const opportunity of [
    { isRolling: true },
    { deadline: null },
    { deadline: "not a date" },
    { deadline: "2026-13-40" },
  ]) {
    const schedule = calculateNextScheduleTime(opportunity, options);
    assert.equal(schedule.cadence, "biweekly");
    assert.ok(schedule.nextScheduleTime);
    assert.ok(
      Date.parse(schedule.nextScheduleTime!) > now.getTime(),
      "a bi-weekly slot must be in the future",
    );
  }
});

test("a passed deadline is terminal and schedules nothing further", () => {
  const expired = calculateNextScheduleTime(
    { deadline: "2026-11-01" },
    options,
  );
  assert.equal(expired.cadence, "terminal");
  assert.equal(expired.nextScheduleTime, null);
  assert.equal(expired.isExpired, true);
  assert.equal(expired.reason, "deadline_passed");
});

test("the reminder freshness window pulls a recheck forward", () => {
  // The 2-day reminder window opens on 2026-11-13, so the recheck must
  // complete six hours before it.
  const open = calculateNextScheduleTime(
    { deadline: "2026-11-15" },
    { ...options, reminderFreshnessHours: 6 },
  );
  assert.equal(open.cadence, "daily");
  assert.equal(open.nextScheduleTime, "2026-11-10T03:00:00.000Z");
  assert.equal(open.reminderFreshnessAt, "2026-11-12T18:00:00.000Z");
  assert.ok(
    Date.parse(open.nextScheduleTime!) <= Date.parse(open.reminderFreshnessAt!),
  );

  // A deadline further out keeps its window in the future.
  const upcoming = calculateNextScheduleTime(
    { deadline: "2026-11-30" },
    { ...options, reminderFreshnessHours: 6 },
  );
  assert.equal(upcoming.cadence, "weekly");
  assert.equal(upcoming.nextScheduleTime, "2026-11-16T03:00:00.000Z");
  assert.equal(upcoming.reminderFreshnessAt, "2026-11-22T18:00:00.000Z");

  // A dispatch less than six hours away requires a recheck immediately.
  const soon = new Date("2026-11-09T20:00:00.000Z");
  const immediate = calculateNextScheduleTime(
    { deadline: "2026-11-12" },
    { ...options, reminderFreshnessHours: 6, now: soon },
  );
  assert.equal(immediate.nextScheduleTime, soon.toISOString());
  assert.equal(isScheduleDue(immediate.nextScheduleTime, soon).due, true);

  const direct = reminderFreshnessTime("2026-11-30", {
    ...options,
    reminderFreshnessHours: 6,
  });
  assert.equal(direct?.toISOString(), "2026-11-22T18:00:00.000Z");
  assert.equal(
    reminderFreshnessTime("2026-11-15", {
      ...options,
      reminderFreshnessHours: 6,
    })?.toISOString(),
    "2026-11-12T18:00:00.000Z",
  );
  assert.equal(reminderFreshnessTime(null, options), null);
  assert.equal(reminderFreshnessTime("invalid", options), null);
});

test("schedule due status reports delay and overdue seconds", () => {
  assert.deepEqual(isScheduleDue("2026-11-10T01:00:00.000Z", now), {
    due: false,
    delaySeconds: 3600,
    overdueSeconds: 0,
    reason: "scheduled",
  });
  assert.deepEqual(isScheduleDue("2026-11-09T23:00:00.000Z", now), {
    due: true,
    delaySeconds: 0,
    overdueSeconds: 3600,
    reason: "due",
  });
  assert.deepEqual(isScheduleDue(now, now), {
    due: true,
    delaySeconds: 0,
    overdueSeconds: 0,
    reason: "due",
  });
  assert.equal(isScheduleDue(null, now).reason, "terminal_schedule");
  assert.equal(
    isScheduleDue("not a time", now).reason,
    "invalid_schedule_time",
  );
  assert.equal(
    isScheduleDue("2026-11-10T01:00:00.000Z", "not a time").reason,
    "invalid_reference_time",
  );
});

test("scheduling is deterministic and safe for malformed input", () => {
  const first = calculateNextScheduleTime({ deadline: "2026-11-20" }, options);
  const second = calculateNextScheduleTime({ deadline: "2026-11-20" }, options);
  assert.deepEqual(first, second);
  assert.deepEqual(
    calculateNextScheduleTime(null, options),
    calculateNextScheduleTime(undefined, options),
  );
  assert.equal(
    calculateNextScheduleTime(
      { deadline: "2026-11-20" },
      { now: new Date("invalid") },
    ).cadence,
    "terminal",
  );
});
