import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import {
  seedLocalCatalogue,
  fixtureDetails,
  fixtureEvidence,
} from "../src/catalogue/fixtures";
import { createDraft, reviewOpportunity } from "../src/catalogue/service";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: reviewed editions retain lineage across drafts and preserve saved progress`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "offering-lineage-")),
        schema = "lineage_" + randomUUID().replaceAll("-", "");
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
          sourceId = (
            await db.sql.query(
              "SELECT source_id FROM opportunities WHERE id='synthetic-course'",
            )
          ).rows[0].source_id;
        const draft = await createDraft(db.sql, actor, {
          sourceId,
          details: { ...fixtureDetails, offeringIdentity: "Autumn 2026" },
          evidence: fixtureEvidence,
          note: "Draft edition fixture.",
        });
        const revise = (
          id: string,
          expectedRevision: number,
          offeringIdentity?: string | null,
        ) =>
          reviewOpportunity(db.sql, actor, id, {
            action: "revise",
            expectedRevision,
            details: {
              ...fixtureDetails,
              ...(offeringIdentity === undefined ? {} : { offeringIdentity }),
            },
            evidence: fixtureEvidence,
            note: "Review edition source evidence.",
          });
        await revise(draft.id, 1, "Autumn 2027"); // Never published: labels can change.
        await reviewOpportunity(db.sql, actor, draft.id, {
          action: "publish",
          expectedRevision: 2,
          verified: true,
          note: "Approve current edition evidence.",
        });
        await db.sql.query(
          "INSERT INTO saved_items(user_id,opportunity_id,status,saved) VALUES($1,$2,'applied',true)",
          [actor, draft.id],
        );
        for (const identity of ["Autumn 2028", null, undefined])
          await assert.rejects(
            () => revise(draft.id, 3, identity),
            /cannot be replaced or cleared/,
          );
        const unchanged = (
          await db.sql.query(
            "SELECT revision,state,details FROM opportunities WHERE id=$1",
            [draft.id],
          )
        ).rows[0];
        assert.equal(unchanged.revision, 3);
        assert.equal(unchanged.state, "published");
        assert.equal(
          (unchanged.details as { offeringIdentity: string }).offeringIdentity,
          "Autumn 2027",
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT * FROM opportunity_revisions WHERE opportunity_id=$1",
              [draft.id],
            )
          ).rows.length,
          3,
        );
        await revise(draft.id, 3, " autumn   2027 ");
        await assert.rejects(
          () => revise(draft.id, 4, "Autumn 2028"),
          /cannot be replaced or cleared/,
        );
        await reviewOpportunity(db.sql, actor, draft.id, {
          action: "publish",
          expectedRevision: 4,
          verified: true,
          note: "Approve formatting-only correction.",
        });
        await reviewOpportunity(db.sql, actor, draft.id, {
          action: "close",
          expectedRevision: 5,
          note: "Source confirms edition closure.",
        });
        await assert.rejects(
          () => revise(draft.id, 6, "Autumn 2028"),
          /cannot be replaced or cleared/,
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT status FROM saved_items WHERE user_id=$1 AND opportunity_id=$2",
              [actor, draft.id],
            )
          ).rows[0].status,
          "applied",
        );
        // Existing unknown-edition records may acquire a reviewed label.
        await revise("synthetic-course", 2, "Source edition 2027");
        await reviewOpportunity(db.sql, actor, "synthetic-course", {
          action: "publish",
          expectedRevision: 3,
          verified: true,
          note: "Approve newly documented edition.",
        });
        await assert.rejects(
          () => revise("synthetic-course", 4, null),
          /cannot be replaced or cleared/,
        );
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
