import Link from "next/link";
import { Suspense } from "react";
import { getDatabase } from "@/src/db";
import type { Locale } from "@/src/i18n/locale";
import { screenText, researchState } from "@/src/i18n/screens";
import {
  formatBudgetUnits,
  durationParts,
  type operationsOverview,
} from "@/src/research/operations";
import {
  trackSourceRefreshCycle,
  type SourceRefreshCycle,
} from "@/src/research/refresh-tracker";

function SourceRefreshSummary({
  refresh,
  locale,
}: {
  refresh: SourceRefreshCycle;
  locale: Locale;
}) {
  const dates = new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  return (
    <section>
      <h2>{locale === "zh-Hans" ? "共享来源刷新" : "Shared source refresh"}</h2>
      <dl>
        <div>
          <dt>
            {locale === "zh-Hans"
              ? "最近一次完整共享刷新"
              : "Last complete shared refresh"}
          </dt>
          <dd>
            {refresh.lastCompleteRefreshAt ? (
              <time dateTime={refresh.lastCompleteRefreshAt}>
                {dates.format(new Date(refresh.lastCompleteRefreshAt))} UTC
              </time>
            ) : locale === "zh-Hans" ? (
              "尚未记录完整共享刷新"
            ) : (
              "No complete shared refresh recorded"
            )}
          </dd>
        </div>
        <div>
          <dt>
            {locale === "zh-Hans"
              ? "已启用的非模拟来源"
              : "Enabled non-synthetic sources"}
          </dt>
          <dd>{refresh.totalSources}</dd>
        </div>
        <div>
          <dt>
            {locale === "zh-Hans"
              ? "已有成功观测的来源"
              : "Sources with a successful observation"}
          </dt>
          <dd>{refresh.completedSources}</dd>
        </div>
        <div>
          <dt>
            {locale === "zh-Hans" ? "逾期来源检查" : "Overdue source checks"}
          </dt>
          <dd>{refresh.overdueCount}</dd>
        </div>
      </dl>
      <p>
        {locale === "zh-Hans"
          ? "完整时间采用每个当前来源最近一次成功观测中的最早时间。逾期数量依据已保存的检查计划；这些指标不包含抓取内容、请求凭据或私人账户数据。"
          : "The completion time is the earliest of each current source’s latest successful observations. The overdue count follows stored check schedules; these metrics contain no captured content, request credentials or private account data."}
      </p>
    </section>
  );
}

async function LoadedSourceRefreshSummary({ locale }: { locale: Locale }) {
  const refresh = await trackSourceRefreshCycle((await getDatabase()).sql);
  return <SourceRefreshSummary refresh={refresh} locale={locale} />;
}

export default function OperationsSummary({
  data,
  locale,
  refresh,
}: {
  data: Awaited<ReturnType<typeof operationsOverview>>;
  locale: Locale;
  refresh?: SourceRefreshCycle;
}) {
  const t = (key: string, values?: Record<string, string | number>) =>
    screenText(locale, key, values);
  const dates = new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const date = dates.format(new Date(data.observedAt));
  return (
    <div lang={locale}>
      <h1>{t("Operations overview")}</h1>
      <p>
        {t(
          "Read-only snapshot of retained records. Job and candidate states are not attempt counts, source coverage or publication-success measurements.",
        )}
      </p>
      <p>
        {t("Snapshot time")}: <time dateTime={data.observedAt}>{date} UTC</time>
      </p>
      {refresh ? (
        <SourceRefreshSummary refresh={refresh} locale={locale} />
      ) : (
        <Suspense
          fallback={
            <p role="status">
              {locale === "zh-Hans"
                ? "正在加载共享来源刷新状态…"
                : "Loading shared source refresh status…"}
            </p>
          }
        >
          <LoadedSourceRefreshSummary locale={locale} />
        </Suspense>
      )}
      <section>
        <h2>{t("Repeated collection failures")}</h2>
        <p role="status">
          {t("Sources whose latest two terminal jobs failed: {count}", {
            count: data.failureWarnings.total,
          })}
        </p>
        {data.failureWarnings.items.length ? (
          <ul>
            {data.failureWarnings.items.map((source) => (
              <li key={source.sourceId}>
                <Link
                  href={
                    "/admin/research/browse?kind=jobs&source=" +
                    encodeURIComponent(source.sourceId)
                  }
                >
                  <span lang="">{source.sourceName}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {BigInt(data.failureWarnings.total) >
        BigInt(data.failureWarnings.items.length) ? (
          <p>
            {t(
              "Showing the first 10 affected sources. Inspect the research browser for more retained jobs.",
            )}
          </p>
        ) : null}
        <p>
          {t(
            "This read-only indicator checks retained done, failed and cancelled job records ordered by creation time and ID. Queued/running jobs do not reset it; a later done or cancelled record does. It is not an attempt count, a measured run-success rate or an external alert.",
          )}
        </p>
      </section>
      <section>
        <h2>{t("Workload age and scheduling")}</h2>
        <dl>
          <div>
            <dt>{t("Hosts with active collection leases")}</dt>
            <dd>{data.aging.busyHosts}</dd>
          </div>
          <div>
            <dt>{t("Host cooldowns still active")}</dt>
            <dd>{data.aging.coolingHosts}</dd>
          </div>
          <div>
            <dt>{t("Queued jobs passing stored scheduling gates")}</dt>
            <dd>{data.aging.queuedReady}</dd>
          </div>
          <div>
            <dt>{t("Running jobs with expired leases")}</dt>
            <dd>{data.aging.expiredLeases}</dd>
          </div>
          <div>
            <dt>{t("Enabled sources past their scheduled check time")}</dt>
            <dd>{data.sources.due}</dd>
          </div>
          {(
            [
              [
                "oldestQueuedAt",
                "oldestQueuedAgeSeconds",
                "Oldest queued job record",
              ],
              [
                "oldestPendingAt",
                "oldestPendingAgeSeconds",
                "Oldest pending candidate record",
              ],
            ] as const
          ).map(([atKey, ageKey, label]) => (
            <div key={atKey}>
              <dt>{t(label)}</dt>
              <dd>
                {data.aging[atKey] !== null && data.aging[ageKey] !== null ? (
                  <>
                    <time dateTime={data.aging[atKey]!}>
                      {dates.format(new Date(data.aging[atKey]!))} UTC
                    </time>
                    {" · "}
                    {t(
                      "{days}d {hours}h {minutes}m {seconds}s",
                      durationParts(data.aging[ageKey]!),
                    )}
                  </>
                ) : (
                  t("No matching pending records")
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p>
          {t(
            "Active host leases and cooldowns can overlap; their counts are separate indicators.",
          )}
        </p>
        <p>
          {t(
            "Ages start at record creation and include retries and holds; they are not time in the current state or execution duration. UTC ages clamp future creation times to zero.",
          )}
        </p>
        <p>
          {t(
            "Scheduling counts reflect stored gates at this snapshot, not worker locks or source availability. Due sources may still be held for review or Retry-After. No alert or recovery action runs from this page.",
          )}
        </p>
      </section>
      <section>
        <h2>{t("Collection queue")}</h2>
        <p>
          {t("Total stored jobs")}: {data.jobs.total}
        </p>
        <dl>
          {(["queued", "running", "done", "failed", "cancelled"] as const).map(
            (state) => (
              <div key={state}>
                <dt>
                  <Link
                    href={"/admin/research/browse?kind=jobs&state=" + state}
                  >
                    {researchState(locale, "job", state)}
                  </Link>
                </dt>
                <dd>{data.jobs[state]}</dd>
              </div>
            ),
          )}
        </dl>
      </section>
      <section>
        <h2>{t("Review candidates")}</h2>
        <p>
          {t("Total stored candidates")}: {data.candidates.total}
        </p>
        <dl>
          {(["pending", "drafted", "rejected"] as const).map((state) => (
            <div key={state}>
              <dt>
                <Link
                  href={"/admin/research/browse?kind=candidates&state=" + state}
                >
                  {researchState(locale, "candidate", state)}
                </Link>
              </dt>
              <dd>{data.candidates[state]}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2>{t("Source policies")}</h2>
        <dl>
          {(
            [
              ["total", "Registered sources"],
              ["enabled", "Enabled source policies"],
              ["paused", "Paused or unconfigured sources"],
              ["reviewHolds", "Sources awaiting operator review"],
              ["futureHolds", "Sources with future Retry-After holds"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <dt>{t(label)}</dt>
              <dd>{data.sources[key]}</dd>
            </div>
          ))}
        </dl>
        <p>
          {t(
            "Review and future-time holds can overlap. Enabling a source policy does not prove permission, availability or complete coverage.",
          )}
        </p>
        <Link href="/admin/research/browse?kind=sources">
          {t("Browse all research records")}
        </Link>
      </section>
      <section>
        <h2>{t("Research budget reservations")}</h2>
        <p>
          {t(
            "Internal budget units equal one million micro-units. Reservations are not settled provider charges, and no currency or invoice total is inferred. This is the existing shared budget, without monthly reset.",
          )}
        </p>
        {data.budget ? (
          <>
            <p role="status">
              {t(
                {
                  normal: "Reservations are below 70% of the configured limit.",
                  warning:
                    "Budget warning: reservations have reached 70% of the configured limit.",
                  critical:
                    "Budget warning: reservations have reached 90% of the configured limit. Review optional research before running it.",
                  full: "No unreserved budget capacity remains.",
                }[data.budget.reservationStatus.level],
              )}
            </p>
            <p>
              {data.budget.reservationStatus.percent === null
                ? t("A zero limit has no meaningful utilization percentage.")
                : t("Reserved capacity: {percent}% (rounded down).", {
                    percent: data.budget.reservationStatus.percent,
                  })}
            </p>
            <p>
              {t(
                "These warnings do not send messages, reduce workloads, reset the budget or measure provider spending. Existing reservation guards still apply to new work.",
              )}
            </p>
            <dl>
              {(
                [
                  ["limitMicros", "Configured budget limit"],
                  ["reservedMicros", "Shared reserved budget"],
                  ["availableMicros", "Unreserved capacity"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <dt>{t(label)}</dt>
                  <dd>{formatBudgetUnits(data.budget![key])}</dd>
                </div>
              ))}
            </dl>
            {data.budget.overLimit ? (
              <p role="status">
                {t("Reservations exceed the configured limit.")}
              </p>
            ) : null}
          </>
        ) : (
          <p role="status">
            {t("Budget configuration unavailable; no zero balance is assumed.")}
          </p>
        )}
        <h3>{t("Stored model-attempt ledger")}</h3>
        <dl>
          {(
            [
              ["total", "Total stored model attempts"],
              ["reserved", "Reserved attempts"],
              ["completed", "Completed attempts"],
              ["uncertain", "Uncertain attempts"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <dt>{t(label)}</dt>
              <dd>{data.usage[key]}</dd>
            </div>
          ))}
        </dl>
        <p>
          {t("Reservations recorded in model ledger")}:{" "}
          {formatBudgetUnits(data.usage.reservationMicros)}
        </p>
        <p>
          {t(
            "The shared budget can include other local work, so ledger reservations need not equal the shared reserved balance. Uncertain attempts require investigation; this page does not retry or settle them.",
          )}
        </p>
      </section>
      <nav>
        <Link href="/admin/research">{t("Back to research workspace")}</Link>
        {" · "}
        <Link href="/admin/catalogue">{t("Admin catalogue")}</Link>
      </nav>
    </div>
  );
}
