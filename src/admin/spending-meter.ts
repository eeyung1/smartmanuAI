export const MICRODOLLARS_PER_DOLLAR = 1_000_000;
export const DEFAULT_MONTHLY_BUDGET_MICRODOLLARS = 30 * MICRODOLLARS_PER_DOLLAR;
export const WARNING_THRESHOLD_PERCENT = 70;
export const THROTTLE_THRESHOLD_PERCENT = 90;
export const HARD_STOP_THRESHOLD_PERCENT = 100;

export type SpendCategory =
  "ai_tokens" | "collection" | "outbound" | "storage" | "other";

export type SpendUsageRecord = {
  occurredAt: string | Date;
  category?: SpendCategory;
  microdollars?: number | string;
  tokens?: number;
  microdollarsPerMillionTokens?: number;
  provider?: string;
  reference?: string;
};

export type SpendStatus = "NORMAL" | "WARNING" | "THROTTLE" | "HARD_STOP";

export type SpendingOptions = {
  month?: string;
  budgetMicrodollars?: number | string;
  locale?: "en" | "zh-Hans";
  now?: Date;
};

export type SpendingReport = {
  month: string;
  status: SpendStatus;
  totalMicrodollars: string;
  budgetMicrodollars: string;
  usagePercent: string;
  byCategory: Record<string, string>;
  tokens: { input: string; output: string; total: string };
  records: { counted: number; skipped: number };
  throttle: {
    level: "none" | "defer" | "block";
    paidExtraction: "allowed" | "deferred" | "blocked";
    optionalCollection: "allowed" | "deferred" | "blocked";
    essentialCollection: "allowed" | "deferred" | "blocked";
    allowPaidExtraction: boolean;
    allowOptionalCollection: boolean;
    allowEssentialCollection: boolean;
  };
  alert: { en: string; zh: string };
};

const categories: SpendCategory[] = [
  "ai_tokens",
  "collection",
  "outbound",
  "storage",
  "other",
];

function utcMonth(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    return null;
  return value;
}

function microdollars(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return BigInt(Math.round(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim()))
    return BigInt(value.trim());
  return null;
}

function positiveInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    return null;
  return BigInt(value);
}

function timestamp(value: unknown) {
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

/** Exact integer percentage with two decimals; never uses floating point money. */
function percent(total: bigint, budget: bigint) {
  if (budget <= 0n) return "0.00";
  const hundredths = (total * 10_000n) / budget;
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, "0")}`;
}

function statusFor(total: bigint, budget: bigint): SpendStatus {
  if (budget <= 0n) return "HARD_STOP";
  if (total * 100n >= budget * BigInt(HARD_STOP_THRESHOLD_PERCENT))
    return "HARD_STOP";
  if (total * 100n >= budget * BigInt(THROTTLE_THRESHOLD_PERCENT))
    return "THROTTLE";
  if (total * 100n >= budget * BigInt(WARNING_THRESHOLD_PERCENT))
    return "WARNING";
  return "NORMAL";
}

function alertMessage(
  status: SpendStatus,
  used: string,
  limit: string,
  percentUsed: string,
) {
  const en: Record<SpendStatus, string> = {
    NORMAL: `Operational spending is ${percentUsed}% of the monthly budget.`,
    WARNING: `Budget warning: operational spending has reached ${percentUsed}% of the monthly budget (${used} of ${limit} microdollars).`,
    THROTTLE: `Budget throttle: operational spending has reached ${percentUsed}% of the monthly budget (${used} of ${limit} microdollars). Optional paid extraction and optional collection work is deferred.`,
    HARD_STOP: `Budget hard stop: operational spending has reached ${percentUsed}% of the monthly budget (${used} of ${limit} microdollars). Paid extraction and optional collection work are blocked.`,
  };
  const zh: Record<SpendStatus, string> = {
    NORMAL: `运营支出为月度预算的 ${percentUsed}%。`,
    WARNING: `预算预警：运营支出已达到月度预算的 ${percentUsed}%（已用 ${used}，上限 ${limit} 微美元）。`,
    THROTTLE: `预算限流：运营支出已达到月度预算的 ${percentUsed}%（已用 ${used}，上限 ${limit} 微美元）。可选的付费提取与可选采集任务将推迟执行。`,
    HARD_STOP: `预算硬性停止：运营支出已达到月度预算的 ${percentUsed}%（已用 ${used}，上限 ${limit} 微美元）。付费提取与可选采集任务已被阻止。`,
  };
  return { en: en[status], zh: zh[status] };
}

/**
 * Aggregates operational usage into exact monthly microdollars and derives
 * threshold alerts and throttle directives. It never mutates its inputs.
 */
export function calculateMonthlySpending(
  usageRecords: unknown,
  options: SpendingOptions = {},
): SpendingReport {
  const now = options.now ?? new Date();
  const month = parseMonth(options.month) ?? utcMonth(now);
  const budget =
    microdollars(options.budgetMicrodollars) ??
    BigInt(DEFAULT_MONTHLY_BUDGET_MICRODOLLARS);
  const records = Array.isArray(usageRecords) ? usageRecords : [];
  const byCategory: Record<string, bigint> = {};
  const tokens = { input: 0n, output: 0n, total: 0n };
  let total = 0n;
  let counted = 0;
  let skipped = 0;

  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      skipped++;
      continue;
    }
    const value = record as SpendUsageRecord;
    const occurred = timestamp(value.occurredAt);
    if (!occurred) {
      skipped++;
      continue;
    }
    if (utcMonth(occurred) !== month) continue;
    const category: SpendCategory = categories.includes(
      value.category as SpendCategory,
    )
      ? (value.category as SpendCategory)
      : "other";
    let cost: bigint | null = null;
    if (value.microdollars !== undefined && value.microdollars !== null) {
      cost = microdollars(value.microdollars);
    } else if (
      value.tokens !== undefined &&
      value.microdollarsPerMillionTokens !== undefined
    ) {
      const amount = positiveInteger(value.tokens);
      const rate = microdollars(value.microdollarsPerMillionTokens);
      if (amount !== null && rate !== null)
        cost = (amount * rate + 999_999n) / 1_000_000n;
    }
    if (cost === null) {
      skipped++;
      continue;
    }
    total += cost;
    byCategory[category] = (byCategory[category] ?? 0n) + cost;
    counted++;
    const inputTokens = positiveInteger(
      (value as { inputTokens?: number }).inputTokens,
    );
    const outputTokens = positiveInteger(
      (value as { outputTokens?: number }).outputTokens,
    );
    if (inputTokens !== null) tokens.input += inputTokens;
    if (outputTokens !== null) tokens.output += outputTokens;
  }

  const status = statusFor(total, budget);
  const percentUsed = percent(total, budget);
  const throttle =
    status === "HARD_STOP"
      ? {
          level: "block" as const,
          paidExtraction: "blocked" as const,
          optionalCollection: "blocked" as const,
          essentialCollection: "allowed" as const,
          allowPaidExtraction: false,
          allowOptionalCollection: false,
          allowEssentialCollection: true,
        }
      : status === "THROTTLE"
        ? {
            level: "defer" as const,
            paidExtraction: "deferred" as const,
            optionalCollection: "deferred" as const,
            essentialCollection: "allowed" as const,
            allowPaidExtraction: false,
            allowOptionalCollection: false,
            allowEssentialCollection: true,
          }
        : {
            level: "none" as const,
            paidExtraction: "allowed" as const,
            optionalCollection: "allowed" as const,
            essentialCollection: "allowed" as const,
            allowPaidExtraction: true,
            allowOptionalCollection: true,
            allowEssentialCollection: true,
          };

  return {
    month,
    status,
    totalMicrodollars: total.toString(),
    budgetMicrodollars: budget.toString(),
    usagePercent: percentUsed,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([key, value]) => [key, value.toString()]),
    ),
    tokens: {
      input: tokens.input.toString(),
      output: tokens.output.toString(),
      total: (tokens.input + tokens.output).toString(),
    },
    records: { counted, skipped },
    throttle,
    alert: alertMessage(
      status,
      total.toString(),
      budget.toString(),
      percentUsed,
    ),
  };
}
