import { interfaceLocale } from "@/src/i18n/server";
import SignIn from "./form";
import { localConfig } from "@/src/config";
import { screenText } from "@/src/i18n/screens";
export default async function SignInPage() {
  const locale = await interfaceLocale();
  if (localConfig().mode === "staging")
    return (
      <section lang={locale}>
        <h1>{screenText(locale, "Staging preview")}</h1>
        <p>
          {screenText(
            locale,
            "Sign-in is unavailable in this staging preview.",
          )}
        </p>
        <p>
          {screenText(
            locale,
            "The catalogue is connected to the staging database. Account email and notifications are not enabled.",
          )}
        </p>
      </section>
    );
  return <SignIn key={locale} locale={locale} />;
}
