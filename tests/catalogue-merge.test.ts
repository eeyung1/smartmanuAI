import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { POST } from "../app/api/admin/opportunities/[id]/merge/route";
import { openDatabase } from "../src/db";
import {
  createDraft,
  createSource,
  reviewOpportunity,
} from "../src/catalogue/service";
import {
  fixtureDetails,
  fixtureEvidence,
  seedLocalCatalogue,
} from "../src/catalogue/fixtures";
import { auditHistory } from "../src/catalogue/history";
import { mergeDuplicateOpportunity } from "../src/domain/catalogue-merge";
import { saveItem } from "../src/domain/profile";

process.env.SMARTMANU_MODE ??= "local";
process.env.BETTER_AUTH_URL ??= "http://127.0.0.1:3000";
process.env.BETTER_AUTH_SECRET ??= randomUUID() + randomUUID();

test("admin duplicate merge enforces origin protection", async () => {
  const response = await POST(
    new Request(
      "http://127.0.0.1:3000/api/admin/opportunities/duplicate/merge",
      {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      },
    ),
    { params: Promise.resolve({ id: "duplicate" }) },
  );
  assert.equal(response.status, 403);
});

for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: duplicate merge preserves latest tracker choices, source audit and is idempotent`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-catalogue-merge-")),
        schema = "merge_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", `-c search_path=${schema}`);
        url = parsed.href;
      }
      const db = await openDatabase(dir, url);
      try {
        await seedLocalCatalogue(db.sql);
        const actor = "local-fixture-reviewer",
          targetId = "synthetic-course";
        const duplicateSource = await createSource(db.sql, actor, {
          name: "Duplicate opportunity source",
          url: "https://example.test/duplicate-source",
          synthetic: false,
        });
        const duplicate = await createDraft(db.sql, actor, {
          sourceId: duplicateSource.id,
          details: { ...fixtureDetails, title: "Duplicate course listing" },
          evidence: fixtureEvidence,
          note: "Create duplicate listing for merge test.",
        });
        await reviewOpportunity(db.sql, actor, duplicate.id, {
          action: "publish",
          expectedRevision: 1,
          verified: true,
          note: "Verify duplicate listing source.",
        });
        await db.sql.query(
          "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('progress-user','Progress user','progress@example.test',NOW(),NOW()),('dismissed-user','Dismissed user','dismissed@example.test',NOW(),NOW()),('moved-user','Moved user','moved@example.test',NOW(),NOW()),('late-user','Concurrent saver','late@example.test',NOW(),NOW())",
        );
        await db.sql.query(
          "INSERT INTO saved_items(user_id,opportunity_id,status,saved,dismissed_fingerprint,version) VALUES('progress-user',$1,'applied',true,NULL,2),('progress-user',$2,'applying',true,NULL,4),('dismissed-user',$1,'applied',false,'old-dismissal',3),('dismissed-user',$2,'interested',true,NULL,5),('moved-user',$1,'applying',true,NULL,7)",
          [duplicate.id, targetId],
        );

        await db.sql.query(
          "UPDATE saved_items SET updated_at=CASE WHEN opportunity_id=$1 THEN '2026-01-01T00:00:00.000001Z'::timestamptz ELSE '2026-01-01T00:00:00.000002Z'::timestamptz END",
          [duplicate.id],
        );
        await db.sql.query(
          "UPDATE saved_items SET updated_at='2026-01-01T00:00:00.000003Z' WHERE user_id='dismissed-user' AND opportunity_id=$1",
          [duplicate.id],
        );
        await db.sql.query(
          "INSERT INTO saved_items(user_id,opportunity_id,status,saved,version,updated_at) VALUES('moved-user',$1,'interested',true,1,'2026-01-01T00:00:00.000001Z')",
          [targetId],
        );
        const input = {
          targetOpportunityId: targetId,
          expectedDuplicateRevision: 2,
          expectedTargetRevision: 2,
          note: "The official source confirms these are duplicate listings.",
        };
        await db.sql.query(
          "UPDATE opportunities SET details=jsonb_set(details,'{offeringIdentity}',to_jsonb($2::text)) WHERE id=$1",
          [duplicate.id, "Autumn 2027"],
        );
        await db.sql.query(
          "UPDATE opportunities SET details=jsonb_set(details,'{offeringIdentity}',to_jsonb($2::text)) WHERE id=$1",
          [targetId, "Autumn 2026"],
        );
        await assert.rejects(
          () => mergeDuplicateOpportunity(db.sql, actor, duplicate.id, input),
          /Different intake/,
        );
        assert.equal(
          (
            await db.sql.query("SELECT state FROM opportunities WHERE id=$1", [
              duplicate.id,
            ])
          ).rows[0].state,
          "published",
        );
        // Formatting-only differences identify the same edition; no date/title inference.
        await db.sql.query(
          "UPDATE opportunities SET details=jsonb_set(details,'{offeringIdentity}',to_jsonb($2::text)) WHERE id=$1",
          [targetId, " autumn   2027 "],
        );
        const outcomes = await Promise.allSettled([
          mergeDuplicateOpportunity(db.sql, actor, duplicate.id, input),
          mergeDuplicateOpportunity(db.sql, actor, duplicate.id, input),
          saveItem(db.sql, "late-user", duplicate.id),
        ]);
        const results = outcomes
          .slice(0, 2)
          .flatMap((result) =>
            result.status === "fulfilled" &&
            typeof result.value === "object" &&
            result.value !== null
              ? [result.value]
              : [],
          );
        assert.equal(results.length, 2);
        assert.equal(
          results.filter((result) => result.alreadyMerged).length,
          1,
        );
        const firstMerge = results.find((result) => !result.alreadyMerged)!;
        assert.ok(
          firstMerge.movedTrackerItems === 3 ||
            firstMerge.movedTrackerItems === 4,
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT state,revision FROM opportunities WHERE id=$1",
              [duplicate.id],
            )
          ).rows[0].state,
          "archived",
        );
        const rows = (
          await db.sql.query(
            "SELECT user_id,status,saved,dismissed_fingerprint,version FROM saved_items WHERE opportunity_id=$1 ORDER BY user_id",
            [targetId],
          )
        ).rows;
        const lateSave = await db.sql.query(
          "SELECT opportunity_id FROM saved_items WHERE user_id='late-user'",
        );
        if (outcomes[2].status === "rejected")
          assert.match(String(outcomes[2].reason), /unavailable/i);
        else assert.equal(lateSave.rows.length, 1);
        assert.ok(
          lateSave.rows.every((row) => row.opportunity_id === targetId),
          "a concurrent save must either be merged onto the survivor or rejected after archival",
        );
        const byUser = new Map(rows.map((row) => [row.user_id, row]));
        assert.equal(byUser.get("dismissed-user")?.status, "applied");
        assert.equal(byUser.get("dismissed-user")?.saved, false);
        assert.equal(
          byUser.get("dismissed-user")?.dismissed_fingerprint,
          "old-dismissal",
        );
        assert.equal(byUser.get("moved-user")?.status, "interested");
        assert.equal(Number(byUser.get("moved-user")?.version), 8);
        assert.equal(byUser.get("progress-user")?.status, "applying");
        assert.equal(Number(byUser.get("progress-user")?.version), 5);
        assert.ok(rows.length === 3 || rows.length === 4);
        assert.equal(
          (
            await db.sql.query(
              "SELECT updated_at='2026-01-01T00:00:00.000002Z'::timestamptz AS preserved FROM saved_items WHERE user_id='progress-user' AND opportunity_id=$1",
              [targetId],
            )
          ).rows[0].preserved,
          true,
          "merge must preserve the exact latest user-choice timestamp",
        );
        const duplicateRevision = (
          await db.sql.query(
            "SELECT state,note FROM opportunity_revisions WHERE opportunity_id=$1 ORDER BY revision DESC LIMIT 1",
            [duplicate.id],
          )
        ).rows[0];
        const targetRevision = (
          await db.sql.query(
            "SELECT state,note FROM opportunity_revisions WHERE opportunity_id=$1 ORDER BY revision DESC LIMIT 1",
            [targetId],
          )
        ).rows[0];
        assert.equal(duplicateRevision.state, "archived");
        assert.match(
          String(duplicateRevision.note),
          /official source confirms/,
        );
        assert.match(String(targetRevision.note), new RegExp(duplicate.id));
        assert.match(
          String(targetRevision.note),
          /https:\/\/example\.test\/duplicate-source/,
        );
        const aliases = await auditHistory(db.sql, actor, targetId);
        assert.equal(aliases.sourceAliases.length, 1);
        assert.equal(
          aliases.sourceAliases[0].url,
          "https://example.test/duplicate-source",
        );
        assert.equal(aliases.aliasesTruncated, false);
        await assert.rejects(
          () => auditHistory(db.sql, "not-admin", targetId),
          /Administrator/,
        );
        // A later merge transfers both its primary source and inherited aliases.
        const thirdSource = await createSource(db.sql, actor, {
          name: "Third canonical source",
          url: "https://example.test/final-source",
        });
        const third = await createDraft(db.sql, actor, {
          sourceId: thirdSource.id,
          details: { ...fixtureDetails, offeringIdentity: "Autumn 2027" },
          evidence: fixtureEvidence,
          note: "Canonical chain fixture.",
        });
        await reviewOpportunity(db.sql, actor, third.id, {
          action: "publish",
          expectedRevision: 1,
          verified: true,
          note: "Approve canonical chain fixture.",
        });
        await mergeDuplicateOpportunity(db.sql, actor, targetId, {
          targetOpportunityId: third.id,
          expectedDuplicateRevision: 3,
          expectedTargetRevision: 2,
          note: "Reviewed duplicate chain source evidence.",
        });
        const chain = await auditHistory(db.sql, actor, third.id);
        assert.equal(chain.sourceAliases.length, 2);
        assert.ok(
          chain.sourceAliases.some(
            (source) => source.synthetic && source.url === null,
          ),
        );
        assert.ok(
          chain.sourceAliases.some(
            (source) => source.url === "https://example.test/duplicate-source",
          ),
        );
        assert.equal(
          (await auditHistory(db.sql, actor, targetId)).sourceAliases.length,
          0,
        );
        await assert.rejects(
          () =>
            mergeDuplicateOpportunity(db.sql, "not-admin", duplicate.id, input),
          /Administrator/,
        );
        await assert.rejects(
          () =>
            mergeDuplicateOpportunity(db.sql, actor, duplicate.id, {
              ...input,
              targetOpportunityId: duplicate.id,
            }),
          /different surviving opportunity/,
        );
      } finally {
        await db.close();
        await pool?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await pool?.end();
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
