"use client";
import { useState } from "react";
export default function SaveButton({ id }: { id: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/me/saved", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ opportunityId: id }),
            });
            if (r.status === 401) {
              window.location.assign("/sign-in");
              return;
            }
            setMessage(
              r.ok
                ? "Opportunity saved."
                : "This opportunity could not be saved. Please refresh and retry.",
            );
          } catch {
            setMessage("Connection failed. Please retry.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : "Save opportunity"}
      </button>
      <p role="status">{message}</p>
    </>
  );
}
