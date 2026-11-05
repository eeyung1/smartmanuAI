import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db";
import {
  completeOnboarding,
  readOnboardingProgress,
  readProfile,
  saveProfile,
  saveOnboardingStep,
} from "../src/domain/profile";

async function seedUser(
  sql: Awaited<ReturnType<typeof openDatabase>>["sql"],
  id: string,
) {
  await sql.query(
    "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$2,$3,NOW(),NOW())",
    [id, id, `${id}@example.test`],
  );
}

test("onboarding saves each step, resumes after restart and completes preferences", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-onboarding-"));
  let db = await openDatabase(dir);
  try {
    await seedUser(db.sql, "onboarding-user");
    const first = await saveOnboardingStep(db.sql, "onboarding-user", {
      step: 1,
      values: {
        interfaceLanguage: "zh-Hans",
        alertLanguage: "en",
        nationality: "NG",
        residenceCountry: "GH",
        age: 24,
        qualification: "bachelor",
      },
    });
    assert.equal(first.step, 2);
    assert.deepEqual(first.values, {
      interfaceLanguage: "zh-Hans",
      alertLanguage: "en",
      nationality: "NG",
      residenceCountry: "GH",
      age: 24,
      qualification: "bachelor",
    });
    assert.equal(await readProfile(db.sql, "onboarding-user"), null);
    await db.close();

    db = await openDatabase(dir);
    const resumed = await readOnboardingProgress(db.sql, "onboarding-user");
    assert.equal(resumed.step, 2);
    assert.equal(resumed.values.nationality, "NG");
    assert.equal(resumed.values.residenceCountry, "GH");
    await saveOnboardingStep(db.sql, "onboarding-user", {
      step: 2,
      values: {
        targetLevels: ["master"],
        topics: ["smart manufacturing"],
        categories: ["scholarship", "course"],
      },
    });
    await saveOnboardingStep(db.sql, "onboarding-user", {
      step: 3,
      values: {
        funding: ["fully_funded"],
        modes: ["online"],
        teachingLanguages: ["en", "zh"],
        countries: ["CN"],
      },
    });

    const { profile, progress } = await completeOnboarding(
      db.sql,
      "onboarding-user",
    );
    assert.equal(progress.completed, true);
    assert.equal(profile.nationality, "NG");
    assert.equal(profile.residenceCountry, "GH");
    assert.deepEqual(profile.targetLevels, ["master"]);
    assert.deepEqual(profile.countries, ["CN"]);
    assert.deepEqual(await readProfile(db.sql, "onboarding-user"), profile);
    assert.equal(
      (await readOnboardingProgress(db.sql, "onboarding-user")).completed,
      true,
    );
    await assert.rejects(() =>
      saveOnboardingStep(db.sql, "onboarding-user", {
        step: 3,
        values: { modes: ["online"] },
      }),
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("onboarding validates step order and keeps progress private per user", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-onboarding-owner-"));
  const db = await openDatabase(dir);
  try {
    await seedUser(db.sql, "first-user");
    await seedUser(db.sql, "second-user");
    await saveProfile(db.sql, "first-user", {
      nationality: "GH",
      residenceCountry: "GH",
      topics: ["robotics"],
    });
    await assert.rejects(() =>
      saveOnboardingStep(db.sql, "first-user", {
        step: 2,
        values: { topics: ["robotics"] },
      }),
    );
    await saveOnboardingStep(db.sql, "first-user", {
      step: 1,
      values: { nationality: "NG" },
    });
    assert.equal(
      (await readOnboardingProgress(db.sql, "second-user")).values.nationality,
      undefined,
    );
    assert.equal(
      (await readOnboardingProgress(db.sql, "second-user")).values
        .residenceCountry,
      undefined,
    );
    await assert.rejects(() =>
      saveOnboardingStep(db.sql, "first-user", {
        step: 2,
        values: { targetLevels: ["unlisted"] },
      }),
    );
    await assert.rejects(() => completeOnboarding(db.sql, "first-user"));
    await saveOnboardingStep(db.sql, "first-user", {
      step: 2,
      values: { targetLevels: ["master"] },
    });
    await saveOnboardingStep(db.sql, "first-user", {
      step: 3,
      values: { modes: ["online"] },
    });
    const { profile } = await completeOnboarding(db.sql, "first-user");
    assert.equal(profile.nationality, "NG");
    assert.equal(profile.residenceCountry, "GH");
    assert.deepEqual(profile.topics, ["robotics"]);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
