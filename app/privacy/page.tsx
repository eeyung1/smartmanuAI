import { interfaceLocale } from "@/src/i18n/server";
import { screenText } from "@/src/i18n/screens";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/src/auth";
import PrivacyControls from "./privacy-controls";
export const dynamic = "force-dynamic";
export default async function Privacy() {
  const locale = await interfaceLocale();
  const t = (key: string) => screenText(locale, key);
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return (
    <div lang={locale}>
      <p className="eyebrow">{t("YOUR ACCOUNT")}</p>
      <h1>{t("Privacy controls.")}</h1>
      <p>
        {t(
          "Export your application profile and activity, or request deletion. Both actions require a sign-in within the last ten minutes.",
        )}{" "}
      </p>
      <PrivacyControls />
    </div>
  );
}
