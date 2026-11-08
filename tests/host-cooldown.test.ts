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
  finishCollection,
  researchDashboard,
} from "../src/research/collection";
import { saveHostDelay } from "../src/research/host-delay";
import { operationsOverview } from "../src/research/operations";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: shared host cooldown is versioned, durable and preserved across source URLs, edits and lease recovery`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-host-cooldown-")),
        schema = "host_cooldown_" + randomUUID().replaceAll("-", "");
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
          name: "Shared cooldown first",
          url: "https://school.example.edu/a",
        });
        const b = await createSource(db.sql, actor, {
          name: "Shared cooldown second",
          url: "https://school.example.edu/b",
        });
        const c = await createSource(db.sql, actor, {
          name: "Other cooldown host",
          url: "https://other.example.edu/c",
        });
        const setting = {
          sourceId: a.id,
          expectedVersion: 0,
          requestDelaySeconds: 60,
        };
        for (const requestDelaySeconds of [-1, 3601, 1.5, "60", null])
          await assert.rejects(
            saveHostDelay(db.sql, actor, { ...setting, requestDelaySeconds }),
          );
        await assert.rejects(
          saveHostDelay(db.sql, actor, {
            ...setting,
            hostname: "other.example.edu",
          }),
        );
        await assert.rejects(
          saveHostDelay(db.sql, "non-admin", setting),
          /Administrator/,
        );
        await assert.rejects(
          saveHostDelay(db.sql, actor, { ...setting, sourceId: randomUUID() }),
          /Source not found/,
        );
        assert.equal(
          (await db.sql.query("SELECT hostname FROM collection_host_locks"))
            .rows.length,
          0,
        );
        const created = await saveHostDelay(db.sql, actor, setting);
        assert.equal(created.version, 1);
        const shared = (await researchDashboard(db.sql, actor)).sources.find(
          (source) => source.id === b.id,
        );
        assert.equal(shared?.host_delay_seconds, 60);
        assert.equal(shared?.host_policy_version, 1);
        const race = await Promise.allSettled([
          saveHostDelay(db.sql, actor, {
            ...setting,
            expectedVersion: 1,
            requestDelaySeconds: 30,
          }),
          saveHostDelay(db.sql, actor, {
            ...setting,
            sourceId: b.id,
            expectedVersion: 1,
            requestDelaySeconds: 45,
          }),
        ]);
        assert.equal(
          race.filter((item) => item.status === "fulfilled").length,
          1,
        );
        assert.match(
          String(race.find((item) => item.status === "rejected")?.reason),
          /Reload/,
        );
        let saved = await saveHostDelay(db.sql, actor, {
          ...setting,
          expectedVersion: 2,
        });
        for (const source of [a, b, c])
          await collectionPolicy(db.sql, actor, {
            sourceId: source.id,
            enabled: true,
            permissionNote: "Fixture host pacing; no live requests.",
          });
        await db.sql.query(
          "INSERT INTO source_retry_after(source_id,retry_after_at,requires_review) VALUES($1,NOW()+INTERVAL '1 day',true)",
          [b.id],
        );
        const before = (
          await db.sql.query(
            "SELECT retry_after_at::text AS until,requires_review FROM source_retry_after WHERE source_id=$1",
            [b.id],
          )
        ).rows[0];
        saved = await saveHostDelay(db.sql, actor, {
          ...setting,
          sourceId: b.id,
          expectedVersion: saved.version,
        });
        assert.deepEqual(
          (
            await db.sql.query(
              "SELECT retry_after_at::text AS until,requires_review FROM source_retry_after WHERE source_id=$1",
              [b.id],
            )
          ).rows[0],
          before,
        );
        await db.sql.query(
          "DELETE FROM source_retry_after WHERE source_id=$1",
          [b.id],
        );
        for (const [id, source, age] of [
          ["cooldown-a", a, "2 hours"],
          ["cooldown-b", b, "1 hour"],
          ["cooldown-c", c, "0 hours"],
        ] as const)
          await db.sql.query(
            "INSERT INTO research_jobs(id,source_id,created_at) VALUES($1,$2,NOW()-$3::interval)",
            [id, source.id, age],
          );
        const first = await claimCollection(db.sql);
        assert.equal(first?.sourceId, a.id);
        assert.ok(first);
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.coolingHosts,
          "1",
        );
        await finishCollection(db.sql, first, "Shared host first fixture.");
        const other = await claimCollection(db.sql);
        assert.equal(other?.sourceId, c.id);
        assert.ok(other);
        await finishCollection(db.sql, other, "Other host fixture.");
        assert.equal(
          await claimCollection(db.sql),
          null,
          "second URL waits after first lease completes",
        );
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.queuedReady,
          "0",
        );
        const last = (
          await db.sql.query(
            "SELECT last_claim_at::text AS at FROM collection_host_locks WHERE hostname='school.example.edu'",
          )
        ).rows[0].at;
        await db.close();
        db = await openDatabase(dir, url);
        assert.equal(
          await claimCollection(db.sql),
          null,
          "host cooldown survives restart",
        );
        saved = await saveHostDelay(db.sql, actor, {
          ...setting,
          expectedVersion: saved.version,
        });
        assert.equal(
          (
            await db.sql.query(
              "SELECT last_claim_at::text AS at FROM collection_host_locks WHERE hostname='school.example.edu'",
            )
          ).rows[0].at,
          last,
        );
        assert.equal(
          await claimCollection(db.sql),
          null,
          "editing settings does not clear claim history",
        );
        await assert.rejects(
          saveHostDelay(db.sql, actor, {
            ...setting,
            expectedVersion: saved.version - 1,
          }),
          /Reload/,
        );
        await db.sql.query(
          "UPDATE collection_host_locks SET last_claim_at=NOW()-INTERVAL '2 hours' WHERE hostname='school.example.edu'",
        );
        const second = await claimCollection(db.sql);
        assert.equal(second?.sourceId, b.id);
        assert.ok(second);
        await db.sql.query(
          "UPDATE research_jobs SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1",
          [second.id],
        );
        assert.equal(
          await claimCollection(db.sql),
          null,
          "expired lease recovery respects host cooldown",
        );
        await db.sql.query(
          "UPDATE collection_host_locks SET last_claim_at=NOW()-INTERVAL '2 hours' WHERE hostname='school.example.edu'",
        );
        const competing = await Promise.all([
          claimCollection(db.sql),
          claimCollection(db.sql),
        ]);
        assert.equal(competing.filter(Boolean).length, 1);
        const current = competing.find(Boolean)!;
        assert.equal(
          await finishCollection(db.sql, second, "Stale host content."),
          "discarded",
        );
        await finishCollection(db.sql, current, "Current host content.");
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id) VALUES('cooldown-next',$1)",
          [a.id],
        );
        assert.equal(await claimCollection(db.sql), null);
        saved = await saveHostDelay(db.sql, actor, {
          ...setting,
          expectedVersion: saved.version,
          requestDelaySeconds: 0,
        });
        const noDelay = await claimCollection(db.sql);
        assert.equal(noDelay?.id, "cooldown-next");
        assert.ok(noDelay);
        await finishCollection(db.sql, noDelay, "Zero extra delay fixture.");
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.coolingHosts,
          "0",
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
