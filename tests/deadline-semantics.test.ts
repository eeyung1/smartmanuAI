import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateDeadlineStatus,
  parseDeadline,
} from "../src/domain/deadline-semantics";

test("date-only deadlines close at end of day in UTC+8 or an explicit timezone", () => {
  assert.deepEqual(parseDeadline("2026-11-30"), {
    kind: "date",
    original: "2026-11-30",
    isRolling: false,
    closesAt: "2026-11-30T15:59:59.999Z",
    timeZone: "Asia/Shanghai",
    rounds: [],
    nextRound: null,
  });
  assert.equal(
    parseDeadline("2026/11/30", { timeZone: "UTC" }).closesAt,
    "2026-11-30T23:59:59.999Z",
  );
  assert.equal(
    parseDeadline("2026-03-08", { timeZone: "America/New_York" }).closesAt,
    "2026-03-09T03:59:59.999Z",
  );
  assert.equal(parseDeadline("2026-02-30").kind, "unknown");
  assert.equal(
    parseDeadline("2026-11-30", { timeZone: "Mars/Olympus" }).kind,
    "unknown",
  );
});

test("precise timestamps recognize UTC, CST, offsets and IANA zones", () => {
  for (const [value, expected] of [
    ["2026-11-30 17:30 CST", "2026-11-30T09:30:00.000Z"],
    ["2026-11-30T17:30:15+08:00", "2026-11-30T09:30:15.000Z"],
    ["2026-11-30 09:30 UTC", "2026-11-30T09:30:00.000Z"],
    ["2026-11-30 17:30 GMT+8", "2026-11-30T09:30:00.000Z"],
    ["2026-11-30 17:30 Asia/Shanghai", "2026-11-30T09:30:00.000Z"],
  ] as const) {
    const parsed = parseDeadline(value);
    assert.equal(parsed.kind, "timestamp");
    assert.equal(parsed.closesAt, expected);
  }
  for (const invalid of [
    "2026-11-30 24:00 CST",
    "2026-13-01 10:00 UTC",
    "2026-11-30 10:00 GMT+15",
    "30 November 2026 someday",
  ])
    assert.equal(parseDeadline(invalid).kind, "unknown");
});

test("rolling and multi-round deadlines expose stable next-round status", () => {
  for (const value of [
    "Rolling admissions",
    "Applications accepted until filled",
    "滚动录取",
    "额满为止",
  ]) {
    const parsed = parseDeadline(value);
    assert.equal(parsed.kind, "rolling");
    assert.equal(parsed.isRolling, true);
    assert.deepEqual(
      evaluateDeadlineStatus(parsed, new Date("2026-11-01T00:00:00Z")),
      {
        isClosed: false,
        daysRemaining: null,
        isUrgent: false,
        badgeKey: "deadline.status.rolling",
      },
    );
  }
  const rounds = parseDeadline(
    {
      rounds: [
        { label: "Round 2", deadline: "2026-12-31" },
        { label: "Round 1", deadline: "2026-11-15 17:00 CST" },
        { label: "Invalid", deadline: "unknown" },
      ],
    },
    { now: new Date("2026-11-20T00:00:00Z") },
  );
  assert.equal(rounds.kind, "rounds");
  assert.deepEqual(
    rounds.rounds.map((round) => round.label),
    ["Round 1", "Round 2"],
  );
  assert.equal(rounds.nextRound?.label, "Round 2");
  assert.equal(rounds.closesAt, "2026-12-31T15:59:59.999Z");
  assert.equal(
    evaluateDeadlineStatus(rounds, new Date("2026-12-27T16:00:00Z")).badgeKey,
    "deadline.status.urgent",
  );
  const textRounds = parseDeadline("Round 1: 2026-01-01; Round 2: 2026-02-01", {
    now: new Date("2026-03-01T00:00:00Z"),
  });
  assert.equal(textRounds.kind, "rounds");
  assert.equal(textRounds.nextRound, null);
  assert.equal(
    evaluateDeadlineStatus(textRounds, new Date("2026-03-01T00:00:00Z"))
      .isClosed,
    true,
  );
});

test("deadline status distinguishes open, urgent, closed and unknown safely", () => {
  const parsed = parseDeadline("2026-11-10 12:00 UTC");
  assert.deepEqual(
    evaluateDeadlineStatus(parsed, new Date("2026-11-01T12:00:00Z")),
    {
      isClosed: false,
      daysRemaining: 9,
      isUrgent: false,
      badgeKey: "deadline.status.open",
    },
  );
  assert.equal(
    evaluateDeadlineStatus(parsed, new Date("2026-11-04T12:00:00Z")).isUrgent,
    true,
  );
  assert.equal(
    evaluateDeadlineStatus(parsed, new Date("2026-11-10T12:00:00Z")).isClosed,
    true,
  );
  assert.deepEqual(evaluateDeadlineStatus(parseDeadline("not stated")), {
    isClosed: false,
    daysRemaining: null,
    isUrgent: false,
    badgeKey: "deadline.status.unknown",
  });
});
