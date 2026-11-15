"use client";
import type { Locale } from "@/src/i18n/locale";
import { interfaceCopy } from "@/src/i18n/copy";
import { safeAuthDestination } from "@/src/auth/destination";
import { useState } from "react";
export default function SignIn({
  locale,
  returnTo,
  live = false,
}: {
  locale: Locale;
  returnTo: string;
  live?: boolean;
}) {
  const copy = interfaceCopy(locale);
  const callbackURL = safeAuthDestination(returnTo);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="form" lang={locale}>
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1>{copy.welcome}</h1>
      <p>{live ? copy.pilotSignInIntro : copy.signInIntro}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch("/api/auth/sign-in/magic-link", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, callbackURL }),
            });
            setMessage(
              r.ok
                ? live
                  ? copy.pilotLinkReady
                  : copy.linkReady
                : copy.linkError,
            );
          } catch {
            setMessage(copy.connectionError);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="email">{live ? copy.pilotEmail : copy.email}</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={live ? "you@example.com" : "samuel@example.test"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button disabled={busy}>{busy ? copy.preparing : copy.getLink}</button>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </section>
  );
}
