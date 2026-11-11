import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MONTHLY_BUDGET_MICRODOLLARS,
  calculateMonthlySpending,
} from "../src/admin/spending-meter";

const month = "2026-11";
const inMonth = "2026-11-10T00:00:00.000Z";

test("monthly spending aggregates exact microdollars per category and token usage", () => {
  const report = calculateMonthlySpending(
    [
      {
        occurredAt: inMonth,
        category: "ai_tokens",
        tokens: 2_000_000,
        microdollarsPerMillionTokens: 3_000_000,
        inputTokens: 1_500_000,
        outputTokens: 500_000,
      },
      {
        occurredAt: inMonth,
        category: "collection",
        microdollars: 1_500_000,
      },
      {
        occurredAt: "2026-10-31T23:59:59.000Z",
        category: "collection",
        microdollars: 9_000_000,
      },
    ],
    { month, now: new Date(inMonth) },
  );
  assert.equal(report.month, month);
  assert.equal(report.totalMicrodollars, "7500000");
  assert.equal(
    report.budgetMicrodollars,
    String(DEFAULT_MONTHLY_BUDGET_MICRODOLLARS),
  );
  assert.deepEqual(report.byCategory, {
    ai_tokens: "6000000",
    collection: "1500000",
  });
  assert.equal(report.tokens.total, "2000000");
  assert.equal(report.records.counted, 2);
  assert.equal(report.records.skipped, 0);
  assert.equal(report.status, "NORMAL");
  assert.equal(report.usagePercent, "25.00");
});

test("threshold statuses and throttle directives follow exact percentages", () => {
  const budget = 1_000_000;
  const cases = [
    { amount: 699_999, status: "NORMAL", allow: true },
    { amount: 700_000, status: "WARNING", allow: true },
    { amount: 899_999, status: "WARNING", allow: true },
    { amount: 900_000, status: "THROTTLE", allow: false },
    { amount: 999_999, status: "THROTTLE", allow: false },
    { amount: 1_000_000, status: "HARD_STOP", allow: false },
    { amount: 1_500_000, status: "HARD_STOP", allow: false },
  ] as const;
  for (const testCase of cases) {
    const report = calculateMonthlySpending(
      [
        {
          occurredAt: inMonth,
          category: "ai_tokens",
          microdollars: testCase.amount,
        },
      ],
      { month, budgetMicrodollars: budget, now: new Date(inMonth) },
    );
    assert.equal(report.status, testCase.status, String(testCase.amount));
    assert.equal(
      report.throttle.allowPaidExtraction,
      testCase.allow,
      String(testCase.amount),
    );
    assert.equal(report.throttle.allowEssentialCollection, true);
    assert.equal(
      report.throttle.allowOptionalCollection,
      testCase.amount < 900_000,
      String(testCase.amount),
    );
  }
  const throttled = calculateMonthlySpending(
    [{ occurredAt: inMonth, microdollars: 900_000 }],
    { month, budgetMicrodollars: budget, now: new Date(inMonth) },
  );
  assert.equal(throttled.throttle.level, "defer");
  assert.equal(throttled.throttle.paidExtraction, "deferred");
  const stopped = calculateMonthlySpending(
    [{ occurredAt: inMonth, microdollars: 1_000_000 }],
    { month, budgetMicrodollars: budget, now: new Date(inMonth) },
  );
  assert.equal(stopped.throttle.level, "block");
  assert.equal(stopped.throttle.paidExtraction, "blocked");
  assert.equal(stopped.throttle.optionalCollection, "blocked");
});

test("default month is the current UTC month and invalid inputs are skipped safely", () => {
  const now = new Date("2026-11-20T23:30:00.000Z");
  const report = calculateMonthlySpending(
    [
      { occurredAt: "2026-11-01T00:00:00.000Z", microdollars: 100 },
      { occurredAt: "not a date", microdollars: 500 },
      { occurredAt: "2026-11-02T00:00:00.000Z", microdollars: -50 },
      { occurredAt: "2026-11-03T00:00:00.000Z", microdollars: "250" },
      { occurredAt: "2026-11-04T00:00:00.000Z" },
      null,
      "not a record",
      {
        occurredAt: "2026-11-05T00:00:00.000Z",
        microdollars: 25,
        category: "other",
      },
    ],
    { now },
  );
  assert.equal(report.month, "2026-11");
  assert.equal(report.totalMicrodollars, "375");
  assert.equal(report.records.counted, 3);
  assert.equal(report.records.skipped, 5);
  assert.deepEqual(calculateMonthlySpending(null, { now }).byCategory, {});
  assert.equal(
    calculateMonthlySpending(undefined, { now }).totalMicrodollars,
    "0",
  );
});

test("alerts are bilingual and deterministic for every status", () => {
  for (const amount of [1_000, 700_000, 900_000, 1_000_000]) {
    const report = calculateMonthlySpending(
      [{ occurredAt: inMonth, microdollars: amount }],
      { month, budgetMicrodollars: 1_000_000, now: new Date(inMonth) },
    );
    assert.match(report.alert.en, /budget/i);
    assert.ok(report.alert.zh.length > 0);
    assert.notEqual(report.alert.en, report.alert.zh);
    assert.deepEqual(
      calculateMonthlySpending(
        [{ occurredAt: inMonth, microdollars: amount }],
        { month, budgetMicrodollars: 1_000_000, now: new Date(inMonth) },
      ),
      report,
    );
  }
});
