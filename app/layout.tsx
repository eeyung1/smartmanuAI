import Link from "next/link";
import "./style.css";
import { LocaleProvider } from "@/src/i18n/context";
import LanguageSelector from "./language-selector";
import { interfaceLocale } from "@/src/i18n/server";
import { localConfig } from "@/src/config";
import { screenText } from "@/src/i18n/screens";
import { interfaceCopy } from "@/src/i18n/copy";
export const metadata = {
  title: "smartmanuAI",
  description: "Smart manufacturing scholarships, programs and events.",
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await interfaceLocale();
  const copy = interfaceCopy(locale);
  return (
    <html lang={locale}>
      <body>
        <header>
          <Link href="/" className="brand">
            smartmanu<span>AI</span>
          </Link>
          <nav aria-label={copy.nav}>
            <Link href="/">{copy.opportunities}</Link>
            <Link href="/matches">{copy.space}</Link>
            <Link href="/notifications">{copy.alerts}</Link>
            <Link href="/privacy">{copy.privacy}</Link>
            <Link href="/sign-in">{copy.signIn}</Link>
          </nav>
        </header>
        <LanguageSelector locale={locale} />
        {localConfig().mode === "staging" ? (
          <p className="locale-notice">
            {screenText(
              locale,
              "Staging preview: read-only catalogue. Sign-in and notifications are not enabled.",
            )}
          </p>
        ) : null}
        {locale === "zh-Hans" ? (
          <p className="locale-notice">{copy.partial}</p>
        ) : null}
        <main lang="en">
          <LocaleProvider locale={locale}>{children}</LocaleProvider>
        </main>
        <footer>
          {localConfig().mode === "staging"
            ? screenText(
                locale,
                "Staging preview: read-only catalogue. Sign-in and notifications are not enabled.",
              )
            : copy.footer}
        </footer>
      </body>
    </html>
  );
}
