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
import {
  operationsOverview,
  formatBudgetUnits,
  budgetReservationStatus,
} from "../src/research/operations";
import OperationsSummary from "../app/admin/operations/summary";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: operations snapshot is admin-only, exact, read-only and distinguishes reservations from charges`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-operations-")),
        schema = "operations_" + randomUUID().replaceAll("-", "");
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
        await assert.rejects(
          operationsOverview(db.sql, "non-admin"),
          /Administrator/,
        );
        const empty = await operationsOverview(db.sql, actor);
        assert.equal(empty.jobs.total, "0");
        assert.deepEqual(empty.failureWarnings, { total: "0", items: [] });
        assert.equal(empty.candidates.total, "0");
        assert.equal(empty.usage.total, "0");
        assert.equal(empty.budget?.limitMicros, "3000000");
        const source = await createSource(db.sql, actor, {
          name: "Operations fixture",
          url: "https://school.example.edu/operations",
        });
        const original = (
          await db.sql.query(
            "SELECT source_id FROM opportunities WHERE id='synthetic-course'",
          )
        ).rows[0].source_id;
        await db.sql.query(
          "INSERT INTO source_collection_policies(source_id,enabled,permission_note,actor_id) VALUES($1,true,'Reviewed fixture, no live worker.',$2)",
          [source.id, actor],
        );
        await db.sql.query(
          "INSERT INTO source_retry_after(source_id,retry_after_at,requires_review) VALUES($1,NOW()+INTERVAL '1 day',true)",
          [source.id],
        );
        for (const state of [
          "queued",
          "running",
          "done",
          "failed",
          "cancelled",
        ])
          await db.sql.query(
            "INSERT INTO research_jobs(id,source_id,state) VALUES($1,$2,$3)",
            [
              "operations-" + state,
              state === "running" ? original : source.id,
              state,
            ],
          );
        const states = ["pending", "drafted", "rejected"];
        for (let n = 0; n < 3; n++) {
          await db.sql.query(
            "INSERT INTO source_snapshots(id,source_id,content_hash,content) VALUES($1,$2,$1,'private snapshot must not leak')",
            ["ops-snapshot-" + n, source.id],
          );
          await db.sql.query(
            "INSERT INTO research_candidates(id,snapshot_id,state) VALUES($1,$2,$3)",
            ["ops-candidate-" + n, "ops-snapshot-" + n, states[n]],
          );
          await db.sql.query(
            "INSERT INTO research_usage(id,candidate_id,reserved_micros,state,model) VALUES($1,$2,$3,$4,'private model identifier')",
            [
              "ops-usage-" + n,
              "ops-candidate-" + n,
              (n + 1) * 1000001,
              ["reserved", "completed", "uncertain"][n],
            ],
          );
        }
        await db.sql.query(
          "UPDATE budget SET limit_micros=9007199254740993,reserved_micros=9007199254000000 WHERE id=1",
        );
        const data = await operationsOverview(db.sql, actor);
        assert.deepEqual(data.jobs, {
          total: "5",
          queued: "1",
          running: "1",
          done: "1",
          failed: "1",
          cancelled: "1",
        });
        assert.deepEqual(data.candidates, {
          total: "3",
          pending: "1",
          drafted: "1",
          rejected: "1",
        });
        assert.deepEqual(data.sources, {
          total: "2",
          enabled: "1",
          paused: "1",
          reviewHolds: "1",
          futureHolds: "1",
          due: "1",
        });
        assert.deepEqual(data.usage, {
          total: "3",
          reserved: "1",
          completed: "1",
          uncertain: "1",
          reservationMicros: "6000006",
        });
        assert.deepEqual(data.budget, {
          limitMicros: "9007199254740993",
          reservedMicros: "9007199254000000",
          availableMicros: "740993",
          overLimit: false,
          reservationStatus: { level: "critical", percent: "99.99" },
        });
        assert.match(data.observedAt, /Z$/);
        assert.doesNotMatch(
          JSON.stringify(data),
          /private snapshot|private model|example.edu|actor_id|email/,
        );
        assert.equal(
          formatBudgetUnits("9007199254740993"),
          "9007199254.740993",
        );
        assert.equal(formatBudgetUnits("1"), "0.000001");
        assert.equal(formatBudgetUnits("0"), "0.000000");
        for (const [locale, pattern] of [
          ["en", /Operations overview/],
          ["zh-Hans", /运营概览/],
        ] as const) {
          const html = renderToStaticMarkup(
            createElement(OperationsSummary, { data, locale }),
          );
          assert.match(html, pattern);
          assert.match(html, /9007199254\.740993/);
          assert.match(html, /kind=jobs/);
          assert.match(
            html,
            locale === "en"
              ? /reservations have reached 90%/
              : /预留量已达到已配置上限的 90%/,
          );
          assert.match(html, /99.99%/);
          assert.match(
            html,
            locale === "en"
              ? /not settled provider charges/
              : /不等于供应商已结算费用/,
          );
        }
        // Reading twice does not alter reservations or create jobs/usage.
        const same = await operationsOverview(db.sql, actor);
        assert.deepEqual(same.budget, data.budget);
        assert.deepEqual(same.jobs, data.jobs);
        assert.deepEqual(same.usage, data.usage);
        await db.sql.query(
          "UPDATE research_jobs SET state='done' WHERE id='operations-failed'",
        );
        assert.equal(
          (await operationsOverview(db.sql, actor)).jobs.failed,
          "0",
        );
        await db.sql.query("DELETE FROM budget WHERE id=1");
        const missing = await operationsOverview(db.sql, actor);
        assert.equal(missing.budget, null);
        assert.match(
          renderToStaticMarkup(
            createElement(OperationsSummary, { data: missing, locale: "en" }),
          ),
          /Budget configuration unavailable/,
        );
        await db.sql.query(
          "INSERT INTO budget(id,limit_micros,reserved_micros) VALUES(1,0,1)",
        );
        const exceeded = await operationsOverview(db.sql, actor);
        assert.equal(exceeded.budget?.availableMicros, "0");
        assert.equal(exceeded.budget?.overLimit, true);
        assert.match(
          renderToStaticMarkup(
            createElement(OperationsSummary, { data: exceeded, locale: "en" }),
          ),
          /Reservations exceed/,
        );
        const affected: string[] = [];
        for (let n = 0; n < 11; n++) {
          const failing = await createSource(db.sql, actor, {
            name: "Failure source " + n,
            url: `https://failure${n}.example.edu/page`,
          });
          affected.push(failing.id);
          await db.sql.query(
            "INSERT INTO research_jobs(id,source_id,state,created_at) VALUES($1,$3,'failed',NOW()-INTERVAL '2 hours'),($2,$3,'failed',NOW()-INTERVAL '1 hour')",
            [`warning-${n}-old`, `warning-${n}-new`, failing.id],
          );
          await db.sql.query(
            "INSERT INTO research_jobs(id,source_id,state) VALUES($1,$2,'queued')",
            [`warning-${n}-queued`, failing.id],
          );
        }
        const warnings = await operationsOverview(db.sql, actor);
        assert.equal(warnings.failureWarnings.total, "11");
        assert.equal(warnings.failureWarnings.items.length, 10);
        for (const locale of ["en", "zh-Hans"] as const) {
          const html = renderToStaticMarkup(
            createElement(OperationsSummary, { data: warnings, locale }),
          );
          assert.match(
            html,
            locale === "en"
              ? /first 10 affected sources/
              : /前 10 个受影响来源/,
          );
          assert.match(html, /kind=jobs&amp;source=/);
        }
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id,state) VALUES('warning-cancelled',$1,'cancelled'),('warning-recovered',$2,'done')",
          [affected[0], affected[1]],
        );
        assert.equal(
          (await operationsOverview(db.sql, actor)).failureWarnings.total,
          "9",
        );
        await db.sql.query(
          "DELETE FROM research_jobs WHERE id='warning-2-old'",
        );
        assert.equal(
          (await operationsOverview(db.sql, actor)).failureWarnings.total,
          "8",
        );
        // Future creation timestamps cannot create a failure signal.
        await db.sql.query(
          "UPDATE research_jobs SET created_at=NOW()+INTERVAL '1 day' WHERE source_id=$1 AND state='failed'",
          [affected[3]],
        );
        const stable = await operationsOverview(db.sql, actor);
        assert.equal(stable.failureWarnings.total, "7");
        assert.deepEqual(
          (await operationsOverview(db.sql, actor)).failureWarnings,
          stable.failureWarnings,
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

test("reservation warnings compare exact thresholds and handle zero/over-limit budgets", () => {
  for (const [reserved, level, percent] of [
    ["69", "normal", "69.00"],
    ["70", "warning", "70.00"],
    ["89", "warning", "89.00"],
    ["90", "critical", "90.00"],
    ["99", "critical", "99.00"],
    ["100", "full", "100.00"],
    ["101", "full", "101.00"],
  ]) {
    assert.deepEqual(budgetReservationStatus("100", reserved), {
      level,
      percent,
    });
  }
  assert.deepEqual(budgetReservationStatus("0", "0"), {
    level: "full",
    percent: null,
  });
  assert.deepEqual(budgetReservationStatus("0", "1"), {
    level: "full",
    percent: null,
  });
  const limit = 90071992547409930n;
  for (const threshold of [70n, 90n]) {
    const boundary = (limit * threshold) / 100n;
    assert.equal(
      budgetReservationStatus(String(limit), String(boundary - 1n)).level,
      threshold === 70n ? "normal" : "warning",
    );
    assert.equal(
      budgetReservationStatus(String(limit), String(boundary + 1n)).level,
      threshold === 70n ? "warning" : "critical",
    );
  }
});
