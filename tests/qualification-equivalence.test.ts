import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateQualificationEligibility,
  normalizeQualification,
  scoreFieldRelevance,
} from "../src/domain/qualification-equivalence";

test("global credentials normalize onto ordered academic levels", () => {
  for (const [credential, level] of [
    ["High School Diploma", "secondary"],
    ["高中毕业", "secondary"],
    ["Vocational Secondary School", "vocational"],
    ["职业高中", "vocational"],
    ["Associate of Science", "associate"],
    ["大专", "associate"],
    ["Bachelor of Science in Mechanical Engineering", "bachelor"],
    ["本科", "bachelor"],
    ["Master of Engineering", "master"],
    ["硕士研究生", "master"],
    ["PhD in Robotics", "doctorate"],
    ["博士学位", "doctorate"],
  ] as const) {
    const normalized = normalizeQualification(credential);
    assert.equal(normalized.level, level, credential);
    assert.equal(normalized.reviewRequired, false, credential);
    assert.ok(normalized.confidence > 0, credential);
  }
  assert.equal(normalizeQualification("B.Sc.").level, "bachelor");
  assert.equal(normalizeQualification("MSc").level, "master");
  assert.equal(normalizeQualification("Ph.D.").level, "doctorate");
  assert.equal(normalizeQualification("bachelor").standardized, "bachelor");
  assert.equal(normalizeQualification("associate").standardized, null);
});

test("unrecognized credentials raise a review flag instead of a rejection", () => {
  for (const credential of ["", null, "   ", "mystery diploma", 42])
    assert.equal(
      normalizeQualification(credential as never).reviewRequired,
      true,
      JSON.stringify(credential),
    );
  const unknown = normalizeQualification("mystery diploma");
  assert.equal(unknown.level, "unknown");
  assert.equal(unknown.standardized, null);
  assert.equal(unknown.confidence, 0);
  assert.equal(unknown.reason, "unrecognized_credential");
});

test("eligibility compares ordered levels against the stated minimum", () => {
  const meets = evaluateQualificationEligibility(
    { qualification: "Master of Science" },
    { minQualification: "bachelor" },
  );
  assert.equal(meets.eligible, true);
  assert.equal(meets.status, "meets");
  assert.equal(meets.applicantLevel, "master");
  assert.equal(meets.requiredTier, "bachelor");
  assert.equal(meets.reviewRequired, false);

  const below = evaluateQualificationEligibility(
    { qualification: "Bachelor of Science" },
    { minQualification: "master" },
  );
  assert.equal(below.eligible, false);
  assert.equal(below.status, "below");
  assert.equal(below.explanationKey, "qualification.below_requirement");

  const noRule = evaluateQualificationEligibility(
    { qualification: "Bachelor of Science" },
    { minQualification: null },
  );
  assert.equal(noRule.eligible, true);
  assert.equal(noRule.status, "no_requirement");
});

test("unrecognized applicant credentials request review rather than a hard rejection", () => {
  const missing = evaluateQualificationEligibility(
    {},
    {
      minQualification: "bachelor",
    },
  );
  assert.equal(missing.status, "review_required");
  assert.equal(missing.reviewRequired, true);
  assert.equal(missing.eligible, false);

  const unknown = evaluateQualificationEligibility(
    { qualification: "mystery diploma" },
    { minQualification: "bachelor" },
  );
  assert.equal(unknown.status, "review_required");
  assert.equal(unknown.reviewRequired, true);
  assert.equal(unknown.reason, "unrecognized_credential");
});

test("field relevance scores related disciplines deterministically", () => {
  const robotics = scoreFieldRelevance("Robotics", [
    "smart manufacturing",
    "computer science",
  ]);
  assert.equal(robotics.reviewRequired, false);
  assert.equal(robotics.matches[0].score, 0.8);
  assert.equal(robotics.matches[1].score, 0.6);
  assert.equal(robotics.score, 0.8);

  const exact = scoreFieldRelevance("Industrial Automation", [
    "industrial automation",
  ]);
  assert.equal(exact.score, 1);

  const unrelated = scoreFieldRelevance("Civil Engineering", ["robotics"]);
  assert.equal(unrelated.score, 0.25);
  assert.equal(unrelated.reason, "weak_discipline_overlap");
  assert.equal(
    scoreFieldRelevance("Civil Engineering", ["civil engineering"]).score,
    1,
  );

  const chinese = scoreFieldRelevance("机器人", ["智能制造"]);
  assert.equal(chinese.score, 0.8);

  const unknown = scoreFieldRelevance("astrophysics", ["robotics"]);
  assert.equal(unknown.reviewRequired, true);
  assert.equal(unknown.reason, "unrecognized_discipline");
  assert.equal(scoreFieldRelevance("robotics", []).reason, "no_target_topics");
  assert.equal(
    scoreFieldRelevance("", ["robotics"]).reason,
    "missing_discipline",
  );
});

test("evaluation is deterministic and side-effect free", () => {
  const profile = { qualification: "Master of Science" };
  const rules = { minQualification: "bachelor" };
  const first = evaluateQualificationEligibility(profile, rules);
  assert.deepEqual(evaluateQualificationEligibility(profile, rules), first);
  assert.deepEqual(profile, { qualification: "Master of Science" });
});
