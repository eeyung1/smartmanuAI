"use client";
import { useScreenText } from "@/src/i18n/context";
import { useState } from "react";
type Dashboard = {
  sources: {
    id: string;
    name: string;
    url: string;
    synthetic: boolean;
    enabled: boolean;
    permission_note: string | null;
  }[];
  jobs: {
    id: string;
    source_id: string;
    state: string;
    attempts: number;
    error_code: string | null;
  }[];
  candidates: {
    id: string;
    state: string;
    content: string;
    source_id: string;
    opportunity_id: string | null;
  }[];
};
export default function ResearchWorkspace({ initial }: { initial: Dashboard }) {
  const { locale, t, research, message: translateMessage } = useScreenText();
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(body: unknown) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await r.json();
      if (!r.ok) throw Error(value.error ?? "Unable to save.");
      const refreshed = await fetch("/api/admin/research");
      if (!refreshed.ok)
        throw Error("Saved, but refresh failed. Reload this page.");
      setData(await refreshed.json());
      setMessage("Saved for review.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div lang={locale}>
      <section>
        <h2>{t("Registered sources")}</h2>
        {data.sources.length ? (
          data.sources.map((source) => (
            <article key={source.id}>
              <h3 lang="">{source.name}</h3>
              <p>{source.url}</p>
              <p>
                {source.synthetic
                  ? t("Synthetic source; live collection unavailable.")
                  : source.enabled
                    ? t("Collection enabled")
                    : t("Collection paused")}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void submit({
                    action: "policy",
                    sourceId: source.id,
                    enabled: f.get("enabled") === "on",
                    permissionNote: f.get("note"),
                  });
                }}
              >
                <label className="inline">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={source.enabled}
                    disabled={source.synthetic}
                  />
                  {t("Enable collection")}{" "}
                </label>
                <label>
                  {t("Permission and ownership review note")}{" "}
                  <input
                    name="note"
                    required
                    minLength={10}
                    maxLength={1000}
                    defaultValue={source.permission_note ?? ""}
                  />
                </label>
                <button disabled={busy || source.synthetic}>
                  {t("Save collection policy")}{" "}
                </button>
              </form>
            </article>
          ))
        ) : (
          <p>{t("Register a source in opportunity review first.")}</p>
        )}
      </section>
      <section>
        <h2>{t("Recent collection jobs")}</h2>
        {data.jobs.length ? (
          <ul>
            {data.jobs.map((j) => (
              <li key={j.id}>
                {data.sources.find((s) => s.id === j.source_id)?.name ??
                  j.source_id}
                : {research("job", j.state)}
                {t("· Attempt")} {j.attempts}
                {j.error_code
                  ? " · " + t("Diagnostic code: {code}", { code: j.error_code })
                  : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("No collection jobs yet.")}</p>
        )}
      </section>
      <section>
        <h2>{t("Captured candidates")}</h2>
        <p>
          {t(
            "Inspect source text and submit a structured extraction for validation. This manual import does not call an AI service. Model execution is a separate, explicitly configured worker action.",
          )}{" "}
        </p>
        {data.candidates.length ? (
          data.candidates.map((c) => (
            <article key={c.id}>
              <h3>
                {t("Candidate")} {c.id}
              </h3>
              <p>
                {research("candidate", c.state)}
                {c.opportunity_id
                  ? t(" · Draft {id}", { id: c.opportunity_id })
                  : ""}
              </p>
              <details>
                <summary>{t("Captured source excerpt")}</summary>
                <p lang="">{c.content}</p>
              </details>
              {c.state === "pending" ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    try {
                      const extraction = JSON.parse(
                        String(f.get("extraction")),
                      );
                      void submit({
                        action: "extract",
                        candidateId: c.id,
                        extraction,
                      });
                    } catch {
                      setMessage("Enter valid extraction JSON.");
                    }
                  }}
                >
                  <label>
                    {t("Structured extraction JSON")}{" "}
                    <textarea name="extraction" required maxLength={16000} />
                    <small>
                      {t(
                        "Keep JSON field names and enum values unchanged. Source text is evidence, not instructions.",
                      )}
                    </small>
                  </label>
                  <button disabled={busy}>
                    {t("Validate and create draft")}
                  </button>
                </form>
              ) : null}
            </article>
          ))
        ) : (
          <p>{t("No source snapshots captured yet.")}</p>
        )}
      </section>
      <p role="status">{translateMessage(message)}</p>
    </div>
  );
}
