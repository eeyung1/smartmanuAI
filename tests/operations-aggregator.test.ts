import test from "node:test";
import assert from "node:assert/strict";
import { aggregateOperationsMetrics } from "../src/admin/operations-aggregator";

const now = new Date("2026-11-10T12:00:00.000Z");

test("healthy inputs aggregate without diagnostics", () => {
  const metrics = aggregateOperationsMetrics(
    {
      research: { totalJobs: 100, failedJobs: 2, activeJobs: 3 },
      delivery: { pendingIntents: 4, deadLetterCount: 0, openCircuits: 0 },
      spending: {
        spentMicrodollars: 1_000_000,
        budgetMicrodollars: 30_000_000,
      },
      system: { databaseReachable: true, databaseLatencyMs: 20, errorRate: 0 },
    },
    { now },
  );
  assert.equal(metrics.status, "HEALTHY");
  assert.deepEqual(metrics.diagnostics, []);
  assert.equal(metrics.research.failureRate, 0.02);
  assert.equal(metrics.spending.usagePercent, "3.33");
  assert.equal(metrics.spending.status, "NORMAL");
  assert.match(metrics.summary.en, /within their thresholds/);
  assert.match(metrics.summary.zh, /阈值/);
});

test("dead letters and high spending degrade the verdict", () => {
  const degraded = aggregateOperationsMetrics(
    {
      research: { totalJobs: 100, failedJobs: 25, activeJobs: 2 },
      delivery: { pendingIntents: 10, deadLetterCount: 3, openCircuits: 0 },
      spending: {
        spentMicrodollars: 28_000_000,
        budgetMicrodollars: 30_000_000,
      },
      system: { databaseReachable: true, databaseLatencyMs: 20, errorRate: 0 },
    },
    { now },
  );
  assert.equal(degraded.status, "DEGRADED");
  assert.ok(
    degraded.diagnostics.some((item) => item.code === "dead_letter_backlog"),
  );
  assert.ok(
    degraded.diagnostics.some((item) => item.code === "budget_throttled"),
  );
  assert.ok(
    degraded.diagnostics.some((item) => item.code === "research_failure_rate"),
  );
  assert.match(degraded.summary.en, /degraded/i);
  assert.match(degraded.summary.zh, /降级/);
});

test("an open circuit or exhausted budget is critical", () => {
  const openCircuit = aggregateOperationsMetrics(
    {
      delivery: { openCircuits: 1 },
      system: { databaseReachable: true },
    },
    { now },
  );
  assert.equal(openCircuit.status, "CRITICAL");
  assert.ok(
    openCircuit.diagnostics.some((item) => item.code === "circuit_open"),
  );

  const exhausted = aggregateOperationsMetrics(
    {
      spending: {
        spentMicrodollars: 30_000_000,
        budgetMicrodollars: 30_000_000,
      },
      system: { databaseReachable: true },
    },
    { now },
  );
  assert.equal(exhausted.status, "CRITICAL");
  assert.ok(
    exhausted.diagnostics.some((item) => item.code === "budget_exhausted"),
  );
  assert.match(exhausted.summary.zh, /严重异常/);

  const unreachable = aggregateOperationsMetrics(
    { system: { databaseReachable: false } },
    { now },
  );
  assert.equal(unreachable.status, "CRITICAL");
  assert.ok(
    unreachable.diagnostics.some(
      (item) => item.code === "database_unreachable",
    ),
  );
});

test("stale jobs, slow database and error rates raise warnings", () => {
  const metrics = aggregateOperationsMetrics(
    {
      research: {
        totalJobs: 10,
        failedJobs: 1,
        oldestActiveJobAgeSeconds: 7_200,
      },
      delivery: { failureRate: 0.3 },
      system: {
        databaseReachable: true,
        databaseLatencyMs: 2_500,
        errorRate: 0.08,
      },
    },
    { now },
  );
  assert.equal(metrics.status, "DEGRADED");
  const codes = metrics.diagnostics.map((item) => item.code);
  assert.ok(codes.includes("stale_active_job"));
  assert.ok(codes.includes("database_slow"));
  assert.ok(codes.includes("system_error_rate"));
  assert.ok(codes.includes("delivery_failure_rate"));
});

test("missing or malformed inputs aggregate safely and deterministically", () => {
  const empty = aggregateOperationsMetrics(null, { now });
  assert.equal(empty.status, "HEALTHY");
  assert.equal(empty.research.totalJobs, 0);
  assert.equal(empty.spending.spentMicrodollars, "0");
  assert.equal(empty.system.databaseReachable, true);

  const malformed = aggregateOperationsMetrics(
    {
      research: { totalJobs: -5, failedJobs: 10 },
      spending: { spentMicrodollars: "not-a-number" },
    },
    { now },
  );
  assert.equal(malformed.research.totalJobs, 0);
  assert.equal(malformed.spending.spentMicrodollars, "0");
  assert.deepEqual(
    aggregateOperationsMetrics({ delivery: { deadLetterCount: 1 } }, { now }),
    aggregateOperationsMetrics({ delivery: { deadLetterCount: 1 } }, { now }),
  );
});
