"use client";
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
  function field(key: keyof Details, label: string) {
    return (
      <label key={key}>
        {label}
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
    <>
      <section>
        <h2>Add an official source</h2>
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
            Source name
            <input name="name" required minLength={3} maxLength={200} />
          </label>
          <label>
            Source URL
            <input
              name="url"
              required
              type="url"
              placeholder="https://university.example/admissions"
            />
          </label>
          <label className="inline">
            <input type="checkbox" name="synthetic" />
            This is a synthetic local test source
          </label>
          <button disabled={busy}>Register source</button>
        </form>
      </section>
      <section>
        <h2>{editing ? "Revise opportunity" : "Create a draft"}</h2>
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
            Source
            <select
              name="sourceId"
              defaultValue={editing?.source_id}
              key={editing?.id ?? "new"}
              disabled={!!editing}
              required
            >
              <option value="">Select a registered source</option>
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
            Summary
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
            Type
            <select
              value={details.category}
              onChange={(e) =>
                setDetails({
                  ...details,
                  category: e.target.value as Details["category"],
                })
              }
            >
              <option value="course">Course</option>
              <option value="event">Event</option>
              <option value="scholarship">Scholarship</option>
            </select>
          </label>
          <label>
            Mode
            <select
              value={details.mode}
              onChange={(e) =>
                setDetails({
                  ...details,
                  mode: e.target.value as Details["mode"],
                })
              }
            >
              <option value="online">Online</option>
              <option value="in_person">In person</option>
            </select>
          </label>
          {field(
            "country",
            "Country code such as CN or leave blank for online",
          )}
          <label>
            Teaching language
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
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Funding
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
                <option key={v}>{v}</option>
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
                {
                  {
                    tuitionCovered: "Tuition covered",
                    accommodationCovered: "Accommodation covered",
                    livingCostsCovered: "Living costs covered",
                    participationFree: "Participation free",
                  }[key]
                }
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
                  <option value="unknown">Not stated</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
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
            Deadline date
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
            Eligibility
            <textarea
              value={details.eligibility}
              onChange={(e) =>
                setDetails({ ...details, eligibility: e.target.value })
              }
              required
            />
          </label>
          <fieldset key={editing?.id ?? "new-rules"}>
            <legend>Structured eligibility for matching</legend>
            <p>
              Enter only requirements supported by the eligibility source
              excerpt. Blank means unknown. ALL means the source explicitly
              permits all nationalities.
            </p>
            <label>
              Scholarship study level
              <select name="studyLevel" defaultValue={details.studyLevel ?? ""}>
                <option value="">Not stated</option>
                {["bachelor", "master", "doctorate"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Allowed nationality codes, separated by commas
              <input
                name="nationalities"
                defaultValue={
                  details.eligibilityRules?.nationalities?.join(", ") ?? ""
                }
              />
            </label>
            <label>
              Minimum age
              <input
                name="minAge"
                type="number"
                min={0}
                max={120}
                defaultValue={details.eligibilityRules?.minAge ?? ""}
              />
            </label>
            <label>
              Maximum age
              <input
                name="maxAge"
                type="number"
                min={0}
                max={120}
                defaultValue={details.eligibilityRules?.maxAge ?? ""}
              />
            </label>
            <label>
              Minimum qualification
              <select
                name="minQualification"
                defaultValue={details.eligibilityRules?.minQualification ?? ""}
              >
                <option value="">Not stated</option>
                {["secondary", "bachelor", "master", "doctorate"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </fieldset>
          <fieldset>
            <legend>Supporting source excerpts</legend>
            {(["title", "funding", "deadline", "eligibility"] as const).map(
              (key) => (
                <label key={key}>
                  {key}
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
            Review note
            <input name="note" required minLength={5} maxLength={1000} />
          </label>
          <button disabled={busy || !data.sources.length}>Save draft</button>
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
              Cancel editing
            </button>
          ) : null}
        </form>
      </section>
      <section>
        <h2>Review queue</h2>
        {data.opportunities.length === 0 ? (
          <p>No draft opportunities yet.</p>
        ) : (
          data.opportunities.map((row) => (
            <article key={row.id}>
              <h3>{row.details.title}</h3>
              <p>
                {row.state} · Revision {row.revision}
              </p>
              <p>{row.details.summary}</p>
              <p>
                Funding: {row.details.funding} · Application fee:{" "}
                {row.details.applicationFee ?? "Not stated"}
              </p>
              <p>Eligibility: {row.details.eligibility}</p>
              <p>
                Study level: {row.details.studyLevel ?? "Not stated"}.
                Nationalities:{" "}
                {row.details.eligibilityRules?.nationalities?.join(", ") ??
                  "Not stated"}
                . Age:{" "}
                {row.details.eligibilityRules?.minAge ?? "Unknown minimum"} to{" "}
                {row.details.eligibilityRules?.maxAge ?? "unknown maximum"}.
                Minimum qualification:{" "}
                {row.details.eligibilityRules?.minQualification ?? "Not stated"}
                .
              </p>
              <p>Deadline: {row.details.deadline ?? "Not stated"}</p>
              <p>
                Source:{" "}
                <a
                  href={data.sources.find((s) => s.id === row.source_id)?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {data.sources.find((s) => s.id === row.source_id)?.name ??
                    "Source outside current source page"}
                </a>
              </p>
              <details>
                <summary>Field evidence</summary>
                {Object.entries(row.evidence).map(([key, value]) => (
                  <p key={key}>
                    <strong>{key}: </strong>
                    {value}
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
                Edit details
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
                  Decision
                  <select name="action">
                    <option value="publish">
                      Publish after checking source
                    </option>
                    <option value="close">Close opportunity</option>
                    <option value="reject">Reject draft</option>
                  </select>
                </label>
                <label className="inline">
                  <input type="checkbox" name="verified" />I checked the
                  official source and all field evidence
                </label>
                <label>
                  Decision reason
                  <input name="note" required minLength={5} maxLength={1000} />
                </label>
                <button disabled={busy}>Record decision</button>
              </form>
            </article>
          ))
        )}
      </section>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </>
  );
}
