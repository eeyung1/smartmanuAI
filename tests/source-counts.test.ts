import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import { createSource, listPublic } from "../src/catalogue/service";
import { sourceJobCounts } from "../src/research/source-counts";
import { researchDashboard } from "../src/research/collection";
import { selectedResearchData } from "../src/research/browse";
import { screenText } from "../src/i18n/screens";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: source counters cover retained job states beyond recent windows without counting retry attempts as failures`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-source-counts-")),
        schema = "counts_" + randomUUID().replaceAll("-", "");
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
        const a = await createSource(db.sql, actor, {
          name: "Counters source A",
          url: "https://school.example.edu/counts-a",
        });
        const b = await createSource(db.sql, actor, {
          name: "Counters source B",
          url: "https://school.example.edu/counts-b",
        });
        const empty = await createSource(db.sql, actor, {
          name: "Unused source",
          url: "https://school.example.edu/unused",
        });
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id,state,attempts,created_at) SELECT 'old-'||n,$1,'done',3,'2000-01-01' FROM generate_series(1,70) n",
          [a.id],
        );
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id,state,attempts,error_code) VALUES('a-failed',$1,'failed',3,'collection_failed'),('a-cancelled',$1,'cancelled',1,NULL),('a-retrying',$1,'queued',2,'source_rate_limited'),('b-running',$2,'running',1,NULL)",
          [a.id, b.id],
        );
        const all = await sourceJobCounts(db.sql, actor, [
          a.id,
          b.id,
          empty.id,
          a.id,
        ]);
        assert.deepEqual(all[a.id], {
          total: "73",
          completed: "70",
          failed: "1",
          active: "1",
          cancelled: "1",
        });
        assert.deepEqual(all[b.id], {
          total: "1",
          completed: "0",
          failed: "0",
          active: "1",
          cancelled: "0",
        });
        assert.deepEqual(all[empty.id], {
          total: "0",
          completed: "0",
          failed: "0",
          active: "0",
          cancelled: "0",
        });
        assert.equal(Object.keys(all).length, 3);
        assert.deepEqual(await sourceJobCounts(db.sql, actor, [a.id]), {
          [a.id]: all[a.id],
        });
        await assert.rejects(
          sourceJobCounts(db.sql, "non-admin", [a.id]),
          /Administrator/,
        );
        await assert.rejects(
          sourceJobCounts(db.sql, "non-admin", []),
          /Administrator/,
        );
        const dashboard = await researchDashboard(db.sql, actor);
        assert.equal(dashboard.jobs.length, 50);
        assert.deepEqual(
          dashboard.sources.find((source) => source.id === a.id)
            ?.collection_counts,
          all[a.id],
        );
        // Current-state counters change once when an active retry completes, not once per attempt.
        await db.sql.query(
          "UPDATE research_jobs SET state='done',error_code=NULL WHERE id='a-retrying'",
        );
        assert.deepEqual((await sourceJobCounts(db.sql, actor, [a.id]))[a.id], {
          total: "73",
          completed: "71",
          failed: "1",
          active: "0",
          cancelled: "1",
        });
        // Counters also work when selecting an original source outside the latest 100 sources.
        await db.sql.query(
          "UPDATE sources SET created_at='2000-01-01' WHERE id=$1",
          [a.id],
        );
        await db.sql.query(
          "INSERT INTO sources(id,name,url,created_by) SELECT x.id,'Newer source','https://school.example.edu/'||x.id,$2 FROM jsonb_to_recordset($1::jsonb) AS x(id text)",
          [
            JSON.stringify(
              Array.from({ length: 101 }, () => ({ id: randomUUID() })),
            ),
            actor,
          ],
        );
        assert.ok(
          !(await researchDashboard(db.sql, actor)).sources.some(
            (source) => source.id === a.id,
          ),
        );
        const selected = (
          await selectedResearchData(db.sql, actor, { source: a.id })
        ).data.sources.find((source) => source.id === a.id);
        assert.deepEqual(
          selected?.collection_counts,
          (await sourceJobCounts(db.sql, actor, [a.id]))[a.id],
        );
        assert.doesNotMatch(
          JSON.stringify(await listPublic(db.sql)),
          /collection_counts|a-retrying/,
        );
        for (const label of [
          "Collection job counts",
          "Total stored jobs",
          "Completed collection jobs",
          "Failed collection jobs",
          "Active collection jobs",
          "Cancelled collection jobs",
        ])
          assert.notEqual(screenText("zh-Hans", label), label);
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
