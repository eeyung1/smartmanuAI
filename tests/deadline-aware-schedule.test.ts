import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue, fixtureDetails } from "../src/catalogue/fixtures";
import { createSource } from "../src/catalogue/service";
import {
  collectionPolicy,
  scheduleSources,
  researchDashboard,
} from "../src/research/collection";
import { operationsOverview } from "../src/research/operations";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: deadline-aware schedules use daily/weekly UTC rules, wake at the horizon and retain scheduling safeguards`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-deadline-schedule-")),
        schema = "deadline_schedule_" + randomUUID().replaceAll("-", "");
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
        const fixtures: {
          name: string;
          offset: number | null;
          state?: string;
          mode?: string;
          future?: boolean;
        }[] = [
          { name: "near", offset: 7 },
          { name: "edge", offset: 14 },
          { name: "today", offset: 0 },
          { name: "far", offset: 30 },
          { name: "boundary", offset: 15 },
          { name: "undated", offset: null, future: true },
          { name: "closed", offset: 7, state: "closed" },
          { name: "rejected", offset: 7, state: "rejected" },
          { name: "draft", offset: 7, state: "draft" },
          { name: "past", offset: -1 },
          { name: "fixed", offset: 2, mode: "fixed" },
          { name: "fixed-future", offset: 2, mode: "fixed", future: true },
        ];
        const sources: Record<string, string> = {};
        for (const fixture of fixtures) {
          const source = await createSource(db.sql, actor, {
            name: "Schedule " + fixture.name,
            url: "https://school.example.edu/" + fixture.name,
          });
          sources[fixture.name] = source.id;
          await collectionPolicy(db.sql, actor, {
            sourceId: source.id,
            enabled: true,
            permissionNote: "Fixture deadline scheduling; no live collection.",
            cadenceHours: 12,
            ...(fixture.mode ? {} : { scheduleMode: "deadline_aware" }),
          });
          const deadline =
            fixture.offset === null
              ? null
              : (
                  await db.sql.query(
                    "SELECT TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+$1::integer,'YYYY-MM-DD') AS day",
                    [fixture.offset],
                  )
                ).rows[0].day;
          await db.sql.query(
            "INSERT INTO opportunities(id,source_id,revision,state,details,evidence,verified_at) VALUES($1,$2,1,$3,$4,'{}',NOW())",
            [
              "scheduled-" + fixture.name,
              source.id,
              fixture.state ?? "published",
              JSON.stringify({ ...fixtureDetails, deadline }),
            ],
          );
          if (fixture.future)
            await db.sql.query(
              "UPDATE source_collection_policies SET next_due_at=NOW()+INTERVAL '2 days' WHERE source_id=$1",
              [source.id],
            );
        }
        for (const scheduleMode of ["adaptive", "daily", null])
          await assert.rejects(
            collectionPolicy(db.sql, actor, {
              sourceId: sources.near,
              enabled: true,
              permissionNote: "Invalid schedule mode must be rejected.",
              scheduleMode,
            }),
          );
        await assert.rejects(
          db.sql.query(
            "UPDATE source_collection_policies SET schedule_mode='daily' WHERE source_id=$1",
            [sources.near],
          ),
        );
        await assert.rejects(
          collectionPolicy(db.sql, "non-admin", {
            sourceId: sources.near,
            enabled: true,
            permissionNote: "Unauthorized scheduling change.",
            scheduleMode: "fixed",
          }),
          /Administrator/,
        );
        await collectionPolicy(db.sql, actor, {
          sourceId: sources.near,
          enabled: true,
          permissionNote: "Legacy clients preserve the saved mode.",
        });
        assert.equal(
          (await researchDashboard(db.sql, actor)).sources.find(
            (row) => row.id === sources.near,
          )?.schedule_mode,
          "deadline_aware",
        );
        const verification = (
          await db.sql.query(
            "SELECT verified_at::text AS verified FROM opportunities WHERE id='scheduled-near'",
          )
        ).rows[0].verified;
        const together = await Promise.all([
          scheduleSources(db.sql),
          scheduleSources(db.sql),
        ]);
        assert.equal(
          together.reduce((n, count) => n + count, 0),
          11,
        );
        assert.equal(
          (await db.sql.query("SELECT id FROM research_jobs")).rows.length,
          11,
        );
        const policy = async (name: string) =>
          (
            await db.sql.query(
              "SELECT schedule_mode,last_scheduled_at,next_due_at,EXTRACT(EPOCH FROM(next_due_at-last_scheduled_at)) AS seconds FROM source_collection_policies WHERE source_id=$1",
              [sources[name]],
            )
          ).rows[0];
        for (const name of ["near", "edge", "today"])
          assert.equal(Number((await policy(name)).seconds), 86400);
        for (const name of [
          "far",
          "undated",
          "closed",
          "rejected",
          "draft",
          "past",
        ])
          assert.equal(Number((await policy(name)).seconds), 604800);
        assert.equal(Number((await policy("fixed")).seconds), 43200);
        assert.equal((await policy("fixed-future")).last_scheduled_at, null);
        assert.equal(
          (
            await db.sql.query(
              "SELECT next_due_at=(((last_scheduled_at AT TIME ZONE 'UTC')::date+1)::timestamp AT TIME ZONE 'UTC') AS correct FROM source_collection_policies WHERE source_id=$1",
              [sources.boundary],
            )
          ).rows[0].correct,
          true,
        );
        assert.equal(await scheduleSources(db.sql), 0);
        // A newly near deadline advances a previously weekly source once a daily interval has elapsed.
        const tomorrow = (
          await db.sql.query(
            "SELECT TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+1,'YYYY-MM-DD') AS day",
          )
        ).rows[0].day;
        await db.sql.query(
          "UPDATE opportunities SET details=jsonb_set(details,'{deadline}',$2::jsonb) WHERE source_id=$1",
          [sources.far, JSON.stringify(tomorrow)],
        );
        await db.sql.query(
          "UPDATE source_collection_policies SET last_scheduled_at=NOW()-INTERVAL '25 hours',next_due_at=NOW()+INTERVAL '7 days' WHERE source_id=$1",
          [sources.far],
        );
        assert.equal(
          (await operationsOverview(db.sql, actor)).sources.due,
          "1",
        );
        assert.equal(await scheduleSources(db.sql), 1);
        assert.equal(Number((await policy("far")).seconds), 86400);
        assert.equal(
          (await db.sql.query("SELECT id FROM research_jobs")).rows.length,
          11,
          "active jobs are not duplicated",
        );
        await db.sql.query(
          "UPDATE source_collection_policies SET next_due_at=NOW()-INTERVAL '1 hour' WHERE source_id=$1",
          [sources.near],
        );
        await db.sql.query(
          "INSERT INTO source_retry_after(source_id,retry_after_at,requires_review) VALUES($1,NOW()+INTERVAL '1 day',false)",
          [sources.near],
        );
        assert.equal(await scheduleSources(db.sql), 0);
        await db.sql.query(
          "UPDATE source_retry_after SET retry_after_at=NULL,requires_review=true WHERE source_id=$1",
          [sources.near],
        );
        assert.equal(await scheduleSources(db.sql), 0);
        await db.sql.query(
          "DELETE FROM source_retry_after WHERE source_id=$1",
          [sources.near],
        );
        assert.equal(await scheduleSources(db.sql), 1);
        await collectionPolicy(db.sql, actor, {
          sourceId: sources.near,
          enabled: false,
          permissionNote: "Paused sources remain unscheduled.",
        });
        await db.sql.query(
          "UPDATE source_collection_policies SET next_due_at=NOW()-INTERVAL '1 hour' WHERE source_id=$1",
          [sources.near],
        );
        assert.equal(await scheduleSources(db.sql), 0);
        assert.equal(
          (
            await db.sql.query(
              "SELECT verified_at::text AS verified FROM opportunities WHERE id='scheduled-near'",
            )
          ).rows[0].verified,
          verification,
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
