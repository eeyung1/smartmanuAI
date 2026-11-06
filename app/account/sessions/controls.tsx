"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useScreenText } from "@/src/i18n/context";
import type { listAccountSessions } from "@/src/auth/sessions";
export default function SessionControls({
  initial,
}: {
  initial: Awaited<ReturnType<typeof listAccountSessions>>;
}) {
  const router = useRouter(),
    { t, message } = useScreenText();
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  return (
    <div>
      <p>
        {t(
          "These are active sign-ins, not a complete activity history. Browser hints may be missing or inaccurate; update times are session updates, not last activity.",
        )}
      </p>
      <p>
        {t(
          "Viewing and revoking sessions requires a sign-in within the last ten minutes. Revoking this sign-in signs you out.",
        )}
      </p>
      <Link href="/sign-in?returnTo=%2Faccount%2Fsessions">
        {t("Sign in again")}
      </Link>
      {initial.items.map((item) => (
        <article key={item.id}>
          <h2>{t(item.current ? "This sign-in" : "Another sign-in")}</h2>
          <p>{item.browser || t("Browser information unavailable")}</p>
          <dl>
            <dt>{t("Created (UTC)")}</dt>
            <dd>{item.createdAt}</dd>
            <dt>{t("Session updated (UTC)")}</dt>
            <dd>{item.updatedAt}</dd>
            <dt>{t("Expires (UTC)")}</dt>
            <dd>{item.expiresAt}</dd>
          </dl>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              if (form.get("confirm") !== "on") return;
              setBusy(true);
              setStatus("");
              try {
                const response = await fetch("/api/me/sessions", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sessionId: item.id }),
                });
                const value = await response.json();
                if (!response.ok)
                  throw Error(value.error ?? "Unable to complete the request.");
                if (value.currentSessionRevoked) {
                  await fetch("/api/auth/sign-out", { method: "POST" }).catch(
                    () => {},
                  );
                  router.replace("/sign-in?returnTo=%2Faccount%2Fsessions");
                } else {
                  setStatus("Sign-in revoked or already unavailable.");
                  router.refresh();
                }
              } catch (error) {
                setStatus((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              <input name="confirm" type="checkbox" required />
              {t("Confirm revoking this sign-in")}
            </label>
            <button disabled={busy}>{t("Revoke sign-in")}</button>
          </form>
        </article>
      ))}
      {initial.items.length === 0 ? (
        <p>{t("No active sign-ins on this page.")}</p>
      ) : null}
      <nav aria-label={t("Session pages")}>
        {initial.page > 1 ? (
          <Link href={`?page=${initial.page - 1}`}>{t("Previous")}</Link>
        ) : null}{" "}
        {initial.page < initial.pages ? (
          <Link href={`?page=${initial.page + 1}`}>{t("Next")}</Link>
        ) : null}
      </nav>
      <p role="status">{message(status)}</p>
    </div>
  );
}
