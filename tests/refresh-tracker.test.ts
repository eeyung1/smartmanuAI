import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Pool } from "pg";
import OperationsSummary from "../app/admin/operations/summary";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import { createSource } from "../src/catalogue/service";
import { openDatabase } from "../src/db";
import { operationsOverview } from "../src/research/operations";
import { trackSourceRefreshCycle } from "../src/research/refresh-tracker";

for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: shared refresh tracking covers enabled non-synthetic sources without exposing source or account data`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-refresh-tracker-")),
        schema = "refresh_tracker_" + randomUUID().replaceAll("-", "");
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
        assert.deepEqual(await trackSourceRefreshCycle(db.sql), {
          lastCompleteRefreshAt: null,
          totalSources: "0",
          completedSources: "0",
          overdueCount: "0",
        });

        const sourceIds: string[] = [];
        for (let index = 0; index < 3; index++) {
          const source = await createSource(db.sql, actor, {
            name: `Private refresh source ${index}`,
            url: `https://refresh${index}.example.edu/private-path`,
          });
          sourceIds.push(source.id);
          await db.sql.query(
            "INSERT INTO source_collection_policies(source_id,enabled,permission_note,actor_id,next_due_at) VALUES($1,true,'Reviewed refresh fixture; no live request.',$2,NOW()+($3::text||' hours')::interval)",
            [source.id, actor, index === 0 ? -1 : index],
          );
        }
        // Even a malformed direct policy row for a synthetic source cannot affect totals.
        const syntheticSourceId = String(
          (
            await db.sql.query(
              "SELECT id FROM sources WHERE synthetic ORDER BY id LIMIT 1",
            )
          ).rows[0].id,
        );
        await db.sql.query(
          "INSERT INTO source_collection_policies(source_id,enabled,permission_note,actor_id) VALUES($1,true,'Synthetic source remains excluded.',$2)",
          [syntheticSourceId, actor],
        );

        for (let index = 0; index < 2; index++)
          await db.sql.query(
            "INSERT INTO source_snapshots(id,source_id,content_hash,content,last_seen_at) VALUES($1,$2,$1,$3,NOW()-($4::text||' hours')::interval)",
            [
              `refresh-snapshot-${index}`,
              sourceIds[index],
              "captured source content must not appear",
              index + 1,
            ],
          );
        // A future timestamp is not accepted as successful observation evidence.
        await db.sql.query(
          "INSERT INTO source_snapshots(id,source_id,content_hash,content,last_seen_at) VALUES('refresh-future',$1,'refresh-future','future',NOW()+INTERVAL '1 day')",
          [sourceIds[2]],
        );

        const incomplete = await trackSourceRefreshCycle(db.sql);
        assert.deepEqual(incomplete, {
          lastCompleteRefreshAt: null,
          totalSources: "3",
          completedSources: "2",
          overdueCount: "1",
        });

        await db.sql.query(
          "INSERT INTO source_snapshots(id,source_id,content_hash,content,last_seen_at) VALUES('refresh-complete',$1,'refresh-complete','private request token',NOW()-INTERVAL '30 minutes')",
          [sourceIds[2]],
        );
        // The latest successful observation for source 1 is used, not its older row.
        await db.sql.query(
          "INSERT INTO source_snapshots(id,source_id,content_hash,content,last_seen_at) VALUES('refresh-newer',$1,'refresh-newer','newer',NOW()-INTERVAL '10 minutes')",
          [sourceIds[0]],
        );
        const complete = await trackSourceRefreshCycle(db.sql);
        assert.equal(complete.totalSources, "3");
        assert.equal(complete.completedSources, "3");
        assert.equal(complete.overdueCount, "1");
        assert.match(complete.lastCompleteRefreshAt ?? "", /Z$/);
        const expectedWatermark = String(
          (
            await db.sql.query(
              "SELECT to_char(MAX(last_seen_at) AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS at FROM source_snapshots WHERE source_id=$1 AND last_seen_at<=NOW()",
              [sourceIds[1]],
            )
          ).rows[0].at,
        );
        assert.equal(complete.lastCompleteRefreshAt, expectedWatermark);
        assert.doesNotMatch(
          JSON.stringify(complete),
          /private|example\.edu|content|token|actor|email/i,
        );

        const overview = await operationsOverview(db.sql, actor);
        for (const [locale, heading, emptyMessage] of [
          [
            "en",
            "Shared source refresh",
            "No complete shared refresh recorded",
          ],
          ["zh-Hans", "共享来源刷新", "尚未记录完整共享刷新"],
        ] as const) {
          const completeHtml = renderToStaticMarkup(
            createElement(OperationsSummary, {
              data: overview,
              locale,
              refresh: complete,
            }),
          );
          assert.match(completeHtml, new RegExp(heading));
          assert.match(completeHtml, /3/);
          assert.match(completeHtml, /1/);
          assert.doesNotMatch(
            completeHtml,
            /example\.edu|private request token/,
          );

          const incompleteHtml = renderToStaticMarkup(
            createElement(OperationsSummary, {
              data: overview,
              locale,
              refresh: incomplete,
            }),
          );
          assert.match(incompleteHtml, new RegExp(emptyMessage));
        }
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
