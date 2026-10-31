"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Preferences } from "@/src/domain/profile";
import type { listTracker } from "@/src/domain/tracker";
import type { matchesForUser } from "@/src/domain/matching";
type Matches = Awaited<ReturnType<typeof matchesForUser>>;
const defaults: Preferences = {
  interfaceLanguage: "en",
  alertLanguage: "en",
  teachingLanguages: ["en"],
  nationality: null,
  age: null,
  qualification: null,
  targetLevels: [],
  topics: [],
  categories: ["scholarship", "course", "event"],
  funding: ["fully_funded", "tuition_only", "free_participation"],
  modes: ["online", "in_person"],
  countries: [],
};
export default function Workspace({
  profile,
  initialTracker,
  initialMatches,
}: {
  profile: Preferences | null;
  initialTracker: Awaited<ReturnType<typeof listTracker>>;
  initialMatches: Matches;
}) {
  const router = useRouter();
  const [matches, setMatches] = useState(initialMatches),
    [tracker, setTracker] = useState(initialTracker),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const p = profile ?? defaults;
  async function reload(page = matches.page) {
    const [m, t] = await Promise.all([
      fetch("/api/me/matches?page=" + page),
      fetch("/api/me/tracker"),
    ]);
    if (!m.ok || !t.ok)
      throw Error("Unable to refresh. Please reload the page.");
    setMatches(await m.json());
    setTracker(await t.json());
  }
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice((e as Error).message || "Connection failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function request(path: string, method: string, body: unknown) {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok)
      throw Error(value.error ?? "Unable to save. Please retry.");
    return value;
  }
  function track(
    opportunityId: string,
    expectedVersion: number,
    action: string,
    status?: string,
  ) {
    void perform(async () => {
      await request("/api/me/tracker", "PATCH", {
        opportunityId,
        expectedVersion,
        action,
        ...(status ? { status } : {}),
      });
      await reload();
      setNotice("Tracker updated. Applied is your own reported status.");
    });
  }
  const groups = [
    {
      name: "teachingLanguages",
      label: "Acceptable teaching languages (none means no preference)",
      values: ["en", "zh"],
    },
    {
      name: "categories",
      label: "Opportunity types",
      values: ["scholarship", "course", "event"],
    },
    {
      name: "funding",
      label: "Funding preferences",
      values: ["fully_funded", "tuition_only", "free_participation"],
    },
    {
      name: "modes",
      label: "Participation modes",
      values: ["online", "in_person"],
    },
    {
      name: "targetLevels",
      label: "Target scholarship levels (optional)",
      values: ["bachelor", "master", "doctorate"],
    },
  ] as const;
  return (
    <>
      <section className="form">
        <h2>Your preferences</h2>
        <p>
          Interface and alert language choices are stored separately. This
          prototype translates navigation, sign-in and alert templates into
          English or Simplified Chinese. Other screens and source wording remain
          in their original language. Age and qualification are optional;
          unknowns remain needs checking.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void perform(async () => {
              await request("/api/me/profile", "PATCH", {
                interfaceLanguage: f.get("interfaceLanguage"),
                alertLanguage: f.get("alertLanguage"),
                nationality:
                  String(f.get("nationality") ?? "")
                    .trim()
                    .toUpperCase() || null,
                age: f.get("age") ? Number(f.get("age")) : null,
                qualification: f.get("qualification") || null,
                topics: String(f.get("topics") ?? "")
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
                countries: String(f.get("countries") ?? "")
                  .split(",")
                  .map((v) => v.trim().toUpperCase())
                  .filter(Boolean),
                ...Object.fromEntries(
                  groups.map((g) => [g.name, f.getAll(g.name)]),
                ),
              });
              await reload(1);
              router.refresh();
              setNotice("Preferences saved and matches refreshed.");
            });
          }}
        >
          {(["interfaceLanguage", "alertLanguage"] as const).map((name) => (
            <label key={name}>
              {name === "interfaceLanguage"
                ? "Interface language"
                : "Alert language"}
              <select name={name} defaultValue={p[name]}>
                <option value="en">English</option>
                <option value="zh-Hans">Simplified Chinese</option>
              </select>
            </label>
          ))}
          <label>
            Nationality (two-letter country code)
            <input
              name="nationality"
              defaultValue={p.nationality ?? ""}
              maxLength={2}
              placeholder="NG"
            />
          </label>
          <label>
            Age (optional)
            <input
              name="age"
              type="number"
              min={0}
              max={120}
              defaultValue={p.age ?? ""}
            />
          </label>
          <label>
            Highest qualification
            <select name="qualification" defaultValue={p.qualification ?? ""}>
              <option value="">Not supplied</option>
              {["secondary", "bachelor", "master", "doctorate", "other"].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Topics, separated by commas
            <input
              name="topics"
              defaultValue={p.topics.join(", ")}
              placeholder="smart manufacturing, digital twins"
              maxLength={700}
            />
          </label>
          <label>
            Preferred in-person country codes, separated by commas
            <input
              name="countries"
              defaultValue={p.countries.join(", ")}
              placeholder="CN"
              maxLength={100}
            />
          </label>
          {groups.map((g) => (
            <fieldset key={g.name}>
              <legend>{g.label}</legend>
              {g.values.map((value) => (
                <label className="inline" key={value}>
                  <input
                    type="checkbox"
                    name={g.name}
                    value={value}
                    defaultChecked={(p[g.name] as string[]).includes(value)}
                  />
                  {value.replaceAll("_", " ")}
                </label>
              ))}
            </fieldset>
          ))}
          <button disabled={busy}>Save preferences and refresh matches</button>
        </form>
      </section>
      <section>
        <h2>Your matches</h2>
        {matches.profileRequired ? (
          <p>Save your preferences to see matches.</p>
        ) : (
          <p>
            {matches.total} matches · Profile version {matches.profileVersion} ·
            Rules {matches.rulesVersion}
          </p>
        )}
        {matches.truncated ? (
          <p>
            Matching is limited to the latest 1,000 reviewed records. Broader
            catalogue coverage is pending.
          </p>
        ) : null}
        {!matches.profileRequired && !matches.items.length ? (
          <p>
            No current matches. Review your preferences or explore the
            catalogue.
          </p>
        ) : null}
        <div className="catalogue">
          {matches.items.map((item) => (
            <article key={item.id}>
              <h3>
                <Link href={"/opportunities/" + encodeURIComponent(item.id)}>
                  {item.details.title}
                </Link>
              </h3>
              {item.synthetic ? <p>Synthetic fixture</p> : null}
              <p>{item.details.summary}</p>
              <p>
                Needs checking · Relevance score {item.score} · Record revision{" "}
                {item.revision}
              </p>
              <ul>
                {item.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <details>
                <summary>Eligibility and information to check</summary>
                <ul>
                  {item.unknowns.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <p>{item.details.eligibility}</p>
              </details>
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await request("/api/me/saved", "POST", {
                      opportunityId: item.id,
                    });
                    await reload();
                    setNotice("Opportunity saved.");
                  })
                }
              >
                Save
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => track(item.id, item.trackerVersion, "dismiss")}
              >
                Dismiss
              </button>
            </article>
          ))}
        </div>
        <nav aria-label="Match pages" className="pagination">
          {matches.page > 1 ? (
            <button
              disabled={busy}
              onClick={() => void perform(() => reload(matches.page - 1))}
            >
              Previous
            </button>
          ) : null}
          {matches.page * matches.pageSize < matches.total ? (
            <button
              disabled={busy}
              onClick={() => void perform(() => reload(matches.page + 1))}
            >
              Next
            </button>
          ) : null}
        </nav>
      </section>
      <section>
        <h2>Saved and dismissed opportunities</h2>
        <p>
          Application status is self-reported. Closed or unavailable records
          remain in your tracker.
        </p>
        {tracker.length ? (
          tracker.map((item) => (
            <article key={item.opportunity_id}>
              <h3>
                {item.available ? (
                  <Link
                    href={
                      "/opportunities/" +
                      encodeURIComponent(item.opportunity_id)
                    }
                  >
                    {item.title ?? "Opportunity"}
                  </Link>
                ) : (
                  (item.title ?? "Unavailable opportunity")
                )}
              </h3>
              <p>
                {item.state ?? "Unavailable"}
                {item.dismissed
                  ? item.materialChanged
                    ? " · Material change since dismissal; may appear in matches again."
                    : " · Dismissed"
                  : ""}
              </p>
              {item.saved ? (
                <>
                  <label>
                    Application status
                    <select
                      value={item.status}
                      disabled={busy}
                      onChange={(e) =>
                        track(
                          item.opportunity_id,
                          item.version,
                          "status",
                          e.target.value,
                        )
                      }
                    >
                      {["interested", "applying", "applied"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      track(item.opportunity_id, item.version, "remove")
                    }
                  >
                    Remove from saved
                  </button>
                </>
              ) : null}
              {item.dismissed ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    track(item.opportunity_id, item.version, "restore")
                  }
                >
                  Restore to matches
                </button>
              ) : item.available ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    track(item.opportunity_id, item.version, "dismiss")
                  }
                >
                  Dismiss from matches
                </button>
              ) : null}
            </article>
          ))
        ) : (
          <p>No saved or dismissed opportunities yet.</p>
        )}
        <Link href="/opportunities">Explore all opportunities</Link>
      </section>
      <button
        disabled={busy}
        onClick={() =>
          void perform(async () => {
            await request("/api/auth/sign-out", "POST", {});
            window.location.assign("/sign-in");
          })
        }
      >
        Sign out
      </button>
      <p role="status" aria-live="polite">
        {notice}
      </p>
    </>
  );
}
