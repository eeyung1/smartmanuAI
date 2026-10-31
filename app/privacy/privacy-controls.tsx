"use client";
import { useScreenText } from "@/src/i18n/context";
import DeletionStatus from "./deletion-status";
import Link from "next/link";
import { useState } from "react";
export default function PrivacyControls() {
  const { locale, t, message: translateMessage } = useScreenText();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [receipt, setReceipt] = useState("");
  return (
    <div lang={locale}>
      <section>
        <h2>{t("Export profile and activity")}</h2>
        <p>
          {t(
            "The JSON export excludes sign-in credentials, session/link tokens and private security material. It includes saved activity and notification settings.",
          )}{" "}
        </p>
        <a className="button" href="/api/me/privacy/export">
          {t("Download account export")}{" "}
        </a>
      </section>
      <section className="form">
        <h2>{t("Request account deletion")}</h2>
        <p>
          {t(
            "This immediately pauses alerts, cancels pending work and signs you out on all devices. It cannot recall an already-started provider request. The worker removes your private application database records and local authentication mail, while keeping shared opportunities. Accounts with public review contributions need operator assistance. Provider records, security suppression markers and backup expiry still require a production retention policy.",
          )}{" "}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const r = await fetch("/api/me/privacy/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirmation: f.get("confirmation") }),
              });
              const value = await r.json();
              if (!r.ok)
                throw Error(value.error ?? "Unable to request deletion.");
              setReceipt(value.receipt);

              setMessage(
                "Deletion queued. You are signed out. Keep the private receipt below to check completion.",
              );
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {t("Type DELETE to confirm")}{" "}
            <input
              name="confirmation"
              required
              pattern="DELETE"
              autoComplete="off"
            />
          </label>
          <button disabled={busy || !!receipt}>
            {t("Request deletion and sign out")}{" "}
          </button>
        </form>
      </section>
      <DeletionStatus key={receipt} initialReceipt={receipt} />
      <Link href="/privacy/status">
        {t("Check a receipt without signing in")}
      </Link>
      <p role="status">{translateMessage(message)}</p>
    </div>
  );
}
