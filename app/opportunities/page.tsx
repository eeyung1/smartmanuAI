import { localConfig } from "@/src/config";
import { interfaceLocale } from "@/src/i18n/server";
import { screenText, screenLabel } from "@/src/i18n/screens";
import Link from "next/link";
import { getDatabase } from "@/src/db";
import { listPublic } from "@/src/catalogue/service";
import { parseFilters } from "@/src/catalogue/schema";
export const dynamic = "force-dynamic";
const fundingLabels: Record<string, string> = {
  fully_funded: "Fully funded",
  tuition_only: "Tuition only",
  free_participation: "Free participation",
  partial: "Partial funding",
  unclear: "Funding unclear",
};
export default async function Opportunities({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await interfaceLocale();
  const t = (key: string, values?: Record<string, string | number>) =>
    screenText(locale, key, values);
  const label = (value: string) => screenLabel(locale, value);
  const raw = await searchParams;
  let invalidFilters = false;
  let filters: import("../../src/catalogue/service").Filters;
  try {
    filters = parseFilters(raw);
  } catch {
    invalidFilters = true;
    filters = parseFilters({});
  }
  const { items, total, page, pageSize } = invalidFilters
    ? { items: [], total: 0, page: 1, pageSize: 12 }
    : await listPublic((await getDatabase()).sql, filters);
  function pageLink(next: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value !== undefined) params.set(key, String(value));
    params.set("page", String(next));
    return "/opportunities?" + params.toString();
  }
  return (
    <div lang={locale}>
      <p className="eyebrow">{t("SMART MANUFACTURING OPPORTUNITIES")}</p>
      <h1>
        {t("Find your next")} <br />
        {t("step forward.")}{" "}
      </h1>
      <p className="intro">
        {t(
          "Explore reviewed scholarships, learning programs and events. Check funding, remaining costs and the official source before applying.",
        )}{" "}
      </p>
      <div className="notice">
        {t(
          localConfig().mode === "staging"
            ? "Staging preview: read-only catalogue. Sign-in and notifications are not enabled."
            : "Local prototype. Any synthetic records are clearly labelled and have no application link.",
        )}{" "}
      </div>
      {invalidFilters ? (
        <p role="alert">
          {t(
            "Some filters are invalid. Clear them or choose valid options before searching.",
          )}
        </p>
      ) : null}
      <form className="filters" action="/opportunities">
        <label>
          {t("Search")}{" "}
          <input
            name="q"
            defaultValue={filters.q}
            placeholder={t("Title, organizer or summary")}
            maxLength={120}
          />
        </label>
        <label>
          {t("Type")}{" "}
          <select name="category" defaultValue={filters.category ?? ""}>
            <option value="">{t("All types")}</option>
            <option value="scholarship">{t("Scholarships")}</option>
            <option value="course">{t("Courses")}</option>
            <option value="event">{t("Events")}</option>
          </select>
        </label>
        <label>
          {t("Teaching language")}{" "}
          <select name="language" defaultValue={filters.language ?? ""}>
            <option value="">{t("All languages")}</option>
            <option value="en">{t("English")}</option>
            <option value="zh">{t("Chinese")}</option>
            <option value="other">{t("Other")}</option>
            <option value="unknown">{t("Not stated")}</option>
          </select>
        </label>
        <label>
          {t("Funding")}{" "}
          <select name="funding" defaultValue={filters.funding ?? ""}>
            <option value="">{t("Free and funded opportunities")}</option>
            {Object.entries(fundingLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Topic contains")}
          <input
            name="topic"
            minLength={2}
            maxLength={70}
            defaultValue={filters.topic}
            placeholder={t("For example: digital twins")}
          />
        </label>
        <label>
          {t("Study level")}
          <select name="studyLevel" defaultValue={filters.studyLevel ?? ""}>
            <option value="">{t("All study levels")}</option>
            {(["bachelor", "master", "doctorate"] as const).map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
            <option value="not_stated">{t("Not stated")}</option>
          </select>
        </label>
        <label>
          {t("Participation mode")}
          <select name="mode" defaultValue={filters.mode ?? ""}>
            <option value="">{t("All modes")}</option>
            <option value="online">{t("Online")}</option>
            <option value="in_person">{t("In person")}</option>
          </select>
        </label>
        <label>
          {t("Location")}
          <select name="country" defaultValue={filters.country ?? ""}>
            <option value="">{t("All locations")}</option>
            <option value="CN">{t("China (CN)")}</option>
            <option value="not_stated">{t("Location not stated")}</option>
          </select>
        </label>
        <label>
          {t("Deadline filter")}
          <select name="deadline" defaultValue={filters.deadline ?? ""}>
            <option value="">{t("All deadline states")}</option>
            <option value="next_30_days">
              {t("Next 30 calendar days (UTC)")}
            </option>
            <option value="dated">{t("Dated deadlines only")}</option>
            <option value="not_stated">{t("Deadline not stated")}</option>
          </select>
        </label>
        <button>{t("Find opportunities")}</button>
        <Link href="/opportunities">{t("Clear filters")}</Link>
      </form>
      <p className="muted">
        {t(
          "Date-only filters use UTC calendar dates; the source deadline timezone remains unknown. Unstated values do not confirm eligibility.",
        )}
      </p>
      <section>
        <div className="section-title">
          <h2>{t("Explore opportunities")}</h2>
          <span>{t("Results: {count}", { count: total })}</span>
        </div>
        {!items.length ? (
          <p>
            {t(
              "No reviewed opportunities match these filters. Try a broader search or check back after the next review.",
            )}{" "}
          </p>
        ) : (
          <div className="catalogue">
            {items.map((item) => (
              <article key={item.id}>
                <div className="tags">
                  <span>{label(item.details.category)}</span>
                  <span>{t(fundingLabels[item.details.funding])}</span>
                  {item.synthetic ? (
                    <span>{t("Synthetic fixture")}</span>
                  ) : null}
                </div>
                <h3>
                  <Link href={"/opportunities/" + encodeURIComponent(item.id)}>
                    <span lang="">{item.details.title}</span>
                  </Link>
                </h3>
                <p lang="">{item.details.summary}</p>
                <p>
                  {item.details.organizer} ·{" "}
                  {item.details.mode === "online"
                    ? t("Online")
                    : item.details.country}
                </p>
                <p>
                  {t("Deadline:")} {item.details.deadline ?? t("Not stated")}
                  {item.details.deadline ? t(" · Timezone not stated") : ""}
                </p>
                <p>
                  {t("Application fee:")}{" "}
                  {item.details.applicationFee ?? t("Not stated")}
                </p>
                <p className="muted">
                  {t("Last verified:")}{" "}
                  {item.verified_at?.slice(0, 10) ?? t("Not stated")}
                </p>
                <Link
                  className="button"
                  href={"/opportunities/" + encodeURIComponent(item.id)}
                >
                  {t("View details")}{" "}
                </Link>
              </article>
            ))}
          </div>
        )}
        <nav aria-label={t("Results pagination")} className="pagination">
          {page > 1 ? (
            <Link href={pageLink(page - 1)}>{t("Previous")}</Link>
          ) : null}
          {page * pageSize < total ? (
            <Link href={pageLink(page + 1)}>{t("Next")}</Link>
          ) : null}
        </nav>
      </section>
    </div>
  );
}
