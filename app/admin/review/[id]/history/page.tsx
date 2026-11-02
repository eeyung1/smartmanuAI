import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { CatalogueError } from "@/src/catalogue/service";
import { auditHistory, historyQuerySchema } from "@/src/catalogue/history";
import { interfaceLocale } from "@/src/i18n/server";
import { screenText, screenLabel } from "@/src/i18n/screens";
export const dynamic = "force-dynamic";
export default async function History({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  let data;
  try {
    data = await auditHistory(
      (await getDatabase()).sql,
      session.user.id,
      (await params).id,
      historyQuerySchema.parse(await searchParams),
    );
  } catch (error) {
    if (
      error instanceof ZodError ||
      (error instanceof CatalogueError && [403, 404].includes(error.status))
    )
      notFound();
    throw error;
  }
  const locale = await interfaceLocale(),
    t = (key: string, values?: Record<string, string | number>) =>
      screenText(locale, key, values);
  const path =
    "/admin/review/" + encodeURIComponent(String(data.record.id)) + "/history";
  return (
    <div lang={locale}>
      <Link href="/admin/review">{t("Back to review queue")}</Link>
      <h1>{t("Revision audit history")}</h1>
      <h2 lang="">{String(data.record.title)}</h2>
      <p>
        {t("Current revision: {revision}", {
          revision: Number(data.record.revision),
        })}{" "}
        · {screenLabel(locale, String(data.record.state))}
      </p>
      <p>
        {t("Source (current registry)")}:{" "}
        <span lang="">{String(data.record.source_name)}</span>
      </p>
      <p>
        {t(
          "Read-only history. Source wording and reviewer notes are shown unchanged. Times below are UTC audit timestamps, not source deadlines.",
        )}
      </p>
      {data.items.length ? (
        data.items.map((item) => (
          <article key={item.revision}>
            <h2>
              {t("Revision {revision}", { revision: item.revision })} ·{" "}
              {screenLabel(locale, item.state)}
            </h2>
            <dl>
              <div>
                <dt>{t("Recorded at (UTC)")}</dt>
                <dd>
                  <time dateTime={item.createdAt}>{item.createdAt}</time>
                </dd>
              </div>
              <div>
                <dt>{t("Actor identifier")}</dt>
                <dd>
                  <code style={{ overflowWrap: "anywhere" }}>
                    {item.actorId}
                  </code>
                </dd>
              </div>
            </dl>
            <h3>{t("Review reason")}</h3>
            <p lang="" style={{ overflowWrap: "anywhere" }}>
              {item.note}
            </p>
            {item.comparison === "initial" ? (
              <p>{t("Initial stored revision; no earlier snapshot exists.")}</p>
            ) : item.comparison === "unavailable" ? (
              <p>
                {t(
                  "The preceding revision is unavailable; no change comparison is claimed.",
                )}
              </p>
            ) : item.changes.length ? (
              <div>
                <h3>{t("Changed fields")}</h3>
                {item.changes.map((change) => (
                  <section key={change.field}>
                    <h4>
                      <code>{change.field}</code>
                    </h4>
                    <p>{t("Before")}</p>
                    <pre
                      lang=""
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {change.before.present
                        ? JSON.stringify(change.before.value, null, 2)
                        : t("Field absent from snapshot")}
                    </pre>
                    <p>{t("After")}</p>
                    <pre
                      lang=""
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {change.after.present
                        ? JSON.stringify(change.after.value, null, 2)
                        : t("Field absent from snapshot")}
                    </pre>
                  </section>
                ))}
              </div>
            ) : (
              <p>
                {t(
                  "No state, detail or evidence fields changed in this revision.",
                )}
              </p>
            )}
            <details>
              <summary>{t("Full stored snapshot")}</summary>
              <pre
                lang=""
                style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              >
                {JSON.stringify(
                  {
                    state: item.state,
                    details: item.details,
                    evidence: item.evidence,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </article>
        ))
      ) : (
        <p>{t("No revisions before this cursor.")}</p>
      )}
      <nav className="pagination" aria-label={t("Audit history pages")}>
        <Link href={path}>{t("Latest revisions")}</Link>
        {data.nextBefore !== null ? (
          <Link href={path + "?before=" + data.nextBefore}>
            {t("Older revisions")}
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
