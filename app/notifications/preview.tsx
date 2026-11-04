"use client";
import { useScreenText } from "@/src/i18n/context";
import { useState } from "react";

type Preview = {
  enabled: boolean;
  channel: string;
  language: string;
  translationFallback: boolean;
  providerMessageSent: false;
  renderedText: string;
  items: {
    id: string;
    title: string;
    organizer: string;
    deadline: string | null;
    sourceURL: string | null;
  }[];
};

export default function NotificationPreview() {
  const { t } = useScreenText();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function loadPreview() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/me/notifications/preview", {
        cache: "no-store",
      });
      const value = await response.json();
      if (!response.ok) throw Error(value.error ?? "Unable to load preview.");
      setPreview(value);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form" aria-labelledby="notification-preview-title">
      <h2 id="notification-preview-title">{t("Upcoming digest preview")}</h2>
      <p>
        {t(
          "Preview the next digest using current fresh matches and notification language. This does not schedule or send a message.",
        )}
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => void loadPreview()}
      >
        {busy ? t("Loading preview") : t("Refresh digest preview")}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {preview ? (
        <div aria-live="polite">
          <p>
            {preview.enabled
              ? t("Digest simulation is enabled.")
              : t("Digest simulation is paused; this is a preview only.")}
          </p>
          {preview.translationFallback ? (
            <p>
              {t(
                "The selected alert translation is unavailable; English is shown.",
              )}
            </p>
          ) : null}
          <pre style={{ whiteSpace: "pre-wrap" }}>{preview.renderedText}</pre>
          {preview.items.length ? (
            <ul>
              {preview.items.map((item) => (
                <li key={item.id}>
                  {item.sourceURL ? (
                    <a href={item.sourceURL} target="_blank" rel="noreferrer">
                      {item.title}
                    </a>
                  ) : (
                    item.title
                  )}{" "}
                  · {item.organizer}
                  {item.deadline ? ` · ${t("Deadline")}: ${item.deadline}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          <p>{t("No provider message was sent.")}</p>
        </div>
      ) : null}
    </section>
  );
}
