import { z } from "zod";
import { publicOpportunity, CatalogueError } from "../catalogue/service";
import type { SQL } from "../db";
export const preferencesSchema = z
  .object({
    interfaceLanguage: z.enum(["en", "zh-Hans"]).default("en"),
    alertLanguage: z.enum(["en", "zh-Hans"]).default("en"),
    teachingLanguages: z
      .array(z.enum(["en", "zh"]))
      .max(2)
      .default(["en"]),
    nationality: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .default(null),
    age: z.number().int().min(0).max(120).nullable().default(null),
    qualification: z
      .enum(["secondary", "bachelor", "master", "doctorate", "other"])
      .nullable()
      .default(null),
    targetLevels: z
      .array(z.enum(["bachelor", "master", "doctorate"]))
      .max(3)
      .default([]),
    topics: z.array(z.string().trim().min(2).max(70)).max(10).default([]),
    categories: z
      .array(z.enum(["scholarship", "course", "event"]))
      .min(1)
      .max(3)
      .default(["scholarship", "course", "event"]),
    funding: z
      .array(z.enum(["fully_funded", "tuition_only", "free_participation"]))
      .min(1)
      .max(3)
      .default(["fully_funded", "tuition_only", "free_participation"]),
    modes: z
      .array(z.enum(["online", "in_person"]))
      .min(1)
      .max(2)
      .default(["online", "in_person"]),
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(20)
      .default([]),
  })
  .strict();
export async function saveProfile(sql: SQL, userId: string, input: unknown) {
  const data = preferencesSchema.parse(input);
  await sql.query(
    "INSERT INTO profiles(user_id,preferences) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET preferences=EXCLUDED.preferences,version=profiles.version+1 WHERE profiles.preferences IS DISTINCT FROM EXCLUDED.preferences",
    [userId, JSON.stringify(data)],
  );
  return data;
}
export type Preferences = z.infer<typeof preferencesSchema>;
export async function readProfile(
  sql: SQL,
  userId: string,
): Promise<Preferences | null> {
  const value = (
    await sql.query("SELECT preferences FROM profiles WHERE user_id=$1", [
      userId,
    ])
  ).rows[0]?.preferences;
  return value ? preferencesSchema.parse(value) : null;
}
export async function saveItem(
  sql: SQL,
  userId: string,
  opportunityId: string,
) {
  await sql.transaction(async (tx) => {
    await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
      userId,
    ]);
    await tx.query("SELECT id FROM opportunities WHERE id=$1 FOR SHARE", [
      opportunityId,
    ]);
    const record = await publicOpportunity(tx, opportunityId);
    if (!record?.available)
      throw new CatalogueError(404, "Opportunity is unavailable.");
    await tx.query(
      "INSERT INTO saved_items(user_id,opportunity_id,status) VALUES($1,$2,'interested') ON CONFLICT(user_id,opportunity_id) DO UPDATE SET saved=true,dismissed_fingerprint=NULL,version=saved_items.version+1,updated_at=NOW() WHERE NOT saved_items.saved OR saved_items.dismissed_fingerprint IS NOT NULL",
      [userId, opportunityId],
    );
  });
}
export { listSaved } from "./tracker";
