import Link from "next/link";
import "./style.css";
export const metadata = {
  title: "smartmanuAI local prototype",
  description: "Local validation of smart manufacturing opportunity discovery.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <Link href="/" className="brand">
            smartmanu<span>AI</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/">Opportunities</Link>
            <Link href="/matches">My space</Link>
            <Link href="/notifications">Alerts</Link>
            <Link href="/sign-in">Sign in</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          Local prototype · Synthetic opportunities · Notifications stay in a
          local test sink
        </footer>
      </body>
    </html>
  );
}
