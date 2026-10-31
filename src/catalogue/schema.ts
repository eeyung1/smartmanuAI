import { z } from "zod";
import { isIP } from "node:net";
export const publicURL = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !isIP(u.hostname) &&
      u.hostname.includes(".") &&
      !u.hostname.endsWith(".localhost") &&
      u.hostname !== "localhost" &&
      !u.hostname.endsWith(".local")
    );
  }, "Use a public HTTPS source URL without credentials or a custom port.");
export const sourceSchema = z
  .object({
    name: z.string().trim().min(3).max(200),
    url: publicURL,
    synthetic: z.boolean().default(false),
  })
  .strict();
export const eligibilityRulesSchema = z
  .object({
    nationalities: z
      .array(z.string().regex(/^(?:[A-Z]{2}|ALL)$/))
      .min(1)
      .max(250)
      .nullable(),
    minAge: z.number().int().min(0).max(120).nullable(),
    maxAge: z.number().int().min(0).max(120).nullable(),
    minQualification: z
      .enum(["secondary", "bachelor", "master", "doctorate"])
      .nullable(),
  })
  .strict()
  .refine(
    (v) => v.minAge === null || v.maxAge === null || v.minAge <= v.maxAge,
    "Minimum age cannot exceed maximum age.",
  );
export const detailsSchema = z
  .object({
    studyLevel: z
      .enum(["bachelor", "master", "doctorate"])
      .nullable()
      .default(null),
    eligibilityRules: eligibilityRulesSchema.nullable().default(null),
    title: z.string().trim().min(3).max(200),
    organizer: z.string().trim().min(2).max(200),
    summary: z.string().trim().min(10).max(2000),
    category: z.enum(["scholarship", "course", "event"]),
    mode: z.enum(["online", "in_person"]),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    teachingLanguage: z.enum(["en", "zh", "other", "unknown"]),
    topics: z.array(z.string().trim().min(2).max(70)).min(1).max(10),
    funding: z.enum([
      "fully_funded",
      "tuition_only",
      "free_participation",
      "partial",
      "unclear",
    ]),
    tuitionCovered: z.boolean().nullable(),
    accommodationCovered: z.boolean().nullable(),
    livingCostsCovered: z.boolean().nullable(),
    participationFree: z.boolean().nullable(),
    applicationFee: z.string().max(200).nullable(),
    certificateFee: z.string().max(200).nullable(),
    travelCosts: z.string().max(200).nullable(),
    coverageDuration: z.string().max(200).nullable(),
    deadline: z.iso.date().nullable(),
    deadlineText: z.string().max(300).nullable(),
    eligibility: z.string().trim().min(3).max(2000),
  })
  .strict();
export const evidenceSchema = z
  .object({
    title: z.string().trim().min(3).max(3000),
    funding: z.string().trim().min(3).max(3000),
    deadline: z.string().trim().min(3).max(3000),
    eligibility: z.string().trim().min(3).max(3000),
  })
  .strict();
export const draftSchema = z
  .object({
    sourceId: z.uuid(),
    details: detailsSchema,
    evidence: evidenceSchema,
    note: z.string().trim().min(5).max(1000),
  })
  .strict();
export const reviewSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    action: z.enum(["publish", "close", "reject", "revise"]),
    note: z.string().trim().min(5).max(1000),
    verified: z.boolean().default(false),
    details: detailsSchema.optional(),
    evidence: evidenceSchema.optional(),
  })
  .strict();
export type Details = z.infer<typeof detailsSchema>;
export function validatePublication(d: Details) {
  if (
    d.funding === "fully_funded" &&
    ![d.tuitionCovered, d.accommodationCovered, d.livingCostsCovered].every(
      (v) => v === true,
    )
  )
    throw new Error(
      "Fully funded requires supported tuition, accommodation and living costs.",
    );
  if (d.funding === "tuition_only" && d.tuitionCovered !== true)
    throw new Error("Tuition coverage must be supported.");
  if (d.funding === "free_participation" && d.participationFree !== true)
    throw new Error("Free participation must be supported.");
  if (d.category === "scholarship" && d.country !== "CN")
    throw new Error("Scholarships are restricted to China.");
  if (d.category === "scholarship" && d.funding === "free_participation")
    throw new Error(
      "Use scholarship funding coverage rather than a participation label.",
    );
  if (d.mode === "in_person" && d.country === null)
    throw new Error("In-person opportunities need a country.");
  if (d.mode === "in_person" && d.country !== "CN")
    throw new Error(
      "The current catalogue scope includes in-person opportunities in China only.",
    );
  if (d.deadline && !d.deadlineText)
    throw new Error("Keep the original source deadline text.");
}
export const filtersSchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    category: z.enum(["scholarship", "course", "event"]).optional(),
    language: z.enum(["en", "zh", "other", "unknown"]).optional(),
    funding: z
      .enum([
        "fully_funded",
        "tuition_only",
        "free_participation",
        "partial",
        "unclear",
      ])
      .optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  })
  .strict();
export function parseFilters(params: Record<string, unknown>) {
  return filtersSchema.parse(
    Object.fromEntries(
      Object.entries(params).filter(
        ([, value]) => value !== "" && value !== undefined,
      ),
    ),
  );
}
