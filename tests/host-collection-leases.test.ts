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
  failCollection,
} from "../src/research/collection";
import { operationsOverview } from "../src/research/operations";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: hostname leases serialize source URLs, survive restart and let other hosts progress`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-host-leases-")),
        schema = "host_leases_" + randomUUID().replaceAll("-", "");
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
          name: "Host first URL",
          url: "https://SCHOOL.EXAMPLE.EDU/first",
        });
        const b = await createSource(db.sql, actor, {
          name: "Host second URL",
          url: "https://school.example.edu./second",
        });
        const c = await createSource(db.sql, actor, {
          name: "Other hostname",
          url: "https://other.example.edu/source",
        });
        const hosts = (
          await db.sql.query(
            "SELECT id,collection_host FROM sources WHERE id=ANY($1::text[])",
            [[a.id, b.id, c.id]],
          )
        ).rows;
        assert.equal(
          hosts.find((row) => row.id === a.id)?.collection_host,
          "school.example.edu",
        );
        assert.equal(
          hosts.find((row) => row.id === b.id)?.collection_host,
          "school.example.edu",
        );
        await assert.rejects(
          createSource(db.sql, actor, {
            name: "Cannot choose host key",
            url: "https://school.example.edu/third",
            collection_host: "other.example.edu",
          }),
        );
        for (const source of [a, b, c])
          await collectionPolicy(db.sql, actor, {
            sourceId: source.id,
            enabled: true,
            permissionNote: "Fixture concurrency policy; no live requests.",
          });
        for (const [id, source] of [
          ["host-a", a],
          ["host-b", b],
        ] as const)
          await db.sql.query(
            "INSERT INTO research_jobs(id,source_id,created_at) VALUES($1,$2,'2026-01-01')",
            [id, source.id],
          );
        const together = await Promise.all([
          claimCollection(db.sql),
          claimCollection(db.sql),
        ]);
        assert.equal(together.filter(Boolean).length, 1);
        const first = together.find(Boolean)!;
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.busyHosts,
          "1",
        );
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.queuedReady,
          "0",
        );
        await db.close();
        db = await openDatabase(dir, url);
        assert.equal(
          await claimCollection(db.sql),
          null,
          "running host lease survives restart",
        );
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id) VALUES('host-c',$1)",
          [c.id],
        );
        const other = await claimCollection(db.sql);
        assert.equal(other?.sourceId, c.id);
        assert.ok(other);
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.busyHosts,
          "2",
        );
        await finishCollection(db.sql, other, "Other host collection fixture.");
        await finishCollection(db.sql, first, "First host collection fixture.");
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.busyHosts,
          "0",
        );
        const second = await claimCollection(db.sql);
        assert.ok(second);
        assert.notEqual(second.sourceId, first.sourceId);
        await db.sql.query(
          "UPDATE research_jobs SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1",
          [second.id],
        );
        const reclaimed = await claimCollection(db.sql);
        assert.ok(reclaimed);
        assert.equal(reclaimed.id, second.id);
        assert.notEqual(reclaimed.token, second.token);
        assert.equal(
          await finishCollection(
            db.sql,
            second,
            "Late content must be discarded.",
          ),
          "discarded",
        );
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.busyHosts,
          "1",
          "stale completion cannot free a newer lease",
        );
        await failCollection(db.sql, reclaimed, Error("Fixture retry"));
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.busyHosts,
          "0",
          "retrying job no longer owns an active host lease",
        );
        // Existing running records also gate a host, even if no host mutex row existed at startup.
        await db.sql.query("DELETE FROM collection_host_locks");
        await db.sql.query(
          "UPDATE research_jobs SET state='running',lease_until=NOW()+INTERVAL '1 minute' WHERE id=$1",
          [second.id],
        );
        const waitingSource = first.sourceId;
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id) VALUES('host-waiting',$1)",
          [waitingSource],
        );
        assert.equal(await claimCollection(db.sql), null);
        await db.sql.query(
          "UPDATE research_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE id=$1",
          [second.id],
        );
        const afterCancel = await claimCollection(db.sql);
        assert.equal(afterCancel?.id, "host-waiting");
        assert.ok(afterCancel);
        await finishCollection(
          db.sql,
          afterCancel,
          "Collection after cancellation fixture.",
        );
        assert.equal(
          (await operationsOverview(db.sql, actor)).aging.busyHosts,
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
