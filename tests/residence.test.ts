import test from "node:test";
import assert from "node:assert/strict";
import { preferencesSchema } from "../src/domain/profile";
import { detailsSchema, eligibilityRulesSchema } from "../src/catalogue/schema";
import { evaluateMatch, materialFingerprint } from "../src/domain/matching";
import { fixtureDetails } from "../src/catalogue/fixtures";
const profile = preferencesSchema.parse({
  nationality: "NG",
  residenceCountry: "GH",
});
const details = detailsSchema.parse({
  ...fixtureDetails,
  eligibilityRules: {
    nationalities: ["NG"],
    residenceCountries: ["GH"],
    minAge: null,
    maxAge: null,
    minQualification: null,
  },
});

test("residence restrictions are independent of nationality and unknowns never assert eligibility", () => {
  assert.equal(evaluateMatch(profile, details).included, true);
  assert.ok(
    evaluateMatch(profile, details).reasons.includes(
      "Residence meets the recorded restriction.",
    ),
  );
  const wrongResidence = evaluateMatch(
    { ...profile, residenceCountry: "NG" },
    details,
  );
  assert.equal(wrongResidence.included, false);
  assert.ok(
    wrongResidence.failures.includes(
      "Your country of residence does not meet the recorded restriction.",
    ),
  );
  assert.equal(
    evaluateMatch({ ...profile, nationality: "GH" }, details).included,
    false,
  );
  for (const residenceCountry of [undefined, null]) {
    const result = evaluateMatch({ ...profile, residenceCountry }, details);
    assert.equal(result.included, true);
    assert.ok(
      result.unknowns.includes(
        "Add your country of residence to check this restriction.",
      ),
    );
    assert.equal(result.eligibility, "needs_checking");
  }
  const unrestricted = detailsSchema.parse({
    ...details,
    eligibilityRules: {
      ...details.eligibilityRules,
      residenceCountries: ["ALL"],
    },
  });
  assert.equal(
    evaluateMatch({ ...profile, residenceCountry: null }, unrestricted)
      .included,
    true,
  );
  assert.ok(
    !evaluateMatch(
      { ...profile, residenceCountry: null },
      unrestricted,
    ).unknowns.includes(
      "Add your country of residence to check this restriction.",
    ),
  );
  assert.ok(
    evaluateMatch(
      profile,
      detailsSchema.parse(fixtureDetails),
    ).unknowns.includes("Residence requirements are not stated."),
  );
});

test("legacy records stay valid, residence codes are validated and material fingerprints ignore country order", () => {
  assert.equal(preferencesSchema.parse({}).residenceCountry, undefined);
  assert.ok(detailsSchema.safeParse(fixtureDetails).success);
  for (const residenceCountry of ["GHA", "gh", "ALL", "12"])
    assert.equal(
      preferencesSchema.safeParse({ residenceCountry }).success,
      false,
    );
  assert.equal(
    eligibilityRulesSchema.safeParse({
      ...details.eligibilityRules,
      residenceCountries: [],
    }).success,
    false,
  );
  assert.equal(
    eligibilityRulesSchema.safeParse({
      ...details.eligibilityRules,
      residenceCountries: ["gh"],
    }).success,
    false,
  );
  const withCountries = (residenceCountries: string[]) =>
    detailsSchema.parse({
      ...details,
      eligibilityRules: { ...details.eligibilityRules, residenceCountries },
    });
  assert.equal(
    materialFingerprint(withCountries(["GH", "NG"])),
    materialFingerprint(withCountries(["NG", "GH", "GH"])),
  );
  assert.notEqual(
    materialFingerprint(withCountries(["GH"])),
    materialFingerprint(withCountries(["NG"])),
  );
});
