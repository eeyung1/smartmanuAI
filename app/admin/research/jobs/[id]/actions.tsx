"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useScreenText } from "@/src/i18n/context";
export default function JobActions({
  id,
  state,
  attempts,
  canRetry,
}: {
  id: string;
  state: string;
  attempts: number;
  canRetry: boolean;
}) {
  const { t, message: translateMessage } = useScreenText(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const action = ["queued", "running"].includes(state)
    ? "cancel"
    : canRetry
      ? "retry"
      : null;
  if (!action) return null;
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget,
          note = String(new FormData(form).get("note") ?? "");
        setBusy(true);
        setStatus("");
        try {
          const response = await fetch(
            "/api/admin/research/jobs/" + encodeURIComponent(id),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action,
                expectedState: state,
                expectedAttempts: attempts,
                note,
              }),
            },
          );
          const result = await response.json();
          if (!response.ok) throw Error(result.error ?? "Unable to save.");
          form.reset();
          setStatus(t("Saved. Reloaded job status requested."));
          router.refresh();
        } catch (error) {
          setStatus(
            translateMessage(
              error instanceof Error ? error.message : "Unable to save.",
            ),
          );
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        {t(
          action === "cancel"
            ? "Cancelling stops this job and discards any late worker result. It does not pause future source schedules."
            : "Retry creates one queued replacement and retains the original attempt. Collection requires a separately running worker.",
        )}
      </p>
      <label>
        {t("Reason for this job action")}
        <textarea
          name="note"
          required
          minLength={10}
          maxLength={1000}
          disabled={busy}
        />
      </label>
      <button disabled={busy}>
        {t(
          busy
            ? "Saving…"
            : action === "cancel"
              ? "Cancel collection job"
              : "Queue replacement job",
        )}
      </button>
      <p role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}
