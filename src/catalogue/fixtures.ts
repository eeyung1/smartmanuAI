import type { SQL } from "../db";
import { createSource, createDraft, reviewOpportunity } from "./service";
export const fixtureDetails = {
  title: "Smart Manufacturing Basics",
  organizer: "Synthetic training provider",
  summary:
    "A synthetic course about connected factories, industrial automation and digital twins for local testing.",
  category: "course",
  mode: "online",
  country: null,
  teachingLanguage: "en",
  topics: ["smart manufacturing"],
  funding: "free_participation",
  tuitionCovered: null,
  accommodationCovered: null,
  livingCostsCovered: null,
  participationFree: true,
  applicationFee: null,
  certificateFee: null,
  travelCosts: null,
  coverageDuration: null,
  deadline: null,
  deadlineText: null,
  eligibility: "Synthetic fixture only. Not a real enrollment opportunity.",
} as const;
export const fixtureEvidence = {
  title: "Synthetic source names Smart Manufacturing Basics.",
  funding:
    "Synthetic source says participation is free; certificate fee not stated.",
  deadline: "The synthetic source does not state a deadline.",
  eligibility: "The fixture is for local testing only.",
};
export async function seedLocalCatalogue(sql: SQL) {
  if (
    (
      await sql.query(
        "SELECT id FROM opportunities WHERE id='synthetic-course'",
      )
    ).rows.length
  )
    return;
  const reviewer = "local-fixture-reviewer";
  await sql.query(
    "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,'Local fixture reviewer','reviewer@example.test',NOW(),NOW()) ON CONFLICT(id) DO NOTHING",
    [reviewer],
  );
  await sql.query(
    "INSERT INTO admin_roles(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [reviewer],
  );
  const source = await createSource(sql, reviewer, {
    name: "Synthetic source",
    url: "https://example.test/smart-manufacturing",
    synthetic: true,
  });
  const draft = await createDraft(
    sql,
    reviewer,
    {
      sourceId: source.id,
      details: fixtureDetails,
      evidence: fixtureEvidence,
      note: "Seed explicitly marked synthetic fixture.",
    },
    "synthetic-course",
  );
  await reviewOpportunity(sql, reviewer, draft.id, {
    expectedRevision: 1,
    action: "publish",
    verified: true,
    note: "Approve synthetic fixture for local tests only.",
  });
}
