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
  const raw = await searchParams;
  let filters: import("../../src/catalogue/service").Filters;
  try {
    filters = parseFilters(raw);
  } catch {
    filters = parseFilters({});
  }
  const { items, total, page, pageSize } = await listPublic(
    (await getDatabase()).sql,
    filters,
  );
  function pageLink(next: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value !== undefined) params.set(key, String(value));
    params.set("page", String(next));
    return "/opportunities?" + params.toString();
  }
  return (
    <>
      <p className="eyebrow">SMART MANUFACTURING OPPORTUNITIES</p>
      <h1>
        Find your next
        <br />
        step forward.
      </h1>
      <p className="intro">
        Explore reviewed scholarships, learning programs and events. Check
        funding, remaining costs and the official source before applying.
      </p>
      <div className="notice">
        Local prototype. Any synthetic records are clearly labelled and have no
        application link.
      </div>
      <form className="filters" action="/opportunities">
        <label>
          Search
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Topic, title or organizer"
            maxLength={120}
          />
        </label>
        <label>
          Type
          <select name="category" defaultValue={filters.category ?? ""}>
            <option value="">All types</option>
            <option value="scholarship">Scholarships</option>
            <option value="course">Courses</option>
            <option value="event">Events</option>
          </select>
        </label>
        <label>
          Teaching language
          <select name="language" defaultValue={filters.language ?? ""}>
            <option value="">All languages</option>
            <option value="en">English</option>
            <option value="zh">Chinese</option>
            <option value="other">Other</option>
            <option value="unknown">Not stated</option>
          </select>
        </label>
        <label>
          Funding
          <select name="funding" defaultValue={filters.funding ?? ""}>
            <option value="">Free and funded opportunities</option>
            {Object.entries(fundingLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button>Find opportunities</button>
      </form>
      <section>
        <div className="section-title">
          <h2>Explore opportunities</h2>
          <span>
            {total} result{total === 1 ? "" : "s"}
          </span>
        </div>
        {!items.length ? (
          <p>
            No reviewed opportunities match these filters. Try a broader search
            or check back after the next review.
          </p>
        ) : (
          <div className="catalogue">
            {items.map((item) => (
              <article key={item.id}>
                <div className="tags">
                  <span>{item.details.category}</span>
                  <span>{fundingLabels[item.details.funding]}</span>
                  {item.synthetic ? <span>Synthetic fixture</span> : null}
                </div>
                <h3>
                  <Link href={"/opportunities/" + encodeURIComponent(item.id)}>
                    {item.details.title}
                  </Link>
                </h3>
                <p>{item.details.summary}</p>
                <p>
                  {item.details.organizer} ·{" "}
                  {item.details.mode === "online"
                    ? "Online"
                    : item.details.country}
                </p>
                <p>
                  Deadline: {item.details.deadline ?? "Not stated"}
                  {item.details.deadline ? " · Timezone not stated" : ""}
                </p>
                <p>
                  Application fee: {item.details.applicationFee ?? "Not stated"}
                </p>
                <p className="muted">
                  Last verified:{" "}
                  {item.verified_at?.slice(0, 10) ?? "Not stated"}
                </p>
                <Link
                  className="button"
                  href={"/opportunities/" + encodeURIComponent(item.id)}
                >
                  View details
                </Link>
              </article>
            ))}
          </div>
        )}
        <nav aria-label="Results pagination" className="pagination">
          {page > 1 ? <Link href={pageLink(page - 1)}>Previous</Link> : null}
          {page * pageSize < total ? (
            <Link href={pageLink(page + 1)}>Next</Link>
          ) : null}
        </nav>
      </section>
    </>
  );
}
