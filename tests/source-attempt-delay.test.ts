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
  claimCollection,
  failCollection,
  finishCollection,
  scheduleSources,
} from "../src/research/collection";
import { operationsOverview } from "../src/research/operations";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: source attempt delay persists across jobs/restarts, preserves gates and fences concurrent/reclaimed attempts`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-source-delay-")),
        schema = "source_delay_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", `-c search_path=${schema}`);
        url = parsed.href;
      }
      let db = await openDatabase(dir, url);
      const actor = "local-fixture-reviewer";
      try {
        await seedLocalCatalogue(db.sql);
        const a = await createSource(db.sql, actor, {
          name: "Delayed source",
          url: "https://school.example.edu/delayed",
        });
        const b = await createSource(db.sql, actor, {
          name: "Independent source",
          url: "https://school.example.edu/independent",
        });
        const save = (changes: Record<string, unknown> = {}) =>
          collectionPolicy(db.sql, actor, {
            sourceId: a.id,
            enabled: true,
            permissionNote: "Fixture policy review; no network requests.",
            ...changes,
          });
        await save();
        await collectionPolicy(db.sql, actor, {
          sourceId: b.id,
          enabled: true,
          permissionNote: "Independent fixture, no network requests.",
        });
        const policy = () =>
          db.sql.query(
            "SELECT request_delay_seconds,last_request_at::text AS last FROM source_collection_policies WHERE source_id=$1",
            [a.id],
          );
        assert.equal((await policy()).rows[0].request_delay_seconds, 0);
        for (const requestDelaySeconds of [-1, 3601, 1.5, "60", null])
          await assert.rejects(save({ requestDelaySeconds }));
        await assert.rejects(
          db.sql.query(
            "UPDATE source_collection_policies SET request_delay_seconds=-1 WHERE source_id=$1",
            [a.id],
          ),
        );
        await assert.rejects(
          collectionPolicy(db.sql, "non-admin", {
            sourceId: a.id,
            enabled: false,
            permissionNote: "Unauthorized delay edit must fail.",
            requestDelaySeconds: 1,
          }),
          /Administrator/,
        );
        await save({ requestDelaySeconds: 3600 });
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id) VALUES('delay-first',$1)",
          [a.id],
        );
        const first = await claimCollection(db.sql);
        assert.equal(first?.sourceId, a.id);
        assert.ok(first);
        const last = (await policy()).rows[0].last;
        assert.ok(last);
        await failCollection(db.sql, first, Error("Fixture retry"));
        await db.sql.query(
          "UPDATE research_jobs SET available_at=NOW()-INTERVAL '1 second' WHERE id='delay-first'",
        );
        assert.equal(await claimCollection(db.sql), null);
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.queuedReady,
          "0",
        );
        // The same hostname is deliberately not a shared host-wide limiter in this feature.
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id) VALUES('independent-first',$1)",
          [b.id],
        );
        const independent = await claimCollection(db.sql);
        assert.equal(independent?.sourceId, b.id);
        assert.ok(independent);
        await finishCollection(
          db.sql,
          independent,
          "Independent fixture collection content.",
        );
        await save({ cadenceHours: 12 });
        assert.equal((await policy()).rows[0].request_delay_seconds, 3600);
        assert.equal((await policy()).rows[0].last, last);
        await db.close();
        db = await openDatabase(dir, url);
        assert.equal(
          await claimCollection(db.sql),
          null,
          "cooldown survives restart",
        );
        await db.sql.query(
          "UPDATE source_collection_policies SET last_request_at=NOW()-INTERVAL '2 hours' WHERE source_id=$1",
          [a.id],
        );
        await db.sql.query(
          "INSERT INTO source_retry_after(source_id,retry_after_at,requires_review) VALUES($1,NOW()+INTERVAL '1 day',false)",
          [a.id],
        );
        assert.equal(
          await claimCollection(db.sql),
          null,
          "Retry-After still wins after cooldown",
        );
        await db.sql.query(
          "UPDATE source_retry_after SET retry_after_at=NULL,requires_review=true WHERE source_id=$1",
          [a.id],
        );
        assert.equal(
          await claimCollection(db.sql),
          null,
          "operator review still gates claims",
        );
        await db.sql.query(
          "DELETE FROM source_retry_after WHERE source_id=$1",
          [a.id],
        );
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.queuedReady,
          "1",
        );
        const second = await claimCollection(db.sql);
        assert.ok(second);
        await db.sql.query(
          "UPDATE research_jobs SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1",
          [second.id],
        );
        assert.equal(
          await claimCollection(db.sql),
          null,
          "expired leases cannot bypass cooldown",
        );
        await db.sql.query(
          "UPDATE source_collection_policies SET last_request_at=NOW()-INTERVAL '2 hours' WHERE source_id=$1",
          [a.id],
        );
        const competing = await Promise.all([
          claimCollection(db.sql),
          claimCollection(db.sql),
        ]);
        assert.equal(competing.filter(Boolean).length, 1);
        const current = competing.find(Boolean)!;
        assert.equal(
          await finishCollection(db.sql, second, "Late stale-worker content."),
          "discarded",
        );
        assert.equal(
          await finishCollection(
            db.sql,
            current,
            "Current claimed fixture content.",
          ),
          "captured",
        );
        await collectionPolicy(db.sql, actor, {
          sourceId: b.id,
          enabled: false,
          permissionNote: "Pause the independent fixture.",
        });
        await db.sql.query(
          "UPDATE source_collection_policies SET next_due_at=NOW()-INTERVAL '1 hour' WHERE source_id=$1",
          [a.id],
        );
        await scheduleSources(db.sql);
        assert.equal(
          await claimCollection(db.sql),
          null,
          "new scheduled jobs share the persisted per-source delay",
        );
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.queuedReady,
          "0",
        );
        // Exhausted cleanup and scheduling must not invert policy/job lock order across sources.
        const cleanupSource = await createSource(db.sql, actor, {
          name: "Cleanup contention source",
          url: "https://school.example.edu/cleanup",
        });
        const readySource = await createSource(db.sql, actor, {
          name: "Ready contention source",
          url: "https://school.example.edu/ready",
        });
        for (const source of [cleanupSource, readySource])
          await collectionPolicy(db.sql, actor, {
            sourceId: source.id,
            enabled: true,
            permissionNote: "Concurrent schedule/cleanup fixture only.",
          });
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id,state,attempts,lease_until) VALUES('cleanup-exhausted',$1,'running',3,NOW()-INTERVAL '1 hour'),('ready-contention',$2,'queued',0,NULL)",
          [cleanupSource.id, readySource.id],
        );
        await Promise.all([scheduleSources(db.sql), claimCollection(db.sql)]);
        assert.equal(
          (
            await db.sql.query(
              "SELECT state FROM research_jobs WHERE id='cleanup-exhausted'",
            )
          ).rows[0].state,
          "failed",
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
