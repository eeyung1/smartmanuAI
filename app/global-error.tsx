"use client";
import { useState } from "react";
import { isLocale, type Locale } from "@/src/i18n/locale";
import { screenText } from "@/src/i18n/screens";
import FailureScreen from "./components/failure-screen";
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The root layout, session, and cookie APIs may be unavailable here.
  const [locale, setLocale] = useState<Locale>("en");
  const t = (key: string) => screenText(locale, key);
  return (
    <html lang={locale}>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{t("Page unavailable")}</title>
      </head>
      <body
        style={{
          margin: "2rem auto",
          padding: "0 1rem",
          maxWidth: "44rem",
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1.6,
        }}
      >
        <main>
          <label>
            {t("Language for this page")}{" "}
            <select
              value={locale}
              onChange={(event) => {
                if (isLocale(event.target.value)) setLocale(event.target.value);
              }}
            >
              <option value="en" lang="en">
                English
              </option>
              <option value="zh-Hans" lang="zh-Hans">
                简体中文
              </option>
            </select>
          </label>
          <FailureScreen locale={locale} reset={reset} />
        </main>
      </body>
    </html>
  );
}
