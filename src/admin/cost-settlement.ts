import { createHash } from "node:crypto";

export type CostReservationState = "reserved" | "settled";

export type CostReservation = {
  id: string;
  period: string;
  model: string;
  estimatedMicrodollars: string;
  createdAt: number;
  state: CostReservationState;
  settledMicrodollars: string | null;
  settledAt: number | null;
};

export type ModelUsage = {
  promptTokens?: number;
  completionTokens?: number;
  /** Optional explicit actual cost, used when provider pricing is not modelled. */
  microdollars?: number | string;
  model?: string;
};

export type SettlementOptions = {
  promptMicrodollarsPerMillionTokens?: number;
  completionMicrodollarsPerMillionTokens?: number;
  /** Maximum multiple of the estimate that may be charged in one settlement. */
  maxChargeRatio?: number;
  now?: () => number;
  /** Hard monthly ceiling in microdollars. */
  budgetMicrodollars?: number | string;
};

export type SettlementResult = {
  ok: boolean;
  reason: string;
  reservationId: string;
  period: string;
  estimatedMicrodollars: string;
  actualMicrodollars: string;
  settledMicrodollars: string;
  refundMicrodollars: string;
  chargeMicrodollars: string;
  anomaly: boolean;
  anomalyReason: string | null;
  periodSpendMicrodollars: string;
};

export type PeriodArchive = {
  period: string;
  nextPeriod: string;
  totalMicrodollars: string;
  reservations: number;
  archivedAt: number;
};

export type RolloverResult = {
  ok: boolean;
  reason: string;
  currentPeriod: string;
  nextPeriod: string;
  archived: PeriodArchive | null;
  resetMicrodollars: string;
};

export const DEFAULT_MAX_CHARGE_RATIO = 5;

function microdollars(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return BigInt(Math.round(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim()))
    return BigInt(value.trim());
  return null;
}

function tokenCount(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    return null;
  return value;
}

function periodText(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    return null;
  return value;
}

export function nextPeriod(period: string) {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Deterministic key for a reservation id, used for reproducible reports. */
export function reservationReference(reservationId: string) {
  return createHash("sha256")
    .update("cost-reservation-v1:" + reservationId.trim())
    .digest("hex")
    .slice(0, 16);
}

/** In-memory settlement and budget-rollover coordinator. */
export function createCostSettlementCoordinator(
  options: SettlementOptions & {
    budgetMicrodollars?: number | string;
  } = {},
) {
  const reservations = new Map<string, CostReservation>();
  const periodSpend = new Map<string, bigint>();
  const archives: PeriodArchive[] = [];
  const now = options.now ?? (() => Date.now());
  const budget =
    microdollars(options.budgetMicrodollars) ?? microdollars(30_000_000);

  const spendFor = (period: string) => periodSpend.get(period) ?? 0n;

  const reserve = (input: {
    id: string;
    estimatedMicrodollars: number | string;
    model?: string;
    period?: string;
  }) => {
    if (!input || typeof input.id !== "string" || !input.id.trim())
      return { ok: false, reason: "invalid_reservation_id", reservation: null };
    if (reservations.has(input.id))
      return {
        ok: false,
        reason: "reservation_exists",
        reservation: { ...reservations.get(input.id)! },
      };
    const estimate = microdollars(input.estimatedMicrodollars);
    if (estimate === null)
      return { ok: false, reason: "invalid_estimate", reservation: null };
    const period =
      periodText(input.period) ?? new Date(now()).toISOString().slice(0, 7);
    const reservation: CostReservation = {
      id: input.id.trim(),
      period,
      model: input.model ?? "unknown",
      estimatedMicrodollars: estimate.toString(),
      createdAt: now(),
      state: "reserved",
      settledMicrodollars: null,
      settledAt: null,
    };
    reservations.set(reservation.id, reservation);
    periodSpend.set(period, spendFor(period) + estimate);
    return { ok: true, reason: "reserved", reservation: { ...reservation } };
  };

  const settleActualCost = (
    reservationId: string,
    usage: unknown,
    settleOptions: SettlementOptions = {},
  ): SettlementResult => {
    const reservation =
      typeof reservationId === "string"
        ? reservations.get(reservationId.trim())
        : undefined;
    const base = {
      reservationId: typeof reservationId === "string" ? reservationId : "",
      period: reservation?.period ?? "",
      estimatedMicrodollars: reservation?.estimatedMicrodollars ?? "0",
      actualMicrodollars: "0",
      settledMicrodollars: "0",
      refundMicrodollars: "0",
      chargeMicrodollars: "0",
      anomaly: false,
      anomalyReason: null as string | null,
      periodSpendMicrodollars: "0",
    };
    if (!reservation)
      return { ...base, ok: false, reason: "unknown_reservation" };
    if (reservation.state === "settled")
      return { ...base, ok: false, reason: "already_settled" };
    const value = (usage ?? {}) as ModelUsage;
    let actual: bigint | null = null;
    if (value.microdollars !== undefined && value.microdollars !== null) {
      actual = microdollars(value.microdollars);
      if (actual === null)
        return { ...base, ok: false, reason: "invalid_usage_cost" };
    } else {
      const prompt = tokenCount(value.promptTokens);
      const completion = tokenCount(value.completionTokens);
      if (prompt === null || completion === null)
        return { ...base, ok: false, reason: "invalid_usage_tokens" };
      const promptRate = microdollars(
        settleOptions.promptMicrodollarsPerMillionTokens ??
          options.promptMicrodollarsPerMillionTokens,
      );
      const completionRate = microdollars(
        settleOptions.completionMicrodollarsPerMillionTokens ??
          options.completionMicrodollarsPerMillionTokens,
      );
      if (promptRate === null || completionRate === null)
        return { ...base, ok: false, reason: "missing_token_rate" };
      actual =
        (BigInt(prompt) * promptRate + 999_999n) / 1_000_000n +
        (BigInt(completion) * completionRate + 999_999n) / 1_000_000n;
    }
    const estimate = BigInt(reservation.estimatedMicrodollars);
    const ratio =
      settleOptions.maxChargeRatio ??
      options.maxChargeRatio ??
      DEFAULT_MAX_CHARGE_RATIO;
    if (!Number.isFinite(ratio) || ratio < 1 || ratio > 100)
      return { ...base, ok: false, reason: "invalid_charge_ratio" };
    const cap = estimate * BigInt(Math.round(ratio));
    let anomaly = false;
    let anomalyReason: string | null = null;
    // The charged amount is bounded by the safety cap; the provider-reported
    // actual cost is still reported so the difference stays auditable.
    const settledCost = actual > cap ? cap : actual;
    if (actual > cap) {
      anomaly = true;
      anomalyReason = "charge_cap_applied";
    } else if (actual > estimate) {
      anomaly = true;
      anomalyReason = "actual_exceeds_reservation";
    }
    const ceiling = microdollars(
      settleOptions.budgetMicrodollars ?? options.budgetMicrodollars,
    );
    const currentSpend = spendFor(reservation.period) - estimate;
    const projected = currentSpend + settledCost;
    if (ceiling !== null && ceiling > 0n && projected > ceiling)
      return {
        ...base,
        ok: false,
        reason: "budget_ceiling_exceeded",
        actualMicrodollars: actual.toString(),
        settledMicrodollars: settledCost.toString(),
        anomaly: true,
        anomalyReason: "budget_ceiling_exceeded",
        periodSpendMicrodollars: currentSpend.toString(),
      };
    const refund = settledCost < estimate ? estimate - settledCost : 0n;
    const charge = settledCost > estimate ? settledCost - estimate : 0n;
    reservation.state = "settled";
    reservation.settledMicrodollars = settledCost.toString();
    reservation.settledAt = now();
    periodSpend.set(reservation.period, currentSpend + settledCost);
    return {
      ok: true,
      reason: refund > 0n ? "refunded" : charge > 0n ? "charged" : "settled",
      reservationId: reservation.id,
      period: reservation.period,
      estimatedMicrodollars: estimate.toString(),
      actualMicrodollars: actual.toString(),
      settledMicrodollars: settledCost.toString(),
      refundMicrodollars: refund.toString(),
      chargeMicrodollars: charge.toString(),
      anomaly,
      anomalyReason,
      periodSpendMicrodollars: (currentSpend + settledCost).toString(),
    };
  };

  const rolloverBudgetPeriod = (
    currentPeriod: string,
    rolloverOptions: { now?: number } = {},
  ): RolloverResult => {
    const period = periodText(currentPeriod);
    if (!period)
      return {
        ok: false,
        reason: "invalid_period",
        currentPeriod: "",
        nextPeriod: "",
        archived: null,
        resetMicrodollars: "0",
      };
    const following = nextPeriod(period);
    const total = spendFor(period);
    const count = [...reservations.values()].filter(
      (reservation) => reservation.period === period,
    ).length;
    const archive: PeriodArchive = {
      period,
      nextPeriod: following,
      totalMicrodollars: total.toString(),
      reservations: count,
      archivedAt: rolloverOptions.now ?? now(),
    };
    archives.push(archive);
    periodSpend.set(period, 0n);
    return {
      ok: true,
      reason: "rolled_over",
      currentPeriod: period,
      nextPeriod: following,
      archived: archive,
      resetMicrodollars: "0",
    };
  };

  return {
    reserve,
    settleActualCost,
    rolloverBudgetPeriod,
    reservations: () =>
      [...reservations.values()].map((entry) => ({ ...entry })),
    archives: () => archives.map((entry) => ({ ...entry })),
    periodSpendMicrodollars: (period: string) => spendFor(period).toString(),
    budgetMicrodollars: budget === null ? null : budget.toString(),
  };
}

export type CostSettlementCoordinator = ReturnType<
  typeof createCostSettlementCoordinator
>;

let defaultCoordinator: CostSettlementCoordinator | null = null;

export function costSettlementCoordinator(options: SettlementOptions = {}) {
  defaultCoordinator ??= createCostSettlementCoordinator(options);
  return defaultCoordinator;
}

export function settleActualCost(
  reservationId: string,
  usage: unknown,
  options: SettlementOptions = {},
) {
  return costSettlementCoordinator(options).settleActualCost(
    reservationId,
    usage,
    options,
  );
}

export function rolloverBudgetPeriod(
  currentPeriod: string,
  options: { now?: number } = {},
) {
  return costSettlementCoordinator().rolloverBudgetPeriod(
    currentPeriod,
    options,
  );
}
