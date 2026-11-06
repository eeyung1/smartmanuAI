import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import { createSource } from "../src/catalogue/service";
import { operationsOverview, durationParts } from "../src/research/operations";
import OperationsSummary from "../app/admin/operations/summary";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: workload ages include holds while readiness honors scheduling gates and handles empty/future records`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-workload-age-")),
        schema = "workload_age_" + randomUUID().replaceAll("-", "");
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
        const empty = await operationsOverview(db.sql, actor);
        assert.deepEqual(empty.aging, {
          queuedReady: "0",
          expiredLeases: "0",
          oldestQueuedAt: null,
          oldestQueuedAgeSeconds: null,
          oldestPendingAt: null,
          oldestPendingAgeSeconds: null,
        });
        assert.equal(empty.sources.due, "0");
        const cases = [
          { name: "ready", state: "queued", age: "2 hours" },
          {
            name: "delayed",
            state: "queued",
            age: "4 hours",
            available: "1 day",
          },
          { name: "paused", state: "queued", age: "6 hours", enabled: false },
          { name: "review", state: "queued", review: true },
          { name: "waiting", state: "queued", wait: true },
          { name: "exhausted", state: "queued", attempts: 3 },
          { name: "future-policy", state: "queued", futurePolicy: true },
          { name: "expired", state: "running", lease: "-1 hour", attempts: 3 },
          { name: "valid-lease", state: "running", lease: "1 hour" },
          { name: "missing-lease", state: "running" },
        ] as const;
        const sources: Record<string, string> = {};
        for (const fixture of cases) {
          const value: {
            name: string;
            state: string;
            age?: string;
            available?: string;
            enabled?: boolean;
            review?: boolean;
            wait?: boolean;
            attempts?: number;
            futurePolicy?: boolean;
            lease?: string;
          } = fixture;
          const source = await createSource(db.sql, actor, {
            name: "Workload " + value.name,
            url: "https://school.example.edu/" + value.name,
          });
          sources[value.name] = source.id;
          await db.sql.query(
            "INSERT INTO source_collection_policies(source_id,enabled,permission_note,actor_id,next_due_at) VALUES($1,$2,'Fixture scheduling gates; no live worker.',$3,NOW()+$4::interval)",
            [
              source.id,
              value.enabled ?? true,
              actor,
              value.futurePolicy ? "1 day" : "-1 hour",
            ],
          );
          await db.sql.query(
            "INSERT INTO research_jobs(id,source_id,state,attempts,created_at,available_at,lease_until) VALUES($1,$2,$3,$4,NOW()-$5::interval,NOW()+$6::interval,CASE WHEN $7::text IS NULL THEN NULL ELSE NOW()+$7::interval END)",
            [
              value.name,
              source.id,
              value.state,
              value.attempts ?? 0,
              value.age ?? "1 hour",
              value.available ?? "-1 hour",
              value.lease ?? null,
            ],
          );
          if (value.review || value.wait)
            await db.sql.query(
              "INSERT INTO source_retry_after(source_id,retry_after_at,requires_review) VALUES($1,NOW()+INTERVAL '1 day',$2)",
              [source.id, value.review ?? false],
            );
        }
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id,state,created_at) VALUES('terminal-old',$1,'done','2000-01-01')",
          [sources.ready],
        );
        for (const [state, age] of [
          ["pending", "3 hours"],
          ["drafted", "100 days"],
        ]) {
          await db.sql.query(
            "INSERT INTO source_snapshots(id,source_id,content_hash,content) VALUES($1,$2,$1,'fixture')",
            ["age-snapshot-" + state, sources.ready],
          );
          await db.sql.query(
            "INSERT INTO research_candidates(id,snapshot_id,state,created_at) VALUES($1,$2,$3,NOW()-$4::interval)",
            ["age-candidate-" + state, "age-snapshot-" + state, state, age],
          );
        }
        const data = await operationsOverview(db.sql, actor);
        assert.equal(
          data.aging.queuedReady,
          "2",
          "future policy due time does not block an already queued job",
        );
        assert.equal(
          data.aging.expiredLeases,
          "1",
          "expired leases include exhausted jobs, not only recoverable ones",
        );
        assert.equal(
          data.sources.due,
          "8",
          "held enabled sources remain scheduled-due, disabled/future policies do not",
        );
        assert.ok(
          BigInt(data.aging.oldestQueuedAgeSeconds!) >= 21600n &&
            BigInt(data.aging.oldestQueuedAgeSeconds!) < 21720n,
        );
        assert.ok(
          BigInt(data.aging.oldestPendingAgeSeconds!) >= 10800n &&
            BigInt(data.aging.oldestPendingAgeSeconds!) < 10920n,
        );
        assert.ok(
          Date.parse(data.aging.oldestQueuedAt!) <
            Date.parse(data.aging.oldestPendingAt!),
        );
        for (const [locale, pattern] of [
          ["en", /Workload age and scheduling/],
          ["zh-Hans", /待处理时长与调度/],
        ] as const) {
          const html = renderToStaticMarkup(
            createElement(OperationsSummary, { data, locale }),
          );
          assert.match(html, pattern);
          assert.match(
            html,
            locale === "en"
              ? /not time in the current state/
              : /并非当前状态持续时间/,
          );
        }
        assert.deepEqual(durationParts("86400"), {
          days: "1",
          hours: "0",
          minutes: "0",
          seconds: "0",
        });
        const parts = durationParts("9007199254740993");
        assert.equal(
          BigInt(parts.days) * 86400n +
            BigInt(parts.hours) * 3600n +
            BigInt(parts.minutes) * 60n +
            BigInt(parts.seconds),
          9007199254740993n,
        );
        await db.sql.query("DELETE FROM source_retry_after");
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.queuedReady,
          "4",
        );
        await db.sql.query(
          "UPDATE research_jobs SET created_at=NOW()+INTERVAL '1 day' WHERE state='queued'",
        );
        await db.sql.query(
          "UPDATE research_candidates SET created_at=NOW()+INTERVAL '1 day' WHERE state='pending'",
        );
        const future = await operationsOverview(db.sql, actor);
        assert.equal(future.aging.oldestQueuedAgeSeconds, "0");
        assert.equal(future.aging.oldestPendingAgeSeconds, "0");
        await db.sql.query("UPDATE research_jobs SET state='done'");
        await db.sql.query("UPDATE research_candidates SET state='rejected'");
        const finished = await operationsOverview(db.sql, actor);
        assert.deepEqual(finished.aging, empty.aging);
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
