import { languageTestFromForm } from "../src/domain/language-test-form";
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkLanguageTest,
  languageTestSchema,
  languageRequirementSchema,
} from "../src/domain/language-tests";
import {
  preferencesSchema,
  saveProfile,
  readProfile,
  saveOnboardingStep,
  readOnboardingProgress,
} from "../src/domain/profile";
import { detailsSchema } from "../src/catalogue/schema";
import { fixtureDetails } from "../src/catalogue/fixtures";
import { evaluateMatch, materialFingerprint } from "../src/domain/matching";
import { openDatabase } from "../src/db";
import { validateExtraction } from "../src/research/extraction";
import LanguageTestFields from "../app/components/language-test-fields";
import { LocaleProvider } from "../src/i18n/context";
const requirement = { name: "Example exam v1", scale: 100, minimumScore: 70 };
const result = {
  name: "Example exam v1",
  scale: 100,
  score: 70,
  testedOn: "2026-01-10",
  validUntil: "2027-01-10",
};
const now = new Date("2026-11-06T12:00:00Z");
const details = detailsSchema.parse({
  ...fixtureDetails,
  eligibilityRules: {
    nationalities: null,
    minAge: null,
    maxAge: null,
    minQualification: null,
    languageTest: requirement,
  },
});

test("only compatible current language results establish score matches, without inferring conversions or expiry", () => {
  assert.equal(checkLanguageTest(result, requirement, now), "meets");
  assert.equal(
    checkLanguageTest({ ...result, score: 69 }, requirement, now),
    "below",
  );
  for (const change of [
    { name: "Example exam v2" },
    { scale: 10, score: 7 },
    { testedOn: null },
    { testedOn: "2026-12-01" },
    { validUntil: null },
    { validUntil: "2026-11-05" },
  ])
    assert.equal(
      checkLanguageTest({ ...result, ...change }, requirement, now),
      "unknown",
    );
  assert.equal(
    checkLanguageTest(
      { ...result, name: " EXAMPLE  exam v1 " },
      requirement,
      now,
    ),
    "meets",
  );
  assert.equal(checkLanguageTest(null, requirement, now), "unknown");
  assert.equal(checkLanguageTest(result, null, now), "unknown");
  assert.equal(
    evaluateMatch(
      preferencesSchema.parse({ languageTest: { ...result, score: 69 } }),
      details,
      now,
    ).included,
    false,
  );
  const languagePreferenceOnly = evaluateMatch(
    preferencesSchema.parse({ teachingLanguages: ["en"] }),
    details,
    now,
  );
  assert.equal(languagePreferenceOnly.included, true);
  assert.ok(
    languagePreferenceOnly.unknowns.includes(
      "Language-test evidence needs checking: missing, expired or different test/version/scale.",
    ),
  );
  assert.ok(
    evaluateMatch(
      preferencesSchema.parse({ languageTest: result }),
      details,
      now,
    ).reasons.includes(
      "Your recorded language-test score meets the source minimum.",
    ),
  );
  assert.equal(
    languageTestSchema.safeParse({ ...result, score: 101 }).success,
    false,
  );
  assert.equal(
    languageRequirementSchema.safeParse({ ...requirement, minimumScore: 101 })
      .success,
    false,
  );
  assert.equal(
    languageTestSchema.safeParse({ ...result, validUntil: "2025-01-01" })
      .success,
    false,
  );
  const form = new FormData();
  assert.equal(languageTestFromForm(form), null);
  form.set("languageTestName", "Example exam v1");
  assert.equal(
    languageTestSchema.safeParse(languageTestFromForm(form)).success,
    false,
    "blank scores must not turn into zero",
  );
  const cosmetic = detailsSchema.parse({
    ...details,
    eligibilityRules: {
      ...details.eligibilityRules,
      languageTest: { ...requirement, name: "EXAMPLE exam v1" },
    },
  });
  assert.equal(materialFingerprint(details), materialFingerprint(cosmetic));
});

test("language-test extraction needs an eligibility quotation and forms render in both locales", () => {
  const content =
    fixtureDetails.title +
    ". Smart manufacturing. Example exam v1 minimum 70 of 100.";
  const quote = { quote: content, reason: null };
  const input = {
    relevant: true,
    details,
    evidence: {
      title: quote,
      funding: quote,
      deadline: { quote: null, reason: "No deadline stated." },
      eligibility: { quote: null, reason: "Unknown." },
    },
  };
  assert.throws(
    () => validateExtraction(content, input),
    /eligibility quotation/,
  );
  assert.ok(
    validateExtraction(content, {
      ...input,
      evidence: { ...input.evidence, eligibility: quote },
    }).relevant,
  );
  for (const locale of ["en", "zh-Hans"] as const)
    for (const source of [false, true]) {
      const html = renderToStaticMarkup(
        createElement(LocaleProvider, {
          locale,
          children: createElement(LanguageTestFields, {
            result,
            requirement,
            source,
          }),
        }),
      );
      assert.match(html, /name="languageTestName"/);
      assert.match(
        html,
        locale === "en" ? /Test name and version/ : /考试名称及版本/,
      );
      assert.match(
        html,
        source ? /name="languageTestMinimum"/ : /name="languageTestValidUntil"/,
      );
    }
});

test("language results persist privately across profile/onboarding restart and can be cleared", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-language-"));
  let db = await openDatabase(dir);
  try {
    await db.sql.query(
      "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('language-user','Language user','language@example.test',NOW(),NOW()),('other-user','Other user','other@example.test',NOW(),NOW())",
    );
    await saveProfile(db.sql, "language-user", { languageTest: result });
    await saveOnboardingStep(db.sql, "language-user", {
      step: 1,
      values: { languageTest: result },
    });
    await db.close();
    db = await openDatabase(dir);
    assert.deepEqual(
      (await readProfile(db.sql, "language-user"))?.languageTest,
      result,
    );
    assert.deepEqual(
      (await readOnboardingProgress(db.sql, "language-user")).values
        .languageTest,
      result,
    );
    assert.equal(await readProfile(db.sql, "other-user"), null);
    assert.equal(
      (await readOnboardingProgress(db.sql, "other-user")).values.languageTest,
      undefined,
    );
    await saveProfile(db.sql, "language-user", { languageTest: null });
    assert.equal(
      (await readProfile(db.sql, "language-user"))?.languageTest,
      null,
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
