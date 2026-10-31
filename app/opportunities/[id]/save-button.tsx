"use client";
import { useScreenText } from "@/src/i18n/context";
import { useState } from "react";
export default function SaveButton({ id }: { id: string }) {
  const { t, message: translateMessage } = useScreenText();
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
        {busy ? t("Saving…") : t("Save opportunity")}
      </button>
      <p role="status">{translateMessage(message)}</p>
    </>
  );
}
