import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateResidenceEligibility,
  normalizeCountryCode,
} from "../src/domain/residence-eligibility";

test("country codes normalize from alpha-2 and alpha-3 forms", () => {
  assert.equal(normalizeCountryCode("cn"), "CN");
  assert.equal(normalizeCountryCode(" CHN "), "CN");
  assert.equal(normalizeCountryCode("chn"), "CN");
  assert.equal(normalizeCountryCode("deu"), "DE");
  assert.equal(normalizeCountryCode("unknown"), null);
  assert.equal(normalizeCountryCode(null), null);
});

test("allowed country lists decide residence eligibility", () => {
  const eligible = evaluateResidenceEligibility(
    { residenceCountry: "CN" },
    { residenceCountries: ["CN", "SG"] },
  );
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.status, "eligible");
  assert.equal(eligible.matchedRule, "CN");
  assert.equal(eligible.explanationKey, "residence.eligible");

  const ineligible = evaluateResidenceEligibility(
    { residenceCountry: "US" },
    { residenceCountries: ["CN", "SG"] },
  );
  assert.equal(ineligible.eligible, false);
  assert.equal(ineligible.status, "ineligible");
  assert.equal(ineligible.reason, "residence.not_allowed");
});

test("regional blocs expand to their member countries", () => {
  const asean = evaluateResidenceEligibility(
    { residenceCountry: "VN" },
    { residenceCountries: ["ASEAN"] },
  );
  assert.equal(asean.eligible, true);
  assert.equal(asean.matchedRule, "ASEAN");

  const eu = evaluateResidenceEligibility(
    { residenceCountry: "DEU" },
    { residenceCountries: ["EU"] },
  );
  assert.equal(eu.eligible, true);
  assert.equal(eu.matchedRule, "EU");

  const african = evaluateResidenceEligibility(
    { residenceCountry: "KEN" },
    { residenceCountries: ["AFRICAN_UNION"] },
  );
  assert.equal(african.eligible, true);

  const belt = evaluateResidenceEligibility(
    { residenceCountry: "CHN" },
    { residenceCountries: ["BELT_AND_ROAD"] },
  );
  assert.equal(belt.eligible, true);

  const outside = evaluateResidenceEligibility(
    { residenceCountry: "USA" },
    { residenceCountries: ["ASEAN", "EU"] },
  );
  assert.equal(outside.eligible, false);

  const global = evaluateResidenceEligibility(
    { residenceCountry: "USA" },
    { residenceCountries: ["ALL"] },
  );
  assert.equal(global.eligible, true);
  assert.equal(global.matchedRule, "ALL");
});

test("host-country residence and abroad application rules are distinguished", () => {
  const mustReside = evaluateResidenceEligibility(
    { residenceCountry: "CN" },
    { hostCountry: "CN" },
  );
  assert.equal(mustReside.eligible, true);
  const abroad = evaluateResidenceEligibility(
    { residenceCountry: "ID" },
    { hostCountry: "CN" },
  );
  assert.equal(abroad.eligible, false);
  assert.equal(abroad.reason, "residence.must_reside_in_host_country");

  const applyFromAbroad = evaluateResidenceEligibility(
    { residenceCountry: "CN" },
    { hostCountry: "CN", requireAbroadApplication: true },
  );
  assert.equal(applyFromAbroad.eligible, false);
  assert.equal(applyFromAbroad.reason, "residence.must_apply_from_abroad");
  const fromAbroad = evaluateResidenceEligibility(
    { residenceCountry: "ID" },
    { hostCountry: "CN", requireAbroadApplication: true },
  );
  assert.equal(fromAbroad.eligible, true);
});

test("excluded countries and unstated rules are handled cleanly", () => {
  const excluded = evaluateResidenceEligibility(
    { residenceCountry: "US" },
    { excludedResidenceCountries: ["US"] },
  );
  assert.equal(excluded.eligible, false);
  assert.equal(excluded.reason, "residence.excluded");

  const unrestricted = evaluateResidenceEligibility(
    { residenceCountry: "US" },
    {},
  );
  assert.equal(unrestricted.eligible, true);
  assert.equal(unrestricted.status, "no_requirement");

  const missing = evaluateResidenceEligibility(
    { residenceCountry: null },
    { residenceCountries: ["CN"] },
  );
  assert.equal(missing.status, "review_required");
  assert.equal(missing.reason, "residence.missing");

  const unknown = evaluateResidenceEligibility(
    { residenceCountry: "XX" },
    { residenceCountries: ["CN"] },
  );
  assert.equal(unknown.status, "review_required");
  assert.equal(unknown.reason, "residence.review_required");
});

test("nationality is reported separately from physical residence", () => {
  const result = evaluateResidenceEligibility(
    { residenceCountry: "CN", nationality: "US" },
    { residenceCountries: ["CN"] },
  );
  assert.equal(result.eligible, true);
  assert.ok(
    result.notes.includes("residence.nationality_evaluated_separately"),
  );
});

test("explanations are bilingual and evaluation is deterministic", () => {
  const english = evaluateResidenceEligibility(
    { residenceCountry: "US" },
    { residenceCountries: ["CN"] },
  );
  const chinese = evaluateResidenceEligibility(
    { residenceCountry: "US" },
    { residenceCountries: ["CN"] },
    { locale: "zh-Hans" },
  );
  assert.match(english.explanation, /not open/i);
  assert.match(chinese.explanation, /不向/);
  assert.notEqual(english.explanation, chinese.explanation);
  assert.deepEqual(
    evaluateResidenceEligibility(
      { residenceCountry: "US" },
      { residenceCountries: ["CN"] },
    ),
    english,
  );
});
