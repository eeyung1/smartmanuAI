"use client";
import { useState } from "react";
import Link from "next/link";
import { useScreenText } from "@/src/i18n/context";
import type {
  BulkArchiveItem,
  BulkArchiveResult,
} from "@/src/catalogue/bulk-archive";
export type ArchiveChoice = {
  id: string;
  title: string;
  revision: number;
  state: string;
};
export default function BulkArchive({ items }: { items: ArchiveChoice[] }) {
  const { t, label } = useScreenText();
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [result, setResult] = useState<BulkArchiveResult | null>(null),
    [message, setMessage] = useState("");
  if (!items.length) return null;
  function outcome(item: BulkArchiveItem) {
    if (item.outcome === "archived") return t("Archived");
    if (item.outcome === "unknown")
      return t("Outcome unconfirmed; inspect history before retrying.");
    if (item.outcome === "not_attempted")
      return t("Not attempted because the batch stopped.");
    return t(
      {
        conflict: "Skipped: the revision changed.",
        not_found: "Skipped: the record was not found.",
        ineligible: "Skipped: only closed or rejected records can be archived.",
        permission_lost:
          "Skipped: administrator access is no longer available.",
      }[item.reason],
    );
  }
  return (
    <details className="notice">
      <summary>{t("Archive closed or rejected records on this page")}</summary>
      <p>
        {t(
          "Choose up to 25 records and provide one audit note. Each record commits separately; the batch can partially complete. Published and draft records cannot be archived here.",
        )}
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || blocked || !selected.length) return;
          const form = new FormData(event.currentTarget);
          if (
            !window.confirm(
              t(
                "Archive {count} selected records? Each successful archive creates a revision; this batch may partially complete.",
                { count: selected.length },
              ),
            )
          )
            return;
          setBusy(true);
          setMessage("");
          try {
            const response = await fetch(
              "/api/admin/opportunities/archive-batch",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  items: items
                    .filter((item) => selected.includes(item.id))
                    .map((item) => ({
                      id: item.id,
                      expectedRevision: item.revision,
                    })),
                  note: form.get("note"),
                }),
              },
            );
            if (!response.ok) throw new Error("Unconfirmed request");
            setResult(await response.json());
          } catch {
            setMessage(
              t(
                "Unable to confirm the batch outcome. Reload and inspect revision history before retrying.",
              ),
            );
          } finally {
            setBlocked(true);
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || blocked}>
          <legend>{t("Records to archive")}</legend>
          {items.map((item) => (
            <label className="inline" key={item.id}>
              <input
                type="checkbox"
                name="archiveRecord"
                value={item.id}
                checked={selected.includes(item.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, item.id]
                      : current.filter((id) => id !== item.id),
                  )
                }
              />
              <span lang="">{item.title}</span>
              {" · "}
              {label(item.state)}
              {" · "}
              {t("Revision {revision}", { revision: item.revision })}
            </label>
          ))}
          <label>
            {t("Shared archive audit note")}
            <textarea name="note" required minLength={5} maxLength={1000} />
          </label>
          <button disabled={!selected.length}>
            {busy ? t("Working…") : t("Archive selected records")}
          </button>
        </fieldset>
      </form>
      {message ? <p role="alert">{message}</p> : null}
      {result ? (
        <section aria-label={t("Batch archive results")}>
          <h3>{t("Batch archive results")}</h3>
          <p>
            {t("Archived records: {count}", {
              count: result.results.filter(
                (item) => item.outcome === "archived",
              ).length,
            })}
          </p>
          <ul>
            {result.results.map((item) => (
              <li key={item.id}>
                <span lang="">
                  {items.find((choice) => choice.id === item.id)?.title ??
                    item.id}
                </span>
                {": "}
                {outcome(item)}
                {" · "}
                <Link
                  href={
                    "/admin/review/" + encodeURIComponent(item.id) + "/history"
                  }
                >
                  {t("View revision history")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {blocked ? (
        <>
          <p>
            {t(
              "Reload for current states and revisions before another batch. Successful archives are not rolled back when another record is skipped.",
            )}
          </p>
          <button onClick={() => window.location.reload()}>
            {t("Reload catalogue")}
          </button>
        </>
      ) : null}
    </details>
  );
}
