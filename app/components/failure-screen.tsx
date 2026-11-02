"use client";
import { screenText } from "@/src/i18n/screens";
import type { Locale } from "@/src/i18n/locale";
export default function FailureScreen({
  locale,
  reset,
}: {
  locale: Locale;
  reset?: () => void;
}) {
  const t = (key: string) => screenText(locale, key);
  return (
    <section lang={locale} aria-labelledby="failure-heading">
      <h1 id="failure-heading">{t("Something went wrong.")}</h1>
      <p>
        {t(
          "We could not load this page. Try loading it again or return to the catalogue.",
        )}
      </p>
      <p>
        {t(
          "If you just submitted a change, check its status before submitting again.",
        )}
      </p>
      {reset ? <button onClick={reset}>{t("Try loading again")}</button> : null}
      <p>
        <a href="/opportunities">{t("Browse opportunities")}</a>
      </p>
      <p>
        <a href="/privacy/status">{t("Check a deletion receipt")}</a>
      </p>
    </section>
  );
}
