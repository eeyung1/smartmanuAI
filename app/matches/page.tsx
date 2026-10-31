import { interfaceLocale } from "@/src/i18n/server";
import { screenText } from "@/src/i18n/screens";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { readProfile } from "@/src/domain/profile";
import { listTracker } from "@/src/domain/tracker";
import { matchesForUser } from "@/src/domain/matching";
import Workspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Matches() {
  const locale = await interfaceLocale();
  const t = (key: string, values?: Record<string, string | number>) =>
    screenText(locale, key, values);
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const { sql } = await getDatabase();
  const [profile, tracker, matches] = await Promise.all([
    readProfile(sql, session.user.id),
    listTracker(sql, session.user.id),
    matchesForUser(sql, session.user.id),
  ]);
  return (
    <div lang={locale}>
      <p className="eyebrow">{t("YOUR PRIVATE SPACE")}</p>
      <h1>{t("A step closer.")}</h1>
      <p>
        {t("Signed in as")} {session.user.email}
        {t(
          ". Matches use your saved preferences and reviewed source facts. They do not confirm admission eligibility.",
        )}{" "}
      </p>
      <Workspace
        profile={profile}
        initialTracker={tracker}
        initialMatches={matches}
      />
    </div>
  );
}
