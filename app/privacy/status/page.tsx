import { interfaceLocale } from "@/src/i18n/server";
import { screenText } from "@/src/i18n/screens";
import DeletionStatus from "../deletion-status";
export default async function PrivacyStatus() {
  const locale = await interfaceLocale();
  const t = (key: string) => screenText(locale, key);
  return (
    <div lang={locale}>
      <p className="eyebrow">{t("ACCOUNT DELETION")}</p>
      <h1>{t("Deletion request status.")}</h1>
      <DeletionStatus />
    </div>
  );
}
