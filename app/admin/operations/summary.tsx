import Link from "next/link";
import type { Locale } from "@/src/i18n/locale";
import { screenText, researchState } from "@/src/i18n/screens";
import {
  formatBudgetUnits,
  type operationsOverview,
} from "@/src/research/operations";
export default function OperationsSummary({
  data,
  locale,
}: {
  data: Awaited<ReturnType<typeof operationsOverview>>;
  locale: Locale;
}) {
  const t = (key: string) => screenText(locale, key);
  const date = new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(data.observedAt));
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
