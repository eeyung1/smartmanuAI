import { z } from "zod";
const identity = {
  name: z.string().trim().min(2).max(80),
  scale: z.number().positive().max(1000),
};
export const languageTestSchema = z
  .object({
    ...identity,
    score: z.number().min(0),
    testedOn: z.iso.date().nullable(),
    validUntil: z.iso.date().nullable(),
  })
  .strict()
  .refine((v) => v.score <= v.scale)
  .refine((v) => !v.testedOn || !v.validUntil || v.validUntil >= v.testedOn);
export const languageRequirementSchema = z
  .object({ ...identity, minimumScore: z.number().min(0) })
  .strict()
  .refine((v) => v.minimumScore <= v.scale);
export type LanguageTest = z.infer<typeof languageTestSchema>;
export type LanguageRequirement = z.infer<typeof languageRequirementSchema>;
export const languageTestKey = (name: string) =>
  name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export function checkLanguageTest(
  result: LanguageTest | null | undefined,
  requirement: LanguageRequirement | null | undefined,
  now = new Date(),
): "unknown" | "meets" | "below" {
  if (
    !requirement ||
    !result ||
    languageTestKey(result.name) !== languageTestKey(requirement.name) ||
    result.scale !== requirement.scale
  )
    return "unknown";
  const today = now.toISOString().slice(0, 10);
  if (
    !result.testedOn ||
    result.testedOn > today ||
    !result.validUntil ||
    result.validUntil < today
  )
    return "unknown";
  return result.score >= requirement.minimumScore ? "meets" : "below";
}
