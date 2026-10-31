import { createHash } from "node:crypto";
import type { SQL } from "../db";
import { detailsSchema, type Details } from "../catalogue/schema";
import { preferencesSchema, type Preferences } from "./profile";
export const MATCH_RULES_VERSION = "1";
const groups = [
  ["smart manufacturing", "intelligent manufacturing", "智能制造", "智慧制造"],
  ["industrial automation", "automation", "工业自动化"],
  ["digital twin", "digital twins", "数字孪生"],
  ["robotics", "机器人"],
  ["industrial ai", "工业人工智能"],
  ["industrial iot", "industrial internet of things", "工业物联网"],
];
export function topicKey(value: string) {
  const key = value.trim().toLowerCase().replace(/\s+/g, " ");
  return groups.find((g) => g.includes(key))?.[0] ?? key;
}
export function materialFingerprint(details: Details) {
  const { title, summary, ...facts } = details;
  void title;
  void summary;
  return createHash("sha256")
    .update(
      JSON.stringify({
        ...facts,
        topics: [...new Set(details.topics.map(topicKey))].sort(),
        eligibilityRules: details.eligibilityRules
          ? {
              ...details.eligibilityRules,
              nationalities: details.eligibilityRules.nationalities
                ? [...new Set(details.eligibilityRules.nationalities)].sort()
                : null,
            }
          : null,
      }),
    )
    .digest("hex");
}
export function evaluateMatch(profile: Preferences, details: Details) {
  const reasons: string[] = [],
    unknowns: string[] = [],
    failures: string[] = [];
  let score = 0;
  function preference(pass: boolean, reason: string, points: number) {
    if (pass) {
      reasons.push(reason);
      score += points;
    } else failures.push(reason.replace(/^Matches /, "Outside "));
  }
  preference(
    profile.categories.includes(details.category),
    "Matches your opportunity types.",
    10,
  );
  preference(
    profile.funding.includes(details.funding as Preferences["funding"][number]),
    "Matches your funding preferences.",
    10,
  );
  preference(
    profile.modes.includes(details.mode),
    "Matches your participation modes.",
    5,
  );
  if (profile.teachingLanguages.length) {
    if (details.teachingLanguage === "unknown")
      unknowns.push("Teaching language is not stated.");
    else
      preference(
        profile.teachingLanguages.includes(
          details.teachingLanguage as "en" | "zh",
        ),
        "Matches your teaching languages.",
        10,
      );
  }
  if (profile.countries.length && details.mode === "in_person") {
    if (!details.country) unknowns.push("Location is not stated.");
    else
      preference(
        profile.countries.includes(details.country),
        "Matches your preferred countries.",
        5,
      );
  }
  if (profile.topics.length) {
    const wanted = new Set(profile.topics.map(topicKey));
    const overlap = details.topics.map(topicKey).filter((t) => wanted.has(t));
    if (overlap.length) {
      score += 20;
      reasons.push("Topic overlap: " + [...new Set(overlap)].join(", ") + ".");
    } else failures.push("No overlap with your selected topics.");
  }
  if (details.category === "scholarship" && profile.targetLevels.length) {
    if (!details.studyLevel)
      unknowns.push("Scholarship study level is not stated.");
    else
      preference(
        profile.targetLevels.includes(details.studyLevel),
        "Matches your target study levels.",
        10,
      );
  }
  const rules = details.eligibilityRules;
  if (!rules)
    unknowns.push(
      "Structured nationality, age and qualification requirements are unavailable.",
    );
  else {
    if (!rules.nationalities)
      unknowns.push("Nationality requirements are not stated.");
    else if (!rules.nationalities.includes("ALL")) {
      if (!profile.nationality)
        unknowns.push("Add your nationality to check this restriction.");
      else if (!rules.nationalities.includes(profile.nationality))
        failures.push(
          "Your nationality does not meet the recorded restriction.",
        );
      else reasons.push("Nationality meets the recorded restriction.");
    }
    if (rules.minAge !== null || rules.maxAge !== null) {
      if (profile.age === null)
        unknowns.push("Add your age to check the recorded age limits.");
      else if (
        (rules.minAge !== null && profile.age < rules.minAge) ||
        (rules.maxAge !== null && profile.age > rules.maxAge)
      )
        failures.push("Your age is outside the recorded limits.");
      else reasons.push("Age meets the recorded limits.");
    } else unknowns.push("Age requirements are not stated.");
    if (rules.minQualification) {
      const levels = ["secondary", "bachelor", "master", "doctorate"];
      if (profile.qualification === null || profile.qualification === "other")
        unknowns.push(
          "Your qualification needs checking against the source requirement.",
        );
      else if (
        levels.indexOf(profile.qualification) <
        levels.indexOf(rules.minQualification)
      )
        failures.push("Your qualification is below the recorded minimum.");
      else reasons.push("Qualification meets the recorded minimum.");
    } else unknowns.push("Minimum qualification is not stated.");
  }
  unknowns.push(
    "Check the official eligibility text for additional requirements, including language tests.",
  );
  return {
    included: failures.length === 0,
    score,
    reasons,
    unknowns,
    failures,
    eligibility: "needs_checking" as const,
  };
}
export async function matchesForUser(sql: SQL, userId: string, page = 1) {
  const stored = (
    await sql.query(
      "SELECT preferences,version FROM profiles WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  if (!stored)
    return {
      profileRequired: true,
      profileVersion: 0,
      rulesVersion: MATCH_RULES_VERSION,
      items: [],
      total: 0,
      page,
      pageSize: 12,
      truncated: false,
    };
  const profile = preferencesSchema.parse(stored.preferences);
  const rows = (
    await sql.query(
      "SELECT o.id,o.revision,o.details,o.verified_at,s.synthetic,t.version AS tracker_version,t.dismissed_fingerprint FROM opportunities o JOIN sources s ON s.id=o.source_id LEFT JOIN saved_items t ON t.opportunity_id=o.id AND t.user_id=$1 WHERE o.state='published' AND o.verified_at>=NOW()-INTERVAL '7 days' AND (o.details->>'deadline' IS NULL OR o.details->>'deadline'>TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD')) AND o.details->>'funding' IN ('fully_funded','tuition_only','free_participation') ORDER BY o.verified_at DESC,o.id LIMIT 1001",
      [userId],
    )
  ).rows;
  const ranked = rows
    .slice(0, 1000)
    .flatMap((row) => {
      const details = detailsSchema.parse(row.details);
      if (row.dismissed_fingerprint === materialFingerprint(details)) return [];
      const match = evaluateMatch(profile, details);
      return match.included
        ? [
            {
              id: String(row.id),
              revision: Number(row.revision),
              details,
              synthetic: row.synthetic === true,
              trackerVersion: Number(row.tracker_version ?? 0),
              ...match,
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.details.deadline ?? "9999").localeCompare(
          b.details.deadline ?? "9999",
        ) ||
        a.id.localeCompare(b.id),
    );
  return {
    profileRequired: false,
    profileVersion: Number(stored.version),
    rulesVersion: MATCH_RULES_VERSION,
    items: ranked.slice((page - 1) * 12, page * 12),
    total: ranked.length,
    page,
    pageSize: 12,
    truncated: rows.length > 1000,
  };
}
