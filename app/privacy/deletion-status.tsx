"use client";
import { useState } from "react";
export default function DeletionStatus({
  initialReceipt = "",
}: {
  initialReceipt?: string;
}) {
  const [receipt, setReceipt] = useState(initialReceipt),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section>
      <h2>Check a deletion receipt</h2>
      <p>
        The receipt grants access only to status, not account data. Keep it
        private. It is not saved in this browser.
      </p>
      <label>
        Private receipt
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
        Check status
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
