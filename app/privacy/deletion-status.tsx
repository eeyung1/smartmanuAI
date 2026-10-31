"use client";
import { useScreenText } from "@/src/i18n/context";
import { useState } from "react";
export default function DeletionStatus({
  initialReceipt = "",
}: {
  initialReceipt?: string;
}) {
  const { locale, t, message: translateMessage } = useScreenText();
  const [receipt, setReceipt] = useState(initialReceipt),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section lang={locale}>
      <h2>{t("Check a deletion receipt")}</h2>
      <p>
        {t(
          "The receipt grants access only to status, not account data. Keep it private. It is not saved in this browser.",
        )}{" "}
      </p>
      <label>
        {t("Private receipt")}{" "}
        <input
          value={receipt}
          onChange={(e) => setReceipt(e.target.value)}
          maxLength={64}
          autoComplete="off"
        />
      </label>
      <button
        disabled={busy || receipt.length !== 64}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch(
              "/api/privacy/status?receipt=" + encodeURIComponent(receipt),
            );
            const value = await r.json();
            if (!r.ok)
              throw Error(value.error ?? "Unable to read deletion status.");
            setMessage(
              value.state === "done"
                ? "Application database account and local authentication mail purged. Operational suppression markers and backup expiry are separate."
                : "Deletion queued. Sessions are revoked and digests paused. A separate worker completes the purge.",
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("Check status")}{" "}
      </button>
      <p role="status">{translateMessage(message)}</p>
    </section>
  );
}
