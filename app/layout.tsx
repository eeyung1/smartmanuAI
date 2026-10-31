import Link from "next/link";
import "./style.css";
import LanguageSelector from "./language-selector";
import { interfaceLocale } from "@/src/i18n/server";
import { interfaceCopy } from "@/src/i18n/copy";
export const metadata = {
  title: "smartmanuAI local prototype",
  description: "Local validation of smart manufacturing opportunity discovery.",
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
        {locale === "zh-Hans" ? (
          <p className="locale-notice">{copy.partial}</p>
        ) : null}
        <main lang="en">{children}</main>
        <footer>{copy.footer}</footer>
      </body>
    </html>
  );
}
