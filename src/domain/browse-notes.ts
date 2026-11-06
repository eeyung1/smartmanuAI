import type { SQL } from "../db";
import type { Details } from "../catalogue/schema";
import { preferencesSchema } from "./profile";
import { evaluateMatch, MATCH_RULES_VERSION } from "./matching";

/** Evaluate only the visible public page; never filter, rank or expose the stored profile. */
export async function personalBrowseNotes(
  sql: SQL,
  userId: string,
  items: ReadonlyArray<{ id: string; details: Details }>,
  now = new Date(),
) {
  const stored = (
    await sql.query(
      "SELECT preferences,version FROM profiles WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  const notes: Record<string, { failures: string[]; unknowns: string[] }> =
    Object.create(null);
  if (!stored)
    return {
      profileRequired: true,
      profileVersion: 0,
      rulesVersion: MATCH_RULES_VERSION,
      notes,
    };
  const profile = preferencesSchema.parse(stored.preferences);
  for (const item of items) {
    const match = evaluateMatch(profile, item.details, now);
    notes[item.id] = { failures: match.failures, unknowns: match.unknowns };
  }
  return {
    profileRequired: false,
    profileVersion: Number(stored.version),
    rulesVersion: MATCH_RULES_VERSION,
    notes,
  };
}
