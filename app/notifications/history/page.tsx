import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { browseDigestHistory } from "@/src/jobs/digest-history";
import { interfaceLocale } from "@/src/i18n/server";
import { screenText, screenLabel } from "@/src/i18n/screens";
export const dynamic = "force-dynamic";
export default async function DigestHistory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?returnTo=%2Fnotifications%2Fhistory");
  const locale = await interfaceLocale(),
    t = (value: string) => screenText(locale, value);
  try {
    const history = await browseDigestHistory(
      (await getDatabase()).sql,
      session.user.id,
      await searchParams,
    );
    const dates = new Intl.DateTimeFormat(
      locale === "zh-Hans" ? "zh-CN" : "en",
      { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" },
    );
    const parameters = new URLSearchParams(history.filters);
    const newest = "/notifications/history?" + parameters.toString();
    if (history.nextCursor) parameters.set("cursor", history.nextCursor);
    return (
      <section lang={locale}>
        <h1>{t("Digest history")}</h1>
        <p>
          {t(
            "This list covers stored local digests. Reminders, change alerts and delivery simulations have separate records. Local sink acceptance is not confirmation of email or Telegram delivery.",
          )}
        </p>
        <form method="GET" action="/notifications/history" className="filters">
          <label>
            {t("Channel")}
            <select name="channel" defaultValue={history.filters.channel}>
              <option value="all">{t("All digest channels")}</option>
              <option value="email">{screenLabel(locale, "email")}</option>
              <option value="telegram">
                {screenLabel(locale, "telegram")}
              </option>
            </select>
          </label>
          <label>
            {t("Digest state")}
            <select name="state" defaultValue={history.filters.state}>
              <option value="all">{t("All digest states")}</option>
              {["queued", "accepted", "suppressed"].map((state) => (
                <option key={state} value={state}>
                  {state === "accepted"
                    ? t("Accepted by local sink")
                    : screenLabel(locale, state)}
                </option>
              ))}
            </select>
          </label>
          <button>{t("Filter digest history")}</button>
        </form>
        {history.items.length ? (
          <ul>
            {history.items.map((item) => (
              <li key={item.id}>
                <time dateTime={item.createdAt}>
                  {dates.format(new Date(item.createdAt))} UTC
                </time>
                {" · "}
                {screenLabel(locale, item.channel)}
                {" · "}
                {item.state === "accepted"
                  ? t("Accepted by local sink")
                  : screenLabel(locale, item.state)}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("No digests match these filters.")}</p>
        )}
        <nav aria-label={t("Digest history navigation")}>
          <Link href={newest}>{t("Newest digests")}</Link>{" "}
          {history.nextCursor ? (
            <Link href={"/notifications/history?" + parameters.toString()}>
              {t("Older digests")}
            </Link>
          ) : null}
        </nav>
        <p>
          {t(
            "History is live: new records and state changes appear when you return to the newest results.",
          )}
        </p>
        <Link href="/notifications">{t("Back to notification settings")}</Link>
      </section>
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError)
      return (
        <section lang={locale}>
          <h1>{t("Digest history")}</h1>
          <p role="alert">
            {t(
              "Invalid history filters or cursor. Start from the newest results.",
            )}
          </p>
          <Link href="/notifications/history">{t("Newest digests")}</Link>
        </section>
      );
    throw error;
  }
}
