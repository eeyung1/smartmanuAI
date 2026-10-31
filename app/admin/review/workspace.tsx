"use client";
import { useScreenText } from "@/src/i18n/context";
import { useState } from "react";
import type { Details } from "@/src/catalogue/schema";
type Row = {
  id: string;
  revision: number;
  state: string;
  source_id: string;
  details: Details;
  evidence: {
    title: string;
    funding: string;
    deadline: string;
    eligibility: string;
  };
};
type Source = { id: string; name: string; url: string; synthetic: boolean };
const initialDetails: Details = {
  studyLevel: null,
  eligibilityRules: null,
  title: "",
  organizer: "",
  summary: "",
  category: "course",
  mode: "online",
  country: null,
  teachingLanguage: "unknown",
  topics: ["smart manufacturing"],
  funding: "unclear",
  tuitionCovered: null,
  accommodationCovered: null,
  livingCostsCovered: null,
  participationFree: null,
  applicationFee: null,
  certificateFee: null,
  travelCosts: null,
  coverageDuration: null,
  deadline: null,
  deadlineText: null,
  eligibility: "",
};
export default function ReviewWorkspace({
  initial,
}: {
  initial: { sources: Source[]; opportunities: Row[] };
}) {
  const { locale, t, label, message: translateMessage } = useScreenText();
  const [data, setData] = useState(initial),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Row | null>(null),
    [details, setDetails] = useState<Details>(initialDetails),
    [evidence, setEvidence] = useState({
      title: "",
      funding: "",
      deadline: "",
      eligibility: "",
    });
  async function request(path: string, body: unknown) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await r.json();
    if (!r.ok) throw new Error(value.error ?? "Request failed.");
    return value;
  }
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      const r = await fetch("/api/admin/opportunities");
      if (!r.ok) throw new Error("Could not refresh the review queue.");
      setData(await r.json());
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function field(key: keyof Details, caption: string) {
    return (
      <label key={key}>
        {t(caption)}
        <input
          value={String(details[key] ?? "")}
          onChange={(e) =>
            setDetails({ ...details, [key]: e.target.value || null })
          }
        />
      </label>
    );
  }
  return (
    <div lang={locale}>
      <section>
        <h2>{t("Add an official source")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            void perform(async () => {
              await request("/api/admin/sources", {
                name: f.get("name"),
                url: f.get("url"),
                synthetic: f.get("synthetic") === "on",
              });
              form.reset();
              setMessage("Source registered.");
            });
          }}
        >
          <label>
            {t("Source name")}{" "}
            <input name="name" required minLength={3} maxLength={200} />
          </label>
          <label>
            {t("Source URL")}{" "}
            <input
              name="url"
              required
              type="url"
              placeholder="https://university.example/admissions"
            />
          </label>
          <label className="inline">
            <input type="checkbox" name="synthetic" />
            {t("This is a synthetic local test source")}{" "}
          </label>
          <button disabled={busy}>{t("Register source")}</button>
        </form>
      </section>
      <section>
        <h2>{editing ? t("Revise opportunity") : t("Create a draft")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const draftForm = e.currentTarget;
            const countries = String(f.get("nationalities") ?? "")
              .split(",")
              .map((v) => v.trim().toUpperCase())
              .filter(Boolean);
            const minAge = String(f.get("minAge") ?? ""),
              maxAge = String(f.get("maxAge") ?? ""),
              minQualification = String(f.get("minQualification") ?? "");
            const submittedDetails = {
              ...details,
              studyLevel: f.get("studyLevel") || null,
              eligibilityRules:
                countries.length || minAge || maxAge || minQualification
                  ? {
                      nationalities: countries.length ? countries : null,
                      minAge: minAge ? Number(minAge) : null,
                      maxAge: maxAge ? Number(maxAge) : null,
                      minQualification: minQualification || null,
                    }
                  : null,
            };

            void perform(async () => {
              if (editing)
                await request(
                  "/api/admin/opportunities/" + editing.id + "/review",
                  {
                    action: "revise",
                    expectedRevision: editing.revision,
                    details: submittedDetails,
                    evidence,
                    note: f.get("note"),
                  },
                );
              else
                await request("/api/admin/opportunities", {
                  sourceId: f.get("sourceId"),
                  details: submittedDetails,
                  evidence,
                  note: f.get("note"),
                });
              draftForm.reset();
              setEditing(null);
              setDetails(initialDetails);
              setEvidence({
                title: "",
                funding: "",
                deadline: "",
                eligibility: "",
              });
              setMessage("Draft saved for review.");
            });
          }}
        >
          <label>
            {t("Source")}{" "}
            <select
              name="sourceId"
              defaultValue={editing?.source_id}
              key={editing?.id ?? "new"}
              disabled={!!editing}
              required
            >
              <option value="">{t("Select a registered source")}</option>
              {data.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {field("title", "Title")}
          {field("organizer", "Organizer")}
          <label>
            {t("Summary")}{" "}
            <textarea
              value={details.summary}
              onChange={(e) =>
                setDetails({ ...details, summary: e.target.value })
              }
              required
              minLength={10}
            />
          </label>
          <label>
            {t("Type")}{" "}
            <select
              value={details.category}
              onChange={(e) =>
                setDetails({
                  ...details,
                  category: e.target.value as Details["category"],
                })
              }
            >
              <option value="course">{t("Course")}</option>
              <option value="event">{t("Event")}</option>
              <option value="scholarship">{t("Scholarship")}</option>
            </select>
          </label>
          <label>
            {t("Mode")}{" "}
            <select
              value={details.mode}
              onChange={(e) =>
                setDetails({
                  ...details,
                  mode: e.target.value as Details["mode"],
                })
              }
            >
              <option value="online">{t("Online")}</option>
              <option value="in_person">{t("In person")}</option>
            </select>
          </label>
          {field(
            "country",
            "Country code such as CN or leave blank for online",
          )}
          <label>
            {t("Teaching language")}{" "}
            <select
              value={details.teachingLanguage}
              onChange={(e) =>
                setDetails({
                  ...details,
                  teachingLanguage: e.target
                    .value as Details["teachingLanguage"],
                })
              }
            >
              {["unknown", "en", "zh", "other"].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Funding")}{" "}
            <select
              value={details.funding}
              onChange={(e) =>
                setDetails({
                  ...details,
                  funding: e.target.value as Details["funding"],
                })
              }
            >
              {[
                "unclear",
                "free_participation",
                "tuition_only",
                "fully_funded",
                "partial",
              ].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
          <div className="coverage">
            {(
              [
                "tuitionCovered",
                "accommodationCovered",
                "livingCostsCovered",
                "participationFree",
              ] as const
            ).map((key) => (
              <label key={key}>
                {t(
                  {
                    tuitionCovered: "Tuition covered",
                    accommodationCovered: "Accommodation covered",
                    livingCostsCovered: "Living costs covered",
                    participationFree: "Participation free",
                  }[key],
                )}
                <select
                  value={
                    details[key] === null ? "unknown" : String(details[key])
                  }
                  onChange={(e) =>
                    setDetails({
                      ...details,
                      [key]:
                        e.target.value === "unknown"
                          ? null
                          : e.target.value === "true",
                    })
                  }
                >
                  <option value="unknown">{t("Not stated")}</option>
                  <option value="true">{t("Yes")}</option>
                  <option value="false">{t("No")}</option>
                </select>
              </label>
            ))}
          </div>
          {field(
            "applicationFee",
            "Application fee and currency or leave blank if unknown",
          )}
          {field("certificateFee", "Certificate fee or leave blank if unknown")}
          {field("travelCosts", "Travel costs or leave blank if unknown")}
          {field("coverageDuration", "Funding duration and renewal conditions")}
          <label>
            {t("Deadline date")}{" "}
            <input
              type="date"
              value={details.deadline ?? ""}
              onChange={(e) =>
                setDetails({ ...details, deadline: e.target.value || null })
              }
            />
          </label>
          {field("deadlineText", "Deadline wording copied from source")}
          <label>
            {t("Eligibility")}{" "}
            <textarea
              value={details.eligibility}
              onChange={(e) =>
                setDetails({ ...details, eligibility: e.target.value })
              }
              required
            />
          </label>
          <fieldset key={editing?.id ?? "new-rules"}>
            <legend>{t("Structured eligibility for matching")}</legend>
            <p>
              {t(
                "Enter only requirements supported by the eligibility source excerpt. Blank means unknown. ALL means the source explicitly permits all nationalities.",
              )}{" "}
            </p>
            <label>
              {t("Scholarship study level")}{" "}
              <select name="studyLevel" defaultValue={details.studyLevel ?? ""}>
                <option value="">{t("Not stated")}</option>
                {["bachelor", "master", "doctorate"].map((v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Allowed nationality codes, separated by commas")}{" "}
              <input
                name="nationalities"
                defaultValue={
                  details.eligibilityRules?.nationalities?.join(", ") ?? ""
                }
              />
            </label>
            <label>
              {t("Minimum age")}{" "}
              <input
                name="minAge"
                type="number"
                min={0}
                max={120}
                defaultValue={details.eligibilityRules?.minAge ?? ""}
              />
            </label>
            <label>
              {t("Maximum age")}{" "}
              <input
                name="maxAge"
                type="number"
                min={0}
                max={120}
                defaultValue={details.eligibilityRules?.maxAge ?? ""}
              />
            </label>
            <label>
              {t("Minimum qualification")}{" "}
              <select
                name="minQualification"
                defaultValue={details.eligibilityRules?.minQualification ?? ""}
              >
                <option value="">{t("Not stated")}</option>
                {["secondary", "bachelor", "master", "doctorate"].map((v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <fieldset>
            <legend>{t("Supporting source excerpts")}</legend>
            {(["title", "funding", "deadline", "eligibility"] as const).map(
              (key) => (
                <label key={key}>
                  {label(key)}
                  <textarea
                    value={evidence[key]}
                    required
                    minLength={3}
                    maxLength={3000}
                    onChange={(e) =>
                      setEvidence({ ...evidence, [key]: e.target.value })
                    }
                  />
                </label>
              ),
            )}
          </fieldset>
          <label>
            {t("Review note")}{" "}
            <input name="note" required minLength={5} maxLength={1000} />
          </label>
          <button disabled={busy || !data.sources.length}>
            {t("Save draft")}
          </button>
          {editing ? (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditing(null);
                setDetails(initialDetails);
                setEvidence({
                  title: "",
                  funding: "",
                  deadline: "",
                  eligibility: "",
                });
              }}
            >
              {t("Cancel editing")}{" "}
            </button>
          ) : null}
        </form>
      </section>
      <section>
        <h2>{t("Review queue")}</h2>
        {data.opportunities.length === 0 ? (
          <p>{t("No draft opportunities yet.")}</p>
        ) : (
          data.opportunities.map((row) => (
            <article key={row.id}>
              <h3 lang="">{row.details.title}</h3>
              <p>
                {label(row.state)} {t("· Revision")} {row.revision}
              </p>
              <p lang="">{row.details.summary}</p>
              <p>
                {t("Funding:")} {label(row.details.funding)}{" "}
                {t("· Application fee:")}{" "}
                {row.details.applicationFee ?? t("Not stated")}
              </p>
              <p>
                {t("Eligibility:")}{" "}
                <span lang="">{row.details.eligibility}</span>
              </p>
              <p>
                {t("Study level:")}{" "}
                {row.details.studyLevel
                  ? label(row.details.studyLevel)
                  : t("Not stated")}
                {t(". Nationalities:")}{" "}
                {row.details.eligibilityRules?.nationalities?.join(", ") ??
                  t("Not stated")}
                {t(". Age:")}{" "}
                {row.details.eligibilityRules?.minAge ?? t("Unknown minimum")}{" "}
                {t("to")}{" "}
                {row.details.eligibilityRules?.maxAge ?? t("unknown maximum")}
                {t(". Minimum qualification:")}{" "}
                {row.details.eligibilityRules?.minQualification
                  ? label(row.details.eligibilityRules.minQualification)
                  : t("Not stated")}
                .
              </p>
              <p>
                {t("Deadline:")} {row.details.deadline ?? t("Not stated")}
              </p>
              <p>
                {t("Source:")}{" "}
                <a
                  href={data.sources.find((s) => s.id === row.source_id)?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {data.sources.find((s) => s.id === row.source_id)?.name ??
                    t("Source outside current source page")}
                </a>
              </p>
              <details>
                <summary>{t("Field evidence")}</summary>
                {Object.entries(row.evidence).map(([key, value]) => (
                  <p key={key}>
                    <strong>{label(key)}: </strong>
                    <span lang="">{value}</span>
                  </p>
                ))}
              </details>
              <button
                className="secondary"
                onClick={() => {
                  setEditing(row);
                  setDetails(row.details);
                  setEvidence(row.evidence);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {t("Edit details")}{" "}
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void perform(async () => {
                    await request(
                      "/api/admin/opportunities/" + row.id + "/review",
                      {
                        expectedRevision: row.revision,
                        action: f.get("action"),
                        note: f.get("note"),
                        verified: f.get("verified") === "on",
                      },
                    );
                    setMessage("Review recorded.");
                  });
                }}
              >
                <label>
                  {t("Decision")}{" "}
                  <select name="action">
                    <option value="publish">
                      {t("Publish after checking source")}{" "}
                    </option>
                    <option value="close">{t("Close opportunity")}</option>
                    <option value="reject">{t("Reject draft")}</option>
                  </select>
                </label>
                <label className="inline">
                  <input type="checkbox" name="verified" />
                  {t(
                    "I checked the official source and all field evidence",
                  )}{" "}
                </label>
                <label>
                  {t("Decision reason")}{" "}
                  <input name="note" required minLength={5} maxLength={1000} />
                </label>
                <button disabled={busy}>{t("Record decision")}</button>
              </form>
            </article>
          ))
        )}
      </section>
      <p role="status" aria-live="polite">
        {translateMessage(message)}
      </p>
    </div>
  );
}
