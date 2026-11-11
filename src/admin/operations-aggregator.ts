import { calculateMonthlySpending, type SpendStatus } from "./spending-meter";

export type OperationsStatus = "HEALTHY" | "DEGRADED" | "CRITICAL";

export type OperationsMetricsInputs = {
  research?: {
    totalJobs?: number;
    failedJobs?: number;
    activeJobs?: number;
    oldestActiveJobAgeSeconds?: number | null;
  };
  delivery?: {
    pendingIntents?: number;
    deadLetterCount?: number;
    openCircuits?: number;
    failureRate?: number;
  };
  spending?: {
    spentMicrodollars?: number | string;
    budgetMicrodollars?: number | string;
    status?: SpendStatus;
  };
  system?: {
    databaseReachable?: boolean;
    databaseLatencyMs?: number | null;
    errorRate?: number;
  };
};

export type OperationsMetricOptions = {
  now?: Date;
  failureRateDegraded?: number;
  failureRateCritical?: number;
  staleJobSeconds?: number;
  slowDatabaseMs?: number;
  errorRateDegraded?: number;
};

export type OperationsDiagnostic = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: { en: string; zh: string };
};

export type OperationsMetrics = {
  status: OperationsStatus;
  research: {
    totalJobs: number;
    failedJobs: number;
    activeJobs: number;
    failureRate: number;
    oldestActiveJobAgeSeconds: number | null;
  };
  delivery: {
    pendingIntents: number;
    deadLetterCount: number;
    openCircuits: number;
    failureRate: number;
  };
  spending: {
    spentMicrodollars: string;
    budgetMicrodollars: string;
    usagePercent: string;
    status: SpendStatus;
  };
  system: {
    databaseReachable: boolean;
    databaseLatencyMs: number | null;
    errorRate: number;
  };
  diagnostics: OperationsDiagnostic[];
  summary: { en: string; zh: string };
};

const defaults = {
  failureRateDegraded: 0.2,
  failureRateCritical: 0.5,
  staleJobSeconds: 3_600,
  slowDatabaseMs: 1_000,
  errorRateDegraded: 0.05,
};

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function rate(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return 0;
  return Math.min(1, value);
}

function microdollars(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return BigInt(Math.round(value));
  if (typeof value === "string" && /^\d+$/.test(value.trim()))
    return BigInt(value.trim());
  return 0n;
}

/** Aggregates operational signals into one deterministic health verdict. */
export function aggregateOperationsMetrics(
  inputs: OperationsMetricsInputs | null | undefined,
  options: OperationsMetricOptions = {},
): OperationsMetrics {
  const limits = { ...defaults, ...options };
  const now = options.now ?? new Date();
  const research = inputs?.research ?? {};
  const delivery = inputs?.delivery ?? {};
  const spending = inputs?.spending ?? {};
  const system = inputs?.system ?? {};

  const totalJobs = count(research.totalJobs);
  const failedJobs = count(research.failedJobs);
  const activeJobs = count(research.activeJobs);
  const oldestActiveJobAgeSeconds =
    typeof research.oldestActiveJobAgeSeconds === "number" &&
    Number.isFinite(research.oldestActiveJobAgeSeconds)
      ? research.oldestActiveJobAgeSeconds
      : null;
  const researchFailureRate =
    failedJobs > 0 && totalJobs > 0
      ? Math.round((failedJobs / totalJobs) * 10_000) / 10_000
      : 0;

  const pendingIntents = count(delivery.pendingIntents);
  const deadLetterCount = count(delivery.deadLetterCount);
  const openCircuits = count(delivery.openCircuits);
  const deliveryFailureRate = rate(delivery.failureRate);

  const spent = microdollars(spending.spentMicrodollars);
  const budget = microdollars(spending.budgetMicrodollars);
  // Without a configured budget there is nothing to exhaust, so the meter is
  // not consulted and the percentage stays neutral.
  const hasBudget = budget > 0n;
  const meter = hasBudget
    ? calculateMonthlySpending(
        [
          {
            occurredAt: now.toISOString(),
            category: "other",
            microdollars: Number(spent),
          },
        ],
        { budgetMicrodollars: Number(budget), now },
      )
    : null;
  const spendStatus = spending.status ?? meter?.status ?? "NORMAL";
  const usagePercent = meter?.usagePercent ?? "0.00";

  const databaseReachable = system.databaseReachable !== false;
  const databaseLatencyMs =
    typeof system.databaseLatencyMs === "number" &&
    Number.isFinite(system.databaseLatencyMs)
      ? system.databaseLatencyMs
      : null;
  const systemErrorRate = rate(system.errorRate);

  const diagnostics: OperationsDiagnostic[] = [];
  const add = (
    code: string,
    severity: OperationsDiagnostic["severity"],
    en: string,
    zh: string,
  ) => diagnostics.push({ code, severity, message: { en, zh } });

  if (!databaseReachable)
    add(
      "database_unreachable",
      "critical",
      "The database is not reachable.",
      "数据库当前不可访问。",
    );
  if (databaseLatencyMs !== null && databaseLatencyMs >= limits.slowDatabaseMs)
    add(
      "database_slow",
      "warning",
      `Database latency is ${databaseLatencyMs} ms.`,
      `数据库延迟为 ${databaseLatencyMs} 毫秒。`,
    );
  if (systemErrorRate >= limits.errorRateDegraded)
    add(
      "system_error_rate",
      systemErrorRate >= limits.failureRateCritical ? "critical" : "warning",
      `System error rate is ${Math.round(systemErrorRate * 100)}%.`,
      `系统错误率为 ${Math.round(systemErrorRate * 100)}%。`,
    );
  if (researchFailureRate >= limits.failureRateDegraded)
    add(
      "research_failure_rate",
      researchFailureRate >= limits.failureRateCritical
        ? "critical"
        : "warning",
      `Research collection failure rate is ${Math.round(researchFailureRate * 100)}%.`,
      `研究采集失败率为 ${Math.round(researchFailureRate * 100)}%。`,
    );
  if (
    oldestActiveJobAgeSeconds !== null &&
    oldestActiveJobAgeSeconds >= limits.staleJobSeconds
  )
    add(
      "stale_active_job",
      "warning",
      `The oldest active collection job is ${oldestActiveJobAgeSeconds} seconds old.`,
      `最早的活跃采集任务已持续 ${oldestActiveJobAgeSeconds} 秒。`,
    );
  if (deadLetterCount > 0)
    add(
      "dead_letter_backlog",
      "warning",
      `${deadLetterCount} delivery intents are in the dead-letter queue.`,
      `有 ${deadLetterCount} 条投递任务位于死信队列。`,
    );
  if (openCircuits > 0)
    add(
      "circuit_open",
      "critical",
      `${openCircuits} delivery channel circuit breaker(s) are open.`,
      `有 ${openCircuits} 个投递通道的熔断器处于开启状态。`,
    );
  if (deliveryFailureRate >= limits.failureRateDegraded)
    add(
      "delivery_failure_rate",
      "warning",
      `Delivery failure rate is ${Math.round(deliveryFailureRate * 100)}%.`,
      `投递失败率为 ${Math.round(deliveryFailureRate * 100)}%。`,
    );
  // Percentages are compared numerically; string comparison would rank
  // "93.33" above "100.00".
  const usageValue = Number(usagePercent);
  if (hasBudget && (spendStatus === "HARD_STOP" || usageValue >= 100))
    add(
      "budget_exhausted",
      "critical",
      `Monthly spending has reached ${usagePercent}% of the budget.`,
      `本月支出已达到预算的 ${usagePercent}%。`,
    );
  else if (hasBudget && (spendStatus === "THROTTLE" || usageValue >= 90))
    add(
      "budget_throttled",
      "warning",
      `Monthly spending has reached ${usagePercent}% of the budget.`,
      `本月支出已达到预算的 ${usagePercent}%。`,
    );

  const critical = diagnostics.some((item) => item.severity === "critical");
  const degraded = diagnostics.some((item) => item.severity === "warning");
  const status: OperationsStatus = critical
    ? "CRITICAL"
    : degraded
      ? "DEGRADED"
      : "HEALTHY";
  const count_ = diagnostics.length;
  const summary =
    status === "HEALTHY"
      ? {
          en: "All monitored operations are within their thresholds.",
          zh: "各项运营指标均在阈值范围内。",
        }
      : status === "DEGRADED"
        ? {
            en: `Operations are degraded: ${count_} issue(s) need attention.`,
            zh: `运营状态降级：有 ${count_} 项问题需要关注。`,
          }
        : {
            en: `Operations are critical: ${count_} issue(s) require immediate action.`,
            zh: `运营状态严重异常：有 ${count_} 项问题需要立即处理。`,
          };

  return {
    status,
    research: {
      totalJobs,
      failedJobs,
      activeJobs,
      failureRate: researchFailureRate,
      oldestActiveJobAgeSeconds,
    },
    delivery: {
      pendingIntents,
      deadLetterCount,
      openCircuits,
      failureRate: deliveryFailureRate,
    },
    spending: {
      spentMicrodollars: spent.toString(),
      budgetMicrodollars: budget.toString(),
      usagePercent,
      status: spendStatus,
    },
    system: {
      databaseReachable,
      databaseLatencyMs,
      errorRate: systemErrorRate,
    },
    diagnostics,
    summary,
  };
}
