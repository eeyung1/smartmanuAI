"use client";
import type { Locale } from "@/src/i18n/locale";
import { interfaceCopy } from "@/src/i18n/copy";
import { useState } from "react";
export default function SignIn({ locale }: { locale: Locale }) {
  const copy = interfaceCopy(locale);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="form" lang={locale}>
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1>{copy.welcome}</h1>
      <p>{copy.signInIntro}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch("/api/auth/sign-in/magic-link", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, callbackURL: "/matches" }),
            });
            setMessage(r.ok ? copy.linkReady : copy.linkError);
          } catch {
            setMessage(copy.connectionError);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="email">{copy.email}</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="samuel@example.test"
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
