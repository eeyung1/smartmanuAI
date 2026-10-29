import { z } from "zod";
import type { SQL } from "../db";
export const preferencesSchema = z
  .object({
    interfaceLanguage: z.enum(["en", "zh-Hans"]).default("en"),
    alertLanguage: z.enum(["en", "zh-Hans"]).default("en"),
    teachingLanguages: z
      .array(z.enum(["en", "zh"]))
      .max(2)
      .default(["en"]),
    nationality: z.string().max(2).nullable().default(null),
  })
  .strict();
export async function saveProfile(sql: SQL, userId: string, input: unknown) {
  const data = preferencesSchema.parse(input);
  await sql.query(
    "INSERT INTO profiles(user_id,preferences) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET preferences=EXCLUDED.preferences",
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
  if (opportunityId !== "synthetic-course")
    throw new Error("Unknown local fixture");
  await sql.query(
    "INSERT INTO saved_items(user_id,opportunity_id,status) VALUES($1,$2,'interested') ON CONFLICT DO NOTHING",
    [userId, opportunityId],
  );
}
export async function listSaved(sql: SQL, userId: string) {
  return (
    await sql.query(
      "SELECT opportunity_id,status FROM saved_items WHERE user_id=$1",
      [userId],
    )
  ).rows;
}
