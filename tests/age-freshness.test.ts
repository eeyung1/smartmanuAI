import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentAgeRange } from "../src/domain/age";
import {
  preferencesSchema,
  saveProfile,
  readProfile,
  saveOnboardingStep,
  readOnboardingProgress,
} from "../src/domain/profile";
import { evaluateMatch } from "../src/domain/matching";
import { detailsSchema } from "../src/catalogue/schema";
import { fixtureDetails } from "../src/catalogue/fixtures";
import { openDatabase } from "../src/db";
const now = new Date("2026-11-05T12:00:00Z");
const details = detailsSchema.parse({
  ...fixtureDetails,
  eligibilityRules: {
    nationalities: ["ALL"],
    minAge: 18,
    maxAge: 30,
    minQualification: null,
  },
});

test("age matching uses current confirmations and conservative birth-year ranges", () => {
  const match = (input: unknown) =>
    evaluateMatch(preferencesSchema.parse(input), details, now);
  for (const ageAsOf of [undefined, null, "2026-11-04", "2026-11-06"]) {
    const result = match({ age: 31, ageAsOf });
    assert.equal(
      result.included,
      true,
      "stale, missing or future dates must not exclude users",
    );
    assert.ok(
      result.unknowns.includes(
        "Confirm your current age or add your birth year to check age limits.",
      ),
    );
  }
  assert.equal(match({ age: 31, ageAsOf: "2026-11-05" }).included, false);
  assert.ok(
    match({ age: 30, ageAsOf: "2026-11-05" }).reasons.includes(
      "Age meets the recorded limits.",
    ),
  );
  const boundary = match({ birthYear: 1995 });
  assert.equal(boundary.included, true);
  assert.ok(
    boundary.unknowns.includes(
      "Your birth-year age range overlaps an age limit; check the source and your birthday.",
    ),
  );
  assert.equal(match({ birthYear: 1994 }).included, false);
  assert.ok(
    match({ birthYear: 1996 }).reasons.includes(
      "Age meets the recorded limits.",
    ),
  );
  assert.deepEqual(
    currentAgeRange({ birthYear: 2000 }, new Date("2026-12-31T23:59:59Z")),
    { min: 25, max: 26 },
  );
  assert.deepEqual(
    currentAgeRange({ birthYear: 2000 }, new Date("2027-01-01T00:00:00Z")),
    { min: 26, max: 27 },
  );
  assert.equal(
    currentAgeRange(
      { age: 25, ageAsOf: "2026-11-05" },
      new Date("2026-11-06T00:00:00Z"),
    ),
    null,
  );
  assert.equal(currentAgeRange({ age: 25, birthYear: 2000 }, now), null);
  assert.equal(
    preferencesSchema.safeParse({ birthYear: new Date().getUTCFullYear() + 1 })
      .success,
    false,
  );
  assert.equal(
    preferencesSchema.safeParse({ ageAsOf: "2026-02-30" }).success,
    false,
  );
});

test("age metadata persists privately, legacy ages stay undated and conflicting inputs are rejected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-age-"));
  let db = await openDatabase(dir);
  try {
    await db.sql.query(
      "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('age-user','Age user','age@example.test',NOW(),NOW()),('other-user','Other user','other@example.test',NOW(),NOW())",
    );
    await saveProfile(db.sql, "age-user", { age: 31 });
    assert.equal((await readProfile(db.sql, "age-user"))?.ageAsOf, undefined);
    await saveProfile(db.sql, "age-user", { birthYear: 2000 });
    await saveOnboardingStep(db.sql, "age-user", {
      step: 1,
      values: { age: 25, ageAsOf: "2026-11-05" },
    });
    await db.close();
    db = await openDatabase(dir);
    assert.equal((await readProfile(db.sql, "age-user"))?.birthYear, 2000);
    assert.equal(
      (await readOnboardingProgress(db.sql, "age-user")).values.ageAsOf,
      "2026-11-05",
    );
    assert.equal(await readProfile(db.sql, "other-user"), null);
    await assert.rejects(
      saveProfile(db.sql, "age-user", { age: 25, birthYear: 2000 }),
      /not both/,
    );
    await assert.rejects(
      saveOnboardingStep(db.sql, "other-user", {
        step: 1,
        values: { age: 25, birthYear: 2000 },
      }),
      /not both/,
    );
    assert.equal((await readProfile(db.sql, "age-user"))?.birthYear, 2000);
    assert.deepEqual(
      (await readOnboardingProgress(db.sql, "other-user")).values,
      {},
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
