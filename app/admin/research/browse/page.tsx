import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { CatalogueError } from "@/src/catalogue/service";
import {
  browseResearch,
  researchBrowseSchema,
  researchStates,
} from "@/src/research/browse";
import { interfaceLocale } from "@/src/i18n/server";
import { screenText, researchState } from "@/src/i18n/screens";
export const dynamic = "force-dynamic";
export default async function ResearchBrowser({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  let data: Awaited<ReturnType<typeof browseResearch>>;
  try {
    const raw = await searchParams;
    data = await browseResearch(
      (await getDatabase()).sql,
      session.user.id,
      researchBrowseSchema.parse(
        Object.fromEntries(
          Object.entries(raw).filter(
            ([, value]) => value !== "" && value !== undefined,
          ),
        ),
      ),
    );
  } catch (error) {
    if (
      error instanceof ZodError ||
      (error instanceof CatalogueError && error.status === 403)
    )
      notFound();
    throw error;
  }
  const locale = await interfaceLocale(),
    t = (key: string, values?: Record<string, string | number>) =>
      screenText(locale, key, values),
    kind = data.filters.kind;
  const stateLabel = (state: string) =>
    kind === "sources"
      ? t(state === "enabled" ? "Collection enabled" : "Collection paused")
      : researchState(locale, kind === "jobs" ? "job" : "candidate", state);
  function pageLink(page: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data.filters))
      if (value !== undefined) params.set(key, String(value));
    params.set("page", String(page));
    return "/admin/research/browse?" + params;
  }
  return (
    <div lang={locale}>
      <Link href="/admin/research">{t("Back to research dashboard")}</Link>
      <h1>{t("Research catalogue browser")}</h1>
      <nav aria-label={t("Research sections")}>
        {["sources", "jobs", "candidates"].map((section) => (
          <Link key={section} href={"/admin/research/browse?kind=" + section}>
            {t(
              section === "sources"
                ? "Registered sources"
                : section === "jobs"
                  ? "Collection jobs"
                  : "Captured candidates",
            )}
          </Link>
        ))}
      </nav>
      <p>
        {t(
          "Browse older source policies, jobs and candidates. Opening a record does not collect a source or run a model.",
        )}
      </p>
      <form className="filters" action="/admin/research/browse">
        <input type="hidden" name="kind" value={kind} />
        {data.filters.source ? (
          <input type="hidden" name="source" value={data.filters.source} />
        ) : null}
        <label>
          {t("Search source name or identifier")}
          <input name="q" maxLength={120} defaultValue={data.filters.q} />
        </label>
        <label>
          {t("Research state")}
          <select name="state" defaultValue={data.filters.state ?? ""}>
            <option value="">{t("All research states")}</option>
            {researchStates[kind].map((state) => (
              <option key={state} value={state}>
                {stateLabel(state)}
              </option>
            ))}
          </select>
        </label>
        <button>{t("Search")}</button>
        <Link href={"/admin/research/browse?kind=" + kind}>
          {t("Clear filters")}
        </Link>
      </form>
      {data.filters.source ? (
        <p>
          {t("Source identifier")}:{" "}
          <code style={{ overflowWrap: "anywhere" }}>
            {data.filters.source}
          </code>
        </p>
      ) : null}
      <p>{t("Results: {count}", { count: data.total })}</p>
      {data.items.length ? (
        data.items.map((item) => (
          <article key={String(item.id)}>
            <h2 lang="">{String(item.source_name)}</h2>
            <p>
              <code style={{ overflowWrap: "anywhere" }}>
                {String(item.id)}
              </code>
            </p>
            {item.synthetic ? <p>{t("Synthetic fixture")}</p> : null}
            <p>
              {kind === "sources"
                ? t(item.enabled ? "Collection enabled" : "Collection paused")
                : stateLabel(String(item.state))}
            </p>
            {kind === "sources" ? (
              <>
                <p style={{ overflowWrap: "anywhere" }} lang="">
                  {String(item.url)}
                </p>
                <Link
                  href={
                    "/admin/research?source=" +
                    encodeURIComponent(String(item.id)) +
                    "#source-" +
                    encodeURIComponent(String(item.id))
                  }
                >
                  {t("Manage source policy")}
                </Link>
                <p>
                  <Link
                    href={
                      "/admin/research/browse?kind=jobs&source=" +
                      encodeURIComponent(String(item.id))
                    }
                  >
                    {t("View source jobs")}
                  </Link>
                  {" · "}
                  <Link
                    href={
                      "/admin/research/browse?kind=candidates&source=" +
                      encodeURIComponent(String(item.id))
                    }
                  >
                    {t("View source candidates")}
                  </Link>
                </p>
              </>
            ) : kind === "jobs" ? (
              <div>
                <p>
                  <Link
                    href={
                      "/admin/research/jobs/" +
                      encodeURIComponent(String(item.id))
                    }
                  >
                    {t("Inspect collection job")}
                  </Link>
                </p>
                <p>
                  {t("Attempts: {count}", { count: Number(item.attempts) })}
                  {item.error_code
                    ? " · " +
                      t("Diagnostic code: {code}", {
                        code: String(item.error_code),
                      })
                    : ""}
                </p>
              </div>
            ) : (
              <>
                <p lang="" style={{ overflowWrap: "anywhere" }}>
                  {String(item.excerpt)}
                </p>
                <Link
                  href={
                    "/admin/research?candidate=" +
                    encodeURIComponent(String(item.id)) +
                    "#candidate-" +
                    encodeURIComponent(String(item.id))
                  }
                >
                  {t("Inspect candidate")}
                </Link>
                {item.opportunity_id ? (
                  <p>
                    <Link
                      href={
                        "/admin/review?edit=" +
                        encodeURIComponent(String(item.opportunity_id))
                      }
                    >
                      {t("Open record editor")}
                    </Link>
                  </p>
                ) : null}
              </>
            )}
          </article>
        ))
      ) : (
        <p>{t("No research records match these filters.")}</p>
      )}
      <nav className="pagination" aria-label={t("Research catalogue pages")}>
        {data.page > 1 ? (
          <Link href={pageLink(data.page - 1)}>{t("Previous")}</Link>
        ) : null}
        {data.page * data.pageSize < data.total ? (
          <Link href={pageLink(data.page + 1)}>{t("Next")}</Link>
        ) : null}
      </nav>
      <p>
        {t(
          "This is a live list; edits may change its ordering. Refresh or return to page one to see the latest records.",
        )}
      </p>
    </div>
  );
}
