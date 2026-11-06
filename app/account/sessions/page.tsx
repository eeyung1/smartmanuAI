import { ZodError } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { listAccountSessions } from "@/src/auth/sessions";
import { CatalogueError } from "@/src/catalogue/service";
import { interfaceLocale } from "@/src/i18n/server";
import { screenText } from "@/src/i18n/screens";
import SessionControls from "./controls";
export const dynamic = "force-dynamic";
export default async function Sessions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?returnTo=%2Faccount%2Fsessions");
  const locale = await interfaceLocale(),
    t = (value: string) => screenText(locale, value);
  try {
    const result = await listAccountSessions(
      (await getDatabase()).sql,
      { userId: session.user.id, sessionId: session.session.id },
      await searchParams,
    );
    return (
      <section lang={locale}>
        <h1>{t("Active sign-ins")}</h1>
        <SessionControls initial={result} />
      </section>
    );
  } catch (error) {
    if (error instanceof CatalogueError && error.status === 401)
      redirect("/sign-in?returnTo=%2Faccount%2Fsessions");
    if (error instanceof CatalogueError && error.status === 403)
      return (
        <section lang={locale}>
          <h1>{t("Active sign-ins")}</h1>
          <p>{t("Sign in again before managing your sessions.")}</p>
          <Link href="/sign-in?returnTo=%2Faccount%2Fsessions">
            {t("Sign in again")}
          </Link>
        </section>
      );
    if (error instanceof ZodError)
      return (
        <section lang={locale}>
          <h1>{t("Active sign-ins")}</h1>
          <p role="alert">{t("Invalid request fields.")}</p>
          <Link href="/account/sessions">{t("Return to active sign-ins")}</Link>
        </section>
      );
    throw error;
  }
}
