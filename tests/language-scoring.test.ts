import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLanguageRequirement } from "../src/domain/language-scoring";

test("IELTS evaluation checks overall, sub-bands and deadline-relative validity", () => {
  const requirement = {
    test: "ielts",
    minimumOverall: 6.5,
    minimumBands: { listening: 6, reading: 6, writing: 6, speaking: 5.5 },
    deadline: "2027-06-01",
    validityMonths: 24,
  };
  const meets = evaluateLanguageRequirement(
    [
      {
        test: "IELTS",
        overall: 7,
        bands: { listening: 7, reading: 6.5, writing: 6, speaking: 6.5 },
        testedOn: "2025-06-01",
      },
    ],
    requirement,
  );
  assert.equal(meets.eligible, true);
  assert.equal(meets.status, "eligible");
  assert.deepEqual(meets.deficits, []);
  assert.equal(meets.explanationKey, "language.score.meets");

  const below = evaluateLanguageRequirement(
    {
      scores: [
        {
          test: "ielts",
          overall: 6,
          subBands: { listening: 6, reading: 6, writing: 5.5, speaking: 6 },
          testedOn: "2025-05-31",
        },
      ],
    },
    requirement,
  );
  assert.equal(below.eligible, false);
  assert.equal(below.status, "ineligible");
  assert.deepEqual(
    below.deficits.map((item) => item.field),
    ["validity", "overall", "writing"],
  );
  assert.equal(
    below.deficits.find((item) => item.field === "overall")?.shortfall,
    0.5,
  );
});

test("TOEFL iBT and HSK use their native scales without conversion", () => {
  assert.equal(
    evaluateLanguageRequirement(
      {
        toeflIbt: {
          test: "TOEFL iBT",
          total: 95,
          testedOn: "2026-01-01",
          validUntil: "2027-12-31",
        },
      },
      {
        test: "toefl-ibt",
        minimumTotal: 90,
        deadline: "2027-09-01",
      },
    ).eligible,
    true,
  );
  const toeflBelow = evaluateLanguageRequirement(
    [{ test: "toefl", total: 79 }],
    { test: "toefl-ibt", minimumTotal: 80 },
  );
  assert.equal(toeflBelow.eligible, false);
  assert.deepEqual(toeflBelow.deficits[0], {
    field: "total",
    required: 80,
    actual: 79,
    shortfall: 1,
    explanationKey: "language.score.toefl.total_below",
  });

  const hsk = evaluateLanguageRequirement(
    [{ test: "hsk", level: 5, total: 175, testedOn: "2026-06-01" }],
    {
      test: "hsk",
      minimumLevel: 4,
      minimumTotal: 180,
      deadline: "2027-06-01",
      validityMonths: 24,
    },
  );
  assert.equal(hsk.eligible, false);
  assert.equal(hsk.deficits.length, 1);
  assert.equal(hsk.deficits[0].field, "total");
  assert.equal(hsk.deficits[0].shortfall, 5);
  assert.equal(
    evaluateLanguageRequirement([{ test: "hsk", level: 4, total: 180 }], {
      test: "ielts",
      minimumOverall: 6,
    }).status,
    "unknown",
    "scores are never converted across tests",
  );
});

test("missing, invalid, multiple and exempt results use conservative deterministic outcomes", () => {
  const requirement = { test: "ielts", minimumOverall: 6.5 };
  const missing = evaluateLanguageRequirement([], requirement);
  assert.equal(missing.eligible, false);
  assert.equal(missing.status, "unknown");
  assert.equal(missing.explanationKey, "language.score.missing");

  const exempt = evaluateLanguageRequirement({ exempt: true }, requirement);
  assert.equal(exempt.eligible, true);
  assert.equal(exempt.status, "exempt");
  assert.equal(exempt.explanationKey, "language.score.exempt");
  assert.equal(
    evaluateLanguageRequirement(
      { exemptionConfirmed: true },
      { ...requirement, acceptsExemption: false },
    ).eligible,
    false,
  );

  for (const invalid of [
    { test: "ielts", minimumOverall: 10 },
    { test: "toefl-ibt", minimumTotal: 121 },
    { test: "hsk", minimumLevel: 7 },
    { test: "hsk", minimumLevel: 2, minimumTotal: 201 },
    { test: "ielts", minimumOverall: 6, deadline: "2026-02-30" },
  ])
    assert.equal(
      evaluateLanguageRequirement([], invalid).explanationKey,
      "language.requirement.invalid",
    );

  const best = evaluateLanguageRequirement(
    [
      { test: "ielts", overall: 5 },
      { test: "ielts", overall: 7 },
      { test: "ielts", overall: 6 },
    ],
    requirement,
  );
  assert.equal(best.eligible, true);
  assert.deepEqual(best.deficits, []);
  assert.deepEqual(
    evaluateLanguageRequirement([{ test: "hsk", level: 2, total: 250 }], {
      test: "hsk",
      minimumLevel: 2,
    }).status,
    "unknown",
    "out-of-range applicant scores are ignored rather than trusted",
  );
});
