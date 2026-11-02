import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { CatalogueError } from "@/src/catalogue/service";
import { collectionJob } from "@/src/research/jobs";
import { interfaceLocale } from "@/src/i18n/server";
import { screenText, researchState } from "@/src/i18n/screens";
import JobActions from "./actions";
export const dynamic = "force-dynamic";
export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  let data: Awaited<ReturnType<typeof collectionJob>>;
  try {
    data = await collectionJob(
      (await getDatabase()).sql,
      session.user.id,
      (await params).id,
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
      screenText(locale, key, values),
    job = data.job;
  const retried = data.actions.some((a) => a.action === "retry");
  const canRetry =
    ["failed", "cancelled"].includes(String(job.state)) &&
    Boolean(job.enabled) &&
    !job.synthetic &&
    !new URL(String(job.url)).hostname.endsWith(".test") &&
    !retried &&
    !job.requires_review;
  const timestamp = (value: unknown) =>
    new Date(
      value instanceof Date ? value.getTime() : String(value),
    ).toISOString();
  const jobLink = (id: unknown) =>
    "/admin/research/jobs/" + encodeURIComponent(String(id));
  return (
    <div lang={locale}>
      <Link href="/admin/research/browse?kind=jobs">
        {t("Back to collection jobs")}
      </Link>
      <h1>{t("Collection job")}</h1>
      <h2 lang="">{String(job.source_name)}</h2>
      <p style={{ overflowWrap: "anywhere" }}>
        <code>{String(job.id)}</code>
      </p>
      {job.synthetic ? <p>{t("Synthetic fixture")}</p> : null}
      <p>{researchState(locale, "job", String(job.state))}</p>
      <p>{t("Attempts: {count}", { count: Number(job.attempts) })}</p>
      {job.error_code ? (
        <p>{t("Diagnostic code: {code}", { code: String(job.error_code) })}</p>
      ) : null}
      <p>{t(job.enabled ? "Collection enabled" : "Collection paused")}</p>
      {job.requires_review ? (
        <p>{t("Retry-After pause requires source-policy review.")}</p>
      ) : null}
      {job.retry_after_at ? (
        <p>
          {t("Source retry not before (UTC)")}:{" "}
          <time dateTime={timestamp(job.retry_after_at)}>
            {timestamp(job.retry_after_at)}
          </time>
        </p>
      ) : null}
      {["queued", "failed"].includes(String(job.state)) ? (
        <p>
          {t("Job available at (UTC)")}:{" "}
          <time dateTime={timestamp(job.available_at)}>
            {timestamp(job.available_at)}
          </time>
        </p>
      ) : null}
      <Link
        href={
          "/admin/research?source=" + encodeURIComponent(String(job.source_id))
        }
      >
        {t("Manage source policy")}
      </Link>
      {data.predecessor ? (
        <p>
          <Link href={jobLink(data.predecessor)}>
            {t("Previous collection job")}
          </Link>
        </p>
      ) : null}
      <JobActions
        key={
          String(job.id) +
          ":" +
          String(job.state) +
          ":" +
          String(job.attempts) +
          ":" +
          String(canRetry)
        }
        id={String(job.id)}
        state={String(job.state)}
        attempts={Number(job.attempts)}
        canRetry={canRetry}
      />
      {!canRetry &&
      ["failed", "cancelled"].includes(String(job.state)) &&
      !retried &&
      !job.requires_review ? (
        <p>{t("Retry requires an enabled, non-synthetic source policy.")}</p>
      ) : null}
      <h2>{t("Job action history")}</h2>
      <p>
        {t(
          "Actions record the administrator and original reason. Provider usage and model reservations are not changed here.",
        )}
      </p>
      {data.actions.length ? (
        data.actions.map((action) => (
          <article key={String(action.id)}>
            <h3>
              {t(
                action.action === "retry"
                  ? "Replacement queued"
                  : "Job cancelled",
              )}
            </h3>
            <p
              lang=""
              style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
            >
              {String(action.note)}
            </p>
            <p>
              <code>{String(action.actor_id)}</code>
              {" · "}
              <time
                dateTime={new Date(String(action.created_at)).toISOString()}
              >
                {new Date(String(action.created_at)).toISOString()}
              </time>
            </p>
            <p>
              {researchState(locale, "job", String(action.previous_state))}
              {" · "}
              {t("Attempts: {count}", {
                count: Number(action.previous_attempts),
              })}
            </p>
            {action.replacement_job_id ? (
              <Link href={jobLink(action.replacement_job_id)}>
                {t("Open replacement job")}
              </Link>
            ) : null}
          </article>
        ))
      ) : (
        <p>{t("No manual job actions yet.")}</p>
      )}
    </div>
  );
}
