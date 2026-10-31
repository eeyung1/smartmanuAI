"use client";
import { useScreenText } from "@/src/i18n/context";
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
  const {
    locale,
    t,
    label,
    reason: explain,
    message: translateMessage,
  } = useScreenText();
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
    <div lang={locale}>
      <section className="form">
        <h2>{t("Your preferences")}</h2>
        <p>
          {t(
            "Interface, alert and teaching languages are independent. Source wording remains unchanged. Age and qualification are optional; unknown eligibility still needs checking.",
          )}{" "}
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
                ? t("Interface language")
                : t("Alert language")}
              <select name={name} defaultValue={p[name]}>
                <option value="en">{t("English")}</option>
                <option value="zh-Hans">{t("Simplified Chinese")}</option>
              </select>
            </label>
          ))}
          <label>
            {t("Nationality (two-letter country code)")}{" "}
            <input
              name="nationality"
              defaultValue={p.nationality ?? ""}
              maxLength={2}
              placeholder="NG"
            />
          </label>
          <label>
            {t("Age (optional)")}{" "}
            <input
              name="age"
              type="number"
              min={0}
              max={120}
              defaultValue={p.age ?? ""}
            />
          </label>
          <label>
            {t("Highest qualification")}{" "}
            <select name="qualification" defaultValue={p.qualification ?? ""}>
              <option value="">{t("Not supplied")}</option>
              {["secondary", "bachelor", "master", "doctorate", "other"].map(
                (v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            {t("Topics, separated by commas")}{" "}
            <input
              name="topics"
              defaultValue={p.topics.join(", ")}
              placeholder={t("smart manufacturing, digital twins")}
              maxLength={700}
            />
          </label>
          <label>
            {t("Preferred in-person country codes, separated by commas")}{" "}
            <input
              name="countries"
              defaultValue={p.countries.join(", ")}
              placeholder="CN"
              maxLength={100}
            />
          </label>
          {groups.map((g) => (
            <fieldset key={g.name}>
              <legend>{t(g.label)}</legend>
              {g.values.map((value) => (
                <label className="inline" key={value}>
                  <input
                    type="checkbox"
                    name={g.name}
                    value={value}
                    defaultChecked={(p[g.name] as string[]).includes(value)}
                  />
                  {label(value)}
                </label>
              ))}
            </fieldset>
          ))}
          <button disabled={busy}>
            {t("Save preferences and refresh matches")}
          </button>
        </form>
      </section>
      <section>
        <h2>{t("Your matches")}</h2>
        {matches.profileRequired ? (
          <p>{t("Save your preferences to see matches.")}</p>
        ) : (
          <p>
            {matches.total} {t("matches · Profile version")}{" "}
            {matches.profileVersion} {t("· Rules")} {matches.rulesVersion}
          </p>
        )}
        {matches.truncated ? (
          <p>
            {t(
              "Matching is limited to the latest 1,000 reviewed records. Broader catalogue coverage is pending.",
            )}{" "}
          </p>
        ) : null}
        {!matches.profileRequired && !matches.items.length ? (
          <p>
            {t(
              "No current matches. Review your preferences or explore the catalogue.",
            )}{" "}
          </p>
        ) : null}
        <div className="catalogue">
          {matches.items.map((item) => (
            <article key={item.id}>
              <h3>
                <Link href={"/opportunities/" + encodeURIComponent(item.id)}>
                  <span lang="">{item.details.title}</span>
                </Link>
              </h3>
              {item.synthetic ? <p>{t("Synthetic fixture")}</p> : null}
              <p lang="">{item.details.summary}</p>
              <p>
                {t("Needs checking · Relevance score")} {item.score}{" "}
                {t("· Record revision")} {item.revision}
              </p>
              <ul>
                {item.reasons.map((reason) => (
                  <li key={reason}>{explain(reason)}</li>
                ))}
              </ul>
              <details>
                <summary>{t("Eligibility and information to check")}</summary>
                <ul>
                  {item.unknowns.map((reason) => (
                    <li key={reason}>{explain(reason)}</li>
                  ))}
                </ul>
                <p lang="">{item.details.eligibility}</p>
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
                {t("Save")}{" "}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => track(item.id, item.trackerVersion, "dismiss")}
              >
                {t("Dismiss")}{" "}
              </button>
            </article>
          ))}
        </div>
        <nav aria-label={t("Match pages")} className="pagination">
          {matches.page > 1 ? (
            <button
              disabled={busy}
              onClick={() => void perform(() => reload(matches.page - 1))}
            >
              {t("Previous")}{" "}
            </button>
          ) : null}
          {matches.page * matches.pageSize < matches.total ? (
            <button
              disabled={busy}
              onClick={() => void perform(() => reload(matches.page + 1))}
            >
              {t("Next")}{" "}
            </button>
          ) : null}
        </nav>
      </section>
      <section>
        <h2>{t("Saved and dismissed opportunities")}</h2>
        <p>
          {t(
            "Application status is self-reported. Closed or unavailable records remain in your tracker.",
          )}{" "}
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
                    {item.title ?? t("Opportunity")}
                  </Link>
                ) : (
                  (item.title ?? t("Unavailable opportunity"))
                )}
              </h3>
              <p>
                {item.state ? label(item.state) : t("Unavailable")}
                {item.dismissed
                  ? item.materialChanged
                    ? t(
                        " · Material change since dismissal; may appear in matches again.",
                      )
                    : t(" · Dismissed")
                  : ""}
              </p>
              {item.saved ? (
                <>
                  <label>
                    {t("Application status")}{" "}
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
                        <option key={v} value={v}>
                          {label(v)}
                        </option>
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
                    {t("Remove from saved")}{" "}
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
                  {t("Restore to matches")}{" "}
                </button>
              ) : item.available ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    track(item.opportunity_id, item.version, "dismiss")
                  }
                >
                  {t("Dismiss from matches")}{" "}
                </button>
              ) : null}
            </article>
          ))
        ) : (
          <p>{t("No saved or dismissed opportunities yet.")}</p>
        )}
        <Link href="/opportunities">{t("Explore all opportunities")}</Link>
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
        {t("Sign out")}{" "}
      </button>
      <p role="status" aria-live="polite">
        {translateMessage(notice)}
      </p>
    </div>
  );
}
