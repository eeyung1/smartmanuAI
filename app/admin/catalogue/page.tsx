import BulkArchive from "./bulk-archive";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { CatalogueError } from "@/src/catalogue/service";
import { adminBrowseSchema, browseAdmin } from "@/src/catalogue/admin-browse";
import { interfaceLocale } from "@/src/i18n/server";
import { screenText, screenLabel } from "@/src/i18n/screens";
export const dynamic = "force-dynamic";
export default async function AdminCatalogue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  let data: Awaited<ReturnType<typeof browseAdmin>>;
  try {
    const raw = await searchParams;
    const filters = adminBrowseSchema.parse(
      Object.fromEntries(
        Object.entries(raw).filter(
          ([, value]) => value !== "" && value !== undefined,
        ),
      ),
    );
    data = await browseAdmin(
      (await getDatabase()).sql,
      session.user.id,
      filters,
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
      screenText(locale, key, values);
  const sources = data.filters.kind === "sources";
  function pageLink(page: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data.filters))
      if (value !== undefined) params.set(key, String(value));
    params.set("page", String(page));
    return "/admin/catalogue?" + params;
  }
  return (
    <div lang={locale}>
      <Link href="/admin/review">{t("Back to review queue")}</Link>
      <h1>{t("Admin catalogue browser")}</h1>
      <nav aria-label={t("Catalogue sections")}>
        <Link href="/admin/catalogue">{t("Opportunity records")}</Link>
        <Link href="/admin/catalogue?kind=sources">{t("Source registry")}</Link>
      </nav>
      <p>
        {t(
          "Find older records or sources beyond the review queue's latest 100 entries. Search does not change publication or collection settings.",
        )}
      </p>
      <form className="filters" action="/admin/catalogue">
        <input type="hidden" name="kind" value={data.filters.kind} />
        <label>
          {t("Search catalogue records")}
          <input name="q" maxLength={120} defaultValue={data.filters.q} />
        </label>
        {!sources ? (
          <label>
            {t("Record state")}
            <select name="state" defaultValue={data.filters.state ?? ""}>
              <option value="">{t("All record states")}</option>
              {["draft", "published", "closed", "rejected", "archived"].map(
                (state) => (
                  <option key={state} value={state}>
                    {screenLabel(
                      locale,
                      state === "archived" ? "Archived" : state,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>
        ) : null}
        <button>{t("Search")}</button>
        <Link
          href={sources ? "/admin/catalogue?kind=sources" : "/admin/catalogue"}
        >
          {t("Clear filters")}
        </Link>
      </form>
      <p>{t("Results: {count}", { count: data.total })}</p>
      {!sources ? (
        <BulkArchive
          key={data.items
            .map((item) => String(item.id) + ":" + String(item.revision))
            .join(",")}
          items={data.items
            .filter((item) =>
              ["closed", "rejected"].includes(String(item.state)),
            )
            .map((item) => ({
              id: String(item.id),
              title: String(item.title),
              revision: Number(item.revision),
              state: String(item.state),
            }))}
        />
      ) : null}

      {data.items.length ? (
        data.items.map((item) => (
          <article key={String(item.id)}>
            <h2 lang="">{String(item.title)}</h2>
            <p>
              <code style={{ overflowWrap: "anywhere" }}>
                {String(item.id)}
              </code>
            </p>
            <p>
              {sources ? (
                <span lang="">{String(item.url)}</span>
              ) : (
                <>
                  {screenLabel(locale, String(item.state))} ·{" "}
                  {t("Revision {revision}", {
                    revision: Number(item.revision),
                  })}{" "}
                  · <span lang="">{String(item.source_name)}</span>
                </>
              )}
            </p>
            {item.synthetic ? <p>{t("Synthetic fixture")}</p> : null}
            <Link
              href={
                sources
                  ? "/admin/review?source=" +
                    encodeURIComponent(String(item.id))
                  : "/admin/review?edit=" + encodeURIComponent(String(item.id))
              }
            >
              {sources
                ? t("Create draft from this source")
                : t("Open record editor")}
            </Link>
            {sources ? (
              <p>
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
              </p>
            ) : null}
            {!sources ? (
              <p>
                <Link
                  href={
                    "/admin/review/" +
                    encodeURIComponent(String(item.id)) +
                    "/history"
                  }
                >
                  {t("View revision history")}
                </Link>
              </p>
            ) : null}
          </article>
        ))
      ) : (
        <p>{t("No admin catalogue records match these filters.")}</p>
      )}
      <nav className="pagination" aria-label={t("Admin catalogue pages")}>
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
