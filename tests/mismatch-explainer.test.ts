import test from "node:test";
import assert from "node:assert/strict";
import { explainOpportunityMismatch } from "../src/domain/mismatch-explainer";
import { fixtureDetails } from "../src/catalogue/fixtures";

const now = new Date("2026-11-10T12:00:00.000Z");

const opportunity = {
  ...fixtureDetails,
  category: "scholarship",
  studyLevel: "master",
  eligibilityRules: {
    nationalities: ["CN"],
    residenceCountries: ["CN"],
    minAge: 18,
    maxAge: 30,
    minQualification: "bachelor",
    languageTest: { name: "IELTS Academic", scale: 9, minimumScore: 6.5 },
  },
};

const profile = {
  nationality: "CN",
  residenceCountry: "CN",
  qualification: "bachelor",
  targetLevels: ["master"],
  birthYear: 2004,
  ageAsOf: null,
  age: null,
  languageTest: {
    name: "IELTS Academic",
    scale: 9,
    score: 7,
    testedOn: "2026-01-10",
    validUntil: "2028-01-10",
  },
};

test("a matching profile produces no mismatch and full affinity", () => {
  const result = explainOpportunityMismatch(opportunity, profile, { now });
  assert.equal(result.isMatch, true);
  assert.equal(result.confirmed, true);
  assert.deepEqual(result.mismatches, []);
  assert.equal(result.affinity, 100);
  assert.deepEqual(result.affinityBasis, { matched: 6, evaluated: 6 });
});

test("each mismatch dimension is detected with bilingual explanations", () => {
  const result = explainOpportunityMismatch(
    opportunity,
    {
      ...profile,
      nationality: "US",
      residenceCountry: "US",
      qualification: "secondary",
      targetLevels: ["bachelor"],
      languageTest: {
        name: "IELTS Academic",
        scale: 9,
        score: 5.5,
        testedOn: "2026-01-10",
        validUntil: "2028-01-10",
      },
    },
    { now },
  );
  assert.equal(result.isMatch, false);
  const dimensions = result.mismatches.map((item) => item.dimension);
  assert.ok(dimensions.includes("nationality"));
  assert.ok(dimensions.includes("residence"));
  assert.ok(dimensions.includes("qualification"));
  assert.ok(dimensions.includes("study_level"));
  assert.ok(dimensions.includes("language_test"));
  assert.ok(result.affinity < 50);
  assert.ok(result.affinityBasis.evaluated >= 6);

  const chinese = explainOpportunityMismatch(
    opportunity,
    { ...profile, nationality: "US" },
    { now, locale: "zh-Hans" },
  );
  const reason = chinese.mismatches.find(
    (item) => item.dimension === "nationality",
  );
  assert.match(String(reason?.explanation), /国籍/);
  assert.equal(reason?.explanationKey, "mismatch.nationality.mismatch");
  const english = explainOpportunityMismatch(
    opportunity,
    { ...profile, nationality: "US" },
    { now },
  );
  assert.match(
    String(
      english.mismatches.find((item) => item.dimension === "nationality")
        ?.explanation,
    ),
    /nationality/,
  );
});

test("missing profile facts become guidance rather than fabricated mismatches", () => {
  const result = explainOpportunityMismatch(
    opportunity,
    {
      nationality: null,
      qualification: null,
      targetLevels: [],
      languageTest: null,
    },
    { now },
  );
  assert.equal(result.isMatch, false);
  assert.equal(result.confirmed, false);
  const guidance = result.guidance.map((item) => item.code);
  assert.ok(guidance.includes("nationality.missing"));
  assert.ok(guidance.includes("qualification.missing"));
  assert.ok(guidance.includes("language.missing"));
  assert.deepEqual(result.mismatches, []);
  assert.ok(result.affinity >= 0 && result.affinity <= 100);
});

test("age limits use recorded age and birth-year ranges conservatively", () => {
  const older = explainOpportunityMismatch(
    opportunity,
    { ...profile, age: 40, ageAsOf: "2026-11-10", birthYear: null },
    { now },
  );
  assert.ok(older.mismatches.some((item) => item.code === "age.above_maximum"));
  const minor = explainOpportunityMismatch(
    opportunity,
    { ...profile, age: 16, ageAsOf: "2026-11-10", birthYear: null },
    { now },
  );
  assert.ok(minor.mismatches.some((item) => item.code === "age.below_minimum"));
  const uncertain = explainOpportunityMismatch(
    opportunity,
    { ...profile, age: 25, ageAsOf: "2020-01-01", birthYear: null },
    { now },
  );
  assert.ok(uncertain.guidance.some((item) => item.code === "age.unknown"));
  assert.ok(
    !uncertain.mismatches.some((item) => item.dimension === "age"),
    "an unconfirmed age must not become a mismatch",
  );
});

test("expired, mismatched and unknown language evidence stay conservative", () => {
  const expired = explainOpportunityMismatch(
    opportunity,
    {
      ...profile,
      languageTest: {
        name: "IELTS Academic",
        scale: 9,
        score: 7,
        testedOn: "2024-01-10",
        validUntil: "2025-01-10",
      },
    },
    { now },
  );
  assert.ok(
    expired.guidance.some((item) => item.dimension === "language_test"),
  );
  assert.ok(
    !expired.mismatches.some((item) => item.dimension === "language_test"),
  );
  const otherTest = explainOpportunityMismatch(
    opportunity,
    {
      ...profile,
      languageTest: {
        name: "TOEFL iBT",
        scale: 120,
        score: 100,
        testedOn: "2026-01-10",
        validUntil: "2028-01-10",
      },
    },
    { now },
  );
  assert.ok(
    otherTest.guidance.some((item) => item.dimension === "language_test"),
  );
  const generic = explainOpportunityMismatch(
    {
      ...opportunity,
      eligibilityRules: {
        ...opportunity.eligibilityRules,
        languageTest: { name: "Example exam v1", scale: 100, minimumScore: 70 },
      },
    },
    {
      ...profile,
      languageTest: {
        name: "Example exam v1",
        scale: 100,
        score: 60,
        testedOn: "2026-01-10",
        validUntil: "2028-01-10",
      },
    },
    { now },
  );
  assert.ok(
    generic.mismatches.some(
      (item) =>
        item.dimension === "language_test" && item.code === "language.below",
    ),
  );
});

test("malformed input fails safely and deterministically", () => {
  const invalid = explainOpportunityMismatch(null, null, { now });
  assert.equal(invalid.isMatch, false);
  assert.equal(invalid.affinity, 0);
  assert.equal(invalid.guidance.length, 1);
  const empty = explainOpportunityMismatch(
    { studyLevel: null, category: "course", eligibilityRules: null },
    {},
    { now },
  );
  assert.equal(empty.isMatch, false);
  assert.equal(empty.affinityBasis.evaluated, 0);
  assert.deepEqual(
    explainOpportunityMismatch(opportunity, profile, { now }),
    explainOpportunityMismatch(opportunity, profile, { now }),
    "evaluation is deterministic",
  );
});
