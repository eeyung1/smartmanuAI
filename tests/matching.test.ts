import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import {
  preferencesSchema,
  saveProfile,
  saveItem,
  listSaved,
} from "../src/domain/profile";
import {
  evaluateMatch,
  materialFingerprint,
  matchesForUser,
} from "../src/domain/matching";
import { listTracker, updateTracker } from "../src/domain/tracker";
import { detailsSchema } from "../src/catalogue/schema";
import {
  seedLocalCatalogue,
  fixtureDetails,
  fixtureEvidence,
} from "../src/catalogue/fixtures";
import { createDraft, reviewOpportunity } from "../src/catalogue/service";
const profile = preferencesSchema.parse({
  nationality: "NG",
  age: 25,
  qualification: "bachelor",
  targetLevels: ["master"],
  topics: ["intelligent manufacturing"],
});
const details = detailsSchema.parse({
  ...fixtureDetails,
  category: "scholarship",
  country: "CN",
  funding: "tuition_only",
  tuitionCovered: true,
  studyLevel: "master",
  eligibilityRules: {
    nationalities: ["NG"],
    minAge: 18,
    maxAge: 30,
    minQualification: "bachelor",
  },
});
test("matching distinguishes known failures from unknowns and material facts from cosmetic edits", () => {
  assert.equal(evaluateMatch(profile, details).included, true);
  assert.equal(evaluateMatch(profile, details).eligibility, "needs_checking");
  for (const changed of [
    { nationality: "GH" },
    { age: 31 },
    { qualification: "secondary" },
    { teachingLanguages: ["zh"] },
    { targetLevels: ["doctorate"] },
    { modes: ["in_person"] },
    { topics: ["robotics"] },
  ])
    assert.equal(
      evaluateMatch(
        preferencesSchema.parse({ ...profile, ...changed }),
        details,
      ).included,
      false,
      JSON.stringify(changed),
    );
  const unknown = evaluateMatch(
    preferencesSchema.parse({
      ...profile,
      age: null,
      nationality: null,
      qualification: null,
    }),
    details,
  );
  assert.equal(unknown.included, true);
  assert.ok(unknown.unknowns.some((v) => v.includes("nationality")));
  assert.equal(
    evaluateMatch(profile, {
      ...details,
      teachingLanguage: "unknown",
      studyLevel: null,
      eligibilityRules: null,
    }).included,
    true,
  );
  assert.equal(
    materialFingerprint(details),
    materialFingerprint({
      ...details,
      title: "A cosmetic title correction",
      summary: "A revised summary.",
    }),
  );
  assert.notEqual(
    materialFingerprint(details),
    materialFingerprint({ ...details, certificateFee: "USD 50" }),
  );
  assert.throws(() =>
    detailsSchema.parse({
      ...details,
      eligibilityRules: { ...details.eligibilityRules, minAge: 50, maxAge: 20 },
    }),
  );
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: private matching, profile versions and revision-aware tracker persist`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-matching-")),
        schema = "matching_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", `-c search_path=${schema}`);
        url = parsed.href;
      }
      let db = await openDatabase(dir, url);
      try {
        await seedLocalCatalogue(db.sql);
        const admin = "local-fixture-reviewer";
        for (const id of ["a", "b"])
          await db.sql.query(
            "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
            [id, id + "@example.test"],
          );
        assert.equal((await matchesForUser(db.sql, "a")).profileRequired, true);
        await saveProfile(db.sql, "a", profile);
        await saveProfile(db.sql, "a", profile);
        assert.equal((await matchesForUser(db.sql, "a")).profileVersion, 1);
        await saveProfile(db.sql, "b", { ...profile, nationality: "GH" });
        const sourceId = (
          await db.sql.query(
            "SELECT source_id FROM opportunities WHERE id='synthetic-course'",
          )
        ).rows[0].source_id;
        const draft = await createDraft(db.sql, admin, {
          sourceId,
          details,
          evidence: fixtureEvidence,
          note: "Synthetic matching scholarship fixture.",
        });
        await assert.rejects(
          () =>
            reviewOpportunity(db.sql, admin, draft.id, {
              action: "close",
              expectedRevision: 1,
              note: "Cannot expose an unpublished draft.",
            }),
          /Only published/,
        );
        await reviewOpportunity(db.sql, admin, draft.id, {
          action: "publish",
          expectedRevision: 1,
          verified: true,
          note: "Approve synthetic matching fixture.",
        });
        assert.ok(
          (await matchesForUser(db.sql, "a")).items.some(
            (v) => v.id === draft.id,
          ),
        );
        assert.ok(
          !(await matchesForUser(db.sql, "b")).items.some(
            (v) => v.id === draft.id,
          ),
        );
        await saveProfile(db.sql, "a", { ...profile, age: 50 });
        assert.equal((await matchesForUser(db.sql, "a")).profileVersion, 2);
        assert.ok(
          !(await matchesForUser(db.sql, "a")).items.some(
            (v) => v.id === draft.id,
          ),
        );
        await saveProfile(db.sql, "a", profile);
        await saveItem(db.sql, "a", draft.id);
        await updateTracker(db.sql, "a", {
          opportunityId: draft.id,
          expectedVersion: 1,
          action: "status",
          status: "applying",
        });
        await saveItem(db.sql, "a", draft.id);
        assert.equal((await listSaved(db.sql, "a"))[0].status, "applying");
        assert.equal((await listSaved(db.sql, "a"))[0].version, 2);
        await assert.rejects(
          () =>
            updateTracker(db.sql, "b", {
              opportunityId: draft.id,
              expectedVersion: 0,
              action: "status",
              status: "applied",
            }),
          /not found/,
        );
        await updateTracker(db.sql, "a", {
          opportunityId: draft.id,
          expectedVersion: 2,
          action: "dismiss",
        });
        await assert.rejects(
          () =>
            updateTracker(db.sql, "a", {
              opportunityId: draft.id,
              expectedVersion: 2,
              action: "restore",
            }),
          /changed/,
        );
        assert.ok(
          !(await matchesForUser(db.sql, "a")).items.some(
            (v) => v.id === draft.id,
          ),
        );
        const cosmetic = {
          ...details,
          title: "PRIVATE DRAFT TITLE",
          summary: "Updated synthetic summary for review.",
        };
        await reviewOpportunity(db.sql, admin, draft.id, {
          action: "revise",
          expectedRevision: 2,
          details: cosmetic,
          evidence: fixtureEvidence,
          note: "Correct cosmetic text only.",
        });
        assert.notEqual(
          (await listSaved(db.sql, "a"))[0].title,
          cosmetic.title,
        );
        await reviewOpportunity(db.sql, admin, draft.id, {
          action: "publish",
          expectedRevision: 3,
          verified: true,
          note: "Approve reviewed cosmetic correction.",
        });
        assert.ok(
          !(await matchesForUser(db.sql, "a")).items.some(
            (v) => v.id === draft.id,
          ),
        );
        const material = {
          ...cosmetic,
          deadline: "2030-12-01",
          deadlineText: "Apply by 1 December 2030.",
        };
        await reviewOpportunity(db.sql, admin, draft.id, {
          action: "revise",
          expectedRevision: 4,
          details: material,
          evidence: fixtureEvidence,
          note: "Change supported deadline for fixture.",
        });
        await reviewOpportunity(db.sql, admin, draft.id, {
          action: "publish",
          expectedRevision: 5,
          verified: true,
          note: "Approve synthetic material change.",
        });
        assert.ok(
          (await matchesForUser(db.sql, "a")).items.some(
            (v) => v.id === draft.id,
          ),
        );
        assert.equal((await listTracker(db.sql, "a"))[0].materialChanged, true);
        await updateTracker(db.sql, "a", {
          opportunityId: draft.id,
          expectedVersion: 3,
          action: "dismiss",
        });
        await db.close();
        db = await openDatabase(dir, url);
        assert.ok(
          !(await matchesForUser(db.sql, "a")).items.some(
            (v) => v.id === draft.id,
          ),
        );
        await updateTracker(db.sql, "a", {
          opportunityId: draft.id,
          expectedVersion: 4,
          action: "restore",
        });
        assert.ok(
          (await matchesForUser(db.sql, "a")).items.some(
            (v) => v.id === draft.id,
          ),
        );
        await updateTracker(db.sql, "a", {
          opportunityId: draft.id,
          expectedVersion: 5,
          action: "remove",
        });
        assert.equal((await listSaved(db.sql, "a")).length, 0);
        await saveItem(db.sql, "a", draft.id);
        await reviewOpportunity(db.sql, admin, draft.id, {
          action: "close",
          expectedRevision: 6,
          note: "Close fixture after deadline change.",
        });
        await updateTracker(db.sql, "a", {
          opportunityId: draft.id,
          expectedVersion: 7,
          action: "status",
          status: "applied",
        });
        assert.equal((await listSaved(db.sql, "a"))[0].status, "applied");
        assert.equal((await listSaved(db.sql, "a"))[0].available, false);
        assert.equal((await listSaved(db.sql, "b")).length, 0);
        await db.sql.query(
          "UPDATE opportunities SET verified_at=NOW()-INTERVAL '8 days' WHERE id='synthetic-course'",
        );
        assert.equal((await matchesForUser(db.sql, "a")).total, 0);
      } finally {
        await db.close();
        if (pool) {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          await pool.end();
        }
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
