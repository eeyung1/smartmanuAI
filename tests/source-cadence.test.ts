import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import { createSource } from "../src/catalogue/service";
import {
  collectionPolicy,
  scheduleSources,
  researchDashboard,
} from "../src/research/collection";
import { selectedResearchData } from "../src/research/browse";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: per-source collection cadence preserves defaults, due dates, holds and scheduler deduplication`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-cadence-")),
        schema = "cadence_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", `-c search_path=${schema}`);
        url = parsed.href;
      }
      const db = await openDatabase(dir, url),
        actor = "local-fixture-reviewer";
      try {
        await seedLocalCatalogue(db.sql);
        const sources: { id: string }[] = [];
        for (const hours of [6, 24, 168]) {
          const source = await createSource(db.sql, actor, {
            name: "Cadence " + hours,
            url: `https://school.example.edu/cadence-${hours}`,
          });
          sources.push(source);
          await collectionPolicy(db.sql, actor, {
            sourceId: source.id,
            enabled: true,
            permissionNote: "Fixture permission review; no network collection.",
            ...(hours === 24 ? {} : { cadenceHours: hours }),
          });
        }
        const policy = (id: string) =>
          db.sql.query(
            "SELECT cadence_hours,next_due_at::text AS due FROM source_collection_policies WHERE source_id=$1",
            [id],
          );
        assert.equal((await policy(sources[1].id)).rows[0].cadence_hours, 24);
        for (const invalid of [0, 5, 169, 6.5, "24", null])
          await assert.rejects(
            collectionPolicy(db.sql, actor, {
              sourceId: sources[0].id,
              enabled: true,
              permissionNote: "Invalid cadence must be refused.",
              cadenceHours: invalid,
            }),
          );
        await assert.rejects(
          db.sql.query(
            "UPDATE source_collection_policies SET cadence_hours=1 WHERE source_id=$1",
            [sources[0].id],
          ),
        );
        await assert.rejects(
          collectionPolicy(db.sql, "non-admin", {
            sourceId: sources[0].id,
            enabled: false,
            permissionNote: "No unauthorized policy updates.",
            cadenceHours: 24,
          }),
          /Administrator/,
        );
        const initialDue = (await policy(sources[0].id)).rows[0].due;
        await collectionPolicy(db.sql, actor, {
          sourceId: sources[0].id,
          enabled: true,
          permissionNote: "Legacy client preserves cadence and due date.",
        });
        assert.equal((await policy(sources[0].id)).rows[0].cadence_hours, 6);
        assert.equal((await policy(sources[0].id)).rows[0].due, initialDue);
        await Promise.all([scheduleSources(db.sql), scheduleSources(db.sql)]);
        assert.equal(
          (await db.sql.query("SELECT id FROM research_jobs")).rows.length,
          3,
        );
        for (const [index, hours] of [6, 24, 168].entries()) {
          const row = (
            await db.sql.query(
              "SELECT EXTRACT(EPOCH FROM (next_due_at-NOW()))/3600 AS hours FROM source_collection_policies WHERE source_id=$1",
              [sources[index].id],
            )
          ).rows[0];
          assert.ok(Math.abs(Number(row.hours) - hours) < 0.01);
        }
        const before = (await policy(sources[2].id)).rows[0].due;
        await collectionPolicy(db.sql, actor, {
          sourceId: sources[2].id,
          enabled: true,
          permissionNote:
            "Use a shorter future interval without resetting current work.",
          cadenceHours: 12,
        });
        assert.equal((await policy(sources[2].id)).rows[0].due, before);
        assert.equal(
          (await researchDashboard(db.sql, actor)).sources.find(
            (s) => s.id === sources[2].id,
          )?.cadence_hours,
          12,
        );
        assert.equal(
          (
            await selectedResearchData(db.sql, actor, { source: sources[2].id })
          ).data.sources.find((s) => s.id === sources[2].id)?.cadence_hours,
          12,
        );
        await db.sql.query(
          "UPDATE source_collection_policies SET next_due_at=NOW()-INTERVAL '1 hour'",
        );
        await db.sql.query(
          "INSERT INTO source_retry_after(source_id,retry_after_at,requires_review) VALUES($1,NOW()+INTERVAL '2 days',false),($2,NULL,true)",
          [sources[0].id, sources[1].id],
        );
        const heldDue = (await policy(sources[0].id)).rows[0].due;
        await scheduleSources(db.sql);
        assert.equal(
          (await policy(sources[0].id)).rows[0].due,
          heldDue,
          "future Retry-After still gates collection",
        );
        assert.equal(
          (await db.sql.query("SELECT id FROM research_jobs")).rows.length,
          3,
          "an active job is not duplicated",
        );
        const nextHours = (
          await db.sql.query(
            "SELECT EXTRACT(EPOCH FROM (next_due_at-NOW()))/3600 AS hours FROM source_collection_policies WHERE source_id=$1",
            [sources[2].id],
          )
        ).rows[0].hours;
        assert.ok(Math.abs(Number(nextHours) - 12) < 0.01);
        await db.sql.query(
          "UPDATE research_jobs SET state='done' WHERE source_id=$1",
          [sources[2].id],
        );
        await db.sql.query(
          "UPDATE source_collection_policies SET next_due_at=NOW()-INTERVAL '1 hour' WHERE source_id=$1",
          [sources[2].id],
        );
        await Promise.all([
          scheduleSources(db.sql),
          collectionPolicy(db.sql, actor, {
            sourceId: sources[2].id,
            enabled: true,
            permissionNote:
              "Concurrent operator review and scheduling retain cadence.",
          }),
        ]);
        await collectionPolicy(db.sql, actor, {
          sourceId: sources[2].id,
          enabled: false,
          permissionNote:
            "Pause collection while retaining the configured cadence.",
        });
        assert.equal((await policy(sources[2].id)).rows[0].cadence_hours, 12);
        assert.equal(
          (
            await db.sql.query(
              "SELECT state FROM research_jobs WHERE source_id=$1 AND state='cancelled'",
              [sources[2].id],
            )
          ).rows[0].state,
          "cancelled",
        );
      } finally {
        await db.close();
        await rm(dir, { recursive: true, force: true });
        if (pool) {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          await pool.end();
        }
      }
    },
  );
