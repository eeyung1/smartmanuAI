import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import type { Details } from "../src/catalogue/schema";
import {
  detectMaterialChanges,
  materialChangeEventKey,
} from "../src/domain/material-changes";
import { detectMaterialChangeAlerts } from "../src/jobs/material-changes";

const baseDetails = {
  title: "Synthetic alert opportunity",
  organizer: "Synthetic provider",
  summary: "Synthetic material change test opportunity for local testing.",
  category: "course",
  mode: "online",
  country: null,
  teachingLanguage: "en",
  topics: ["smart manufacturing"],
  funding: "fully_funded",
  tuitionCovered: true,
  accommodationCovered: true,
  livingCostsCovered: true,
  participationFree: null,
  applicationFee: null,
  certificateFee: null,
  travelCosts: null,
  coverageDuration: null,
  deadline: "2027-05-20",
  deadlineText: null,
  eligibility: "Synthetic test eligibility details.",
} as const;

test("material-change classifier catches closure, funding loss and date movement", () => {
  const detect = (
    details: Record<string, unknown>,
    state = "published",
    previousFunding: Details["funding"] = baseDetails.funding,
  ) =>
    detectMaterialChanges({
      previousState: "published",
      state,
      previousDetails: { ...baseDetails, funding: previousFunding },
      details: { ...baseDetails, ...details },
    }).map((change) => change.kind);
  assert.deepEqual(detect({}, "closed"), ["program_closed"]);
  assert.deepEqual(detect({ funding: "partial" }), ["funding_withdrawn"]);
  assert.deepEqual(detect({ funding: "unclear" }, "published", "partial"), [
    "funding_withdrawn",
  ]);
  assert.deepEqual(detect({ deadline: "2027-05-10" }), ["deadline_reduced"]);
  assert.deepEqual(detect({ deadline: "2027-06-01" }), ["deadline_extended"]);
  assert.deepEqual(detect({ funding: "unclear", deadline: "2027-05-10" }), [
    "funding_withdrawn",
    "deadline_reduced",
  ]);
  assert.deepEqual(
    detectMaterialChanges({
      previousState: "draft",
      state: "published",
      previousDetails: baseDetails,
      details: baseDetails,
    }),
    [],
  );
});

test("PGlite: queues high-priority alerts once for active saved users", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-material-changes-"));
  const db = await openDatabase(dir);
  try {
    await seedLocalCatalogue(db.sql);
    const reviewer = "local-fixture-reviewer";
    await db.sql.query(
      "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('change-user','Change user','change@example.test',NOW(),NOW())",
    );
    const sourceId = String(
      (
        await db.sql.query(
          "SELECT source_id FROM opportunities WHERE id='synthetic-course'",
        )
      ).rows[0].source_id,
    );
    const draft = await db.sql.query(
      "INSERT INTO opportunities(id,source_id,revision,state,details,evidence,verified_at) VALUES('change-opportunity',$1,1,'published',$2,$3,NOW()) RETURNING id",
      [sourceId, JSON.stringify(baseDetails), JSON.stringify({})],
    );
    const opportunityId = String(draft.rows[0].id);
    await db.sql.query(
      "INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note) VALUES($1,1,'published',$2,$3,$4,'initial publish')",
      [
        opportunityId,
        JSON.stringify(baseDetails),
        JSON.stringify({}),
        reviewer,
      ],
    );
    await db.sql.query(
      "INSERT INTO saved_items(user_id,opportunity_id,status,saved) VALUES('change-user',$1,'applying',true)",
      [opportunityId],
    );
    await db.sql.query(
      "INSERT INTO notification_preferences(user_id,enabled,channel,version,consent_version,material_changes_enabled) VALUES('change-user',true,'email',1,'local-sink-v1',true)",
    );
    const revised = {
      ...baseDetails,
      funding: "unclear",
      deadline: "2027-05-10",
    };
    await db.sql.query(
      "INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note) VALUES($1,2,'published',$2,$3,$4,'material change')",
      [opportunityId, JSON.stringify(revised), JSON.stringify({}), reviewer],
    );
    await db.sql.query(
      "UPDATE opportunities SET revision=2,details=$2,updated_at=NOW() WHERE id=$1",
      [opportunityId, JSON.stringify(revised)],
    );
    const [first, second] = await Promise.all([
      detectMaterialChangeAlerts(db.sql, new Date("2026-11-04T12:00:00Z")),
      detectMaterialChangeAlerts(db.sql, new Date("2026-11-04T12:00:00Z")),
    ]);
    assert.equal(first.scanned, 1);
    assert.equal(first.queued + second.queued, 2);
    assert.equal(first.duplicates + second.duplicates, 2);
    const rows = await db.sql.query(
      "SELECT event_key,payload FROM outbox WHERE user_id='change-user' ORDER BY event_key",
    );
    assert.equal(rows.rows.length, 2);
    for (const row of rows.rows) {
      const payload = row.payload as Record<string, unknown>;
      assert.equal(payload.priority, "high");
      assert.equal(payload.type, "material_change");
      assert.equal(payload.sourceUrl, null, "synthetic sources expose no link");
      assert.match(String(payload.message), /Synthetic alert opportunity/);
    }
    const expectedKeys = [
      materialChangeEventKey({
        userId: "change-user",
        opportunityId,
        revision: 2,
        kind: "deadline_reduced",
      }),
      materialChangeEventKey({
        userId: "change-user",
        opportunityId,
        revision: 2,
        kind: "funding_withdrawn",
      }),
    ].sort();
    assert.deepEqual(
      rows.rows.map((row) => String(row.event_key)).sort(),
      expectedKeys,
    );
    await db.sql.query(
      "UPDATE saved_items SET status='applied' WHERE user_id='change-user'",
    );
    await db.sql.query(
      "INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note) VALUES($1,3,'closed',$2,$3,$4,'closed')",
      [opportunityId, JSON.stringify(revised), JSON.stringify({}), reviewer],
    );
    await db.sql.query(
      "UPDATE opportunities SET revision=3,state='closed',updated_at=NOW() WHERE id=$1",
      [opportunityId],
    );
    assert.equal(
      (await detectMaterialChangeAlerts(db.sql)).queued,
      0,
      "applied users do not receive lifecycle alerts",
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
