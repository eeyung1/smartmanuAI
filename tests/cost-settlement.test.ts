import test from "node:test";
import assert from "node:assert/strict";
import {
  createCostSettlementCoordinator,
  nextPeriod,
  reservationReference,
} from "../src/admin/cost-settlement";

function coordinatorAt(start = 1_000_000) {
  let now = start;
  const coordinator = createCostSettlementCoordinator({
    now: () => now,
    promptMicrodollarsPerMillionTokens: 3_000_000,
    completionMicrodollarsPerMillionTokens: 15_000_000,
    budgetMicrodollars: 30_000_000,
  });
  return { coordinator, advance: (ms: number) => (now += ms) };
}

test("settlement refunds an over-reserved estimate", () => {
  const { coordinator } = coordinatorAt();
  const reserved = coordinator.reserve({
    id: "res-1",
    estimatedMicrodollars: 1_000_000,
    model: "fixture-model",
    period: "2026-11",
  });
  assert.equal(reserved.ok, true);
  const settled = coordinator.settleActualCost("res-1", {
    promptTokens: 100_000,
    completionTokens: 10_000,
  });
  assert.equal(settled.ok, true);
  assert.equal(settled.reason, "refunded");
  assert.equal(settled.actualMicrodollars, "450000");
  assert.equal(settled.refundMicrodollars, "550000");
  assert.equal(settled.chargeMicrodollars, "0");
  assert.equal(settled.anomaly, false);
  assert.equal(
    coordinator.periodSpendMicrodollars("2026-11"),
    "450000",
    "the period meter reflects the actual cost",
  );
  assert.equal(coordinator.reservations()[0].state, "settled");
});

test("settlement charges incremental cost when usage exceeds the estimate", () => {
  const { coordinator } = coordinatorAt();
  coordinator.reserve({
    id: "res-2",
    estimatedMicrodollars: 500_000,
    period: "2026-11",
  });
  const settled = coordinator.settleActualCost(
    "res-2",
    { promptTokens: 500_000, completionTokens: 100_000 },
    { maxChargeRatio: 10 },
  );
  assert.equal(settled.ok, true);
  assert.equal(settled.reason, "charged");
  assert.equal(settled.actualMicrodollars, "3000000");
  assert.equal(settled.settledMicrodollars, "3000000");
  assert.equal(settled.chargeMicrodollars, "2500000");
  assert.equal(settled.refundMicrodollars, "0");
  assert.equal(settled.anomaly, true);
  assert.equal(settled.anomalyReason, "actual_exceeds_reservation");
});

test("safety caps limit a charge and report the anomaly", () => {
  const { coordinator } = coordinatorAt();
  coordinator.reserve({
    id: "res-3",
    estimatedMicrodollars: 100_000,
    period: "2026-11",
  });
  const settled = coordinator.settleActualCost(
    "res-3",
    { microdollars: 10_000_000 },
    { maxChargeRatio: 2 },
  );
  assert.equal(settled.ok, true);
  assert.equal(settled.actualMicrodollars, "10000000");
  assert.equal(settled.settledMicrodollars, "200000");
  assert.equal(settled.chargeMicrodollars, "100000");
  assert.equal(settled.anomaly, true);
  assert.equal(settled.anomalyReason, "charge_cap_applied");
  assert.equal(
    coordinator.periodSpendMicrodollars("2026-11"),
    "200000",
    "the capped charge is the recorded cost",
  );
});

test("the hard ceiling refuses a settlement that would exceed the budget", () => {
  const { coordinator } = coordinatorAt();
  coordinator.reserve({
    id: "res-other",
    estimatedMicrodollars: 5_000_000,
    period: "2026-11",
  });
  coordinator.reserve({
    id: "res-4",
    estimatedMicrodollars: 29_000_000,
    period: "2026-11",
  });
  const settled = coordinator.settleActualCost("res-4", {
    microdollars: 29_500_000,
  });
  assert.equal(settled.ok, false);
  assert.equal(settled.reason, "budget_ceiling_exceeded");
  assert.equal(settled.anomaly, true);
  assert.equal(settled.anomalyReason, "budget_ceiling_exceeded");
  assert.equal(coordinator.reservations()[1].state, "reserved");
  assert.equal(
    coordinator.periodSpendMicrodollars("2026-11"),
    "34000000",
    "a refused settlement does not change the meter",
  );
});

test("invalid usage and unknown reservations are refused safely", () => {
  const { coordinator } = coordinatorAt();
  coordinator.reserve({ id: "res-5", estimatedMicrodollars: 1000 });
  assert.equal(
    coordinator.settleActualCost("missing", {}).reason,
    "unknown_reservation",
  );
  assert.equal(
    coordinator.settleActualCost("res-5", { promptTokens: -1 }).reason,
    "invalid_usage_tokens",
  );
  assert.equal(
    coordinator.settleActualCost("res-5", { microdollars: -5 }).reason,
    "invalid_usage_cost",
  );
  const unpriced = createCostSettlementCoordinator({ now: () => 1_000_000 });
  unpriced.reserve({ id: "res-unpriced", estimatedMicrodollars: 1000 });
  assert.equal(
    unpriced.settleActualCost("res-unpriced", {
      promptTokens: 10,
      completionTokens: 1,
    }).reason,
    "missing_token_rate",
  );
  const settled = coordinator.settleActualCost("res-5", { microdollars: 500 });
  assert.equal(settled.ok, true);
  assert.equal(
    coordinator.settleActualCost("res-5", { microdollars: 500 }).reason,
    "already_settled",
  );
});

test("rollover archives the period and resets the meter", () => {
  const { coordinator } = coordinatorAt();
  coordinator.reserve({
    id: "res-6",
    estimatedMicrodollars: 2_000_000,
    period: "2026-11",
  });
  coordinator.settleActualCost("res-6", { microdollars: 1_500_000 });
  assert.equal(coordinator.periodSpendMicrodollars("2026-11"), "1500000");
  const rolled = coordinator.rolloverBudgetPeriod("2026-11");
  assert.equal(rolled.ok, true);
  assert.equal(rolled.currentPeriod, "2026-11");
  assert.equal(rolled.nextPeriod, "2026-12");
  assert.equal(rolled.archived?.totalMicrodollars, "1500000");
  assert.equal(rolled.archived?.reservations, 1);
  assert.equal(rolled.resetMicrodollars, "0");
  assert.equal(coordinator.periodSpendMicrodollars("2026-11"), "0");
  assert.equal(coordinator.periodSpendMicrodollars("2026-12"), "0");
  assert.equal(coordinator.archives().length, 1);
  assert.equal(
    coordinator.rolloverBudgetPeriod("not-a-period").reason,
    "invalid_period",
  );
});

test("period arithmetic crosses the year boundary", () => {
  assert.equal(nextPeriod("2026-11"), "2026-12");
  assert.equal(nextPeriod("2026-12"), "2027-01");
  assert.equal(nextPeriod("2027-01"), "2027-02");
  assert.match(reservationReference("res-1"), /^[a-f0-9]{16}$/);
  assert.equal(
    reservationReference("res-1"),
    reservationReference(" res-1 "),
    "references are stable",
  );
});
