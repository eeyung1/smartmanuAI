import { screenText } from "@/src/i18n/screens";
import type { Locale } from "@/src/i18n/locale";
export default function NotFoundScreen({ locale }: { locale: Locale }) {
  const t = (key: string) => screenText(locale, key);
  return (
    <section lang={locale} aria-labelledby="not-found-heading">
      <h1 id="not-found-heading">{t("Page not found.")}</h1>
      <p>
        {t(
          "This page or opportunity is unavailable. Browse the catalogue or sign in to continue.",
        )}
      </p>
      <p>
        <a href="/opportunities">{t("Browse opportunities")}</a>
      </p>
      <p>
        <a href="/sign-in">{t("Sign in")}</a>
      </p>
    </section>
  );
}
