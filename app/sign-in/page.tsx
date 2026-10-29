"use client";
import { useState } from "react";
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="form">
      <p className="eyebrow">YOUR OPPORTUNITY SPACE</p>
      <h1>Welcome back.</h1>
      <p>
        Use a synthetic address ending in <strong>.test</strong>. A sign-in link
        will be written to the local mail sink.
      </p>
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
            setMessage(
              r.ok
                ? "Check the local mail sink for your sign-in link."
                : "Unable to create a link. Check your address and try again.",
            );
          } catch {
            setMessage("Connection failed. Please retry.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="email">Test email</label>
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
        <button disabled={busy}>
          {busy ? "Preparing link…" : "Get sign-in link"}
        </button>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </section>
  );
}
