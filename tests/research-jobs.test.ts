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
  scheduleSources,
} from "../src/research/collection";
import {
  actOnCollectionJob,
  collectionJob,
  jobActionSchema,
} from "../src/research/jobs";
import { requestAccountDeletion } from "../src/privacy/account";
test("collection recovery validates explicit expected state, attempts and a bounded reason", () => {
  const valid = {
    action: "cancel",
    expectedState: "running",
    expectedAttempts: 1,
    note: "Original operator reason.",
  };
  assert.ok(jobActionSchema.safeParse(valid).success);
  for (const extra of [
    { note: "short" },
    { expectedAttempts: 4 },
    { expectedState: "pending" },
    { action: "extract" },
    { force: true },
  ])
    assert.equal(
      jobActionSchema.safeParse({ ...valid, ...extra }).success,
      false,
    );
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: manual collection recovery fences workers, audits replacements and serializes competing retries`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-job-actions-")),
        schema = "job_actions_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", `-c search_path=${schema}`);
        url = parsed.href;
      }
      let db = await openDatabase(dir, url);
      try {
        await seedLocalCatalogue(db.sql);
        const actor = "local-fixture-reviewer";
        const source = await createSource(db.sql, actor, {
          name: "Recovery source fixture",
          url: "https://university.example.edu/recovery",
        });
        const policy = {
          sourceId: source.id,
          enabled: true,
          permissionNote: "Fixture permission, no live collection in tests.",
        };
        await collectionPolicy(db.sql, actor, policy);
        await scheduleSources(db.sql);
        const claim = await claimCollection(db.sql);
        assert.ok(claim);
        const cancel = {
          action: "cancel",
          expectedState: "running",
          expectedAttempts: 1,
          note: "Cancel this fixture attempt <script>original</script>",
        };
        await assert.rejects(
          () => actOnCollectionJob(db.sql, "stranger", claim.id, cancel),
          /Administrator/,
        );
        await assert.rejects(
          () => collectionJob(db.sql, "stranger", claim.id),
          /Administrator/,
        );
        await assert.rejects(
          () =>
            actOnCollectionJob(db.sql, actor, claim.id, {
              ...cancel,
              expectedAttempts: 0,
            }),
          /changed/,
        );
        assert.equal(
          (await collectionJob(db.sql, actor, claim.id)).job.state,
          "running",
        );
        await actOnCollectionJob(db.sql, actor, claim.id, cancel);
        assert.equal(
          await finishCollection(
            db.sql,
            claim,
            "Late smart manufacturing source",
          ),
          "discarded",
        );
        assert.equal(
          Number(
            (await db.sql.query("SELECT COUNT(*) AS n FROM source_snapshots"))
              .rows[0].n,
          ),
          0,
        );
        const cancelled = await collectionJob(db.sql, actor, claim.id);
        assert.equal(cancelled.job.state, "cancelled");
        assert.equal(cancelled.actions[0].note, cancel.note);
        await assert.rejects(
          () => actOnCollectionJob(db.sql, actor, claim.id, cancel),
          /changed/,
        );
        await collectionPolicy(db.sql, actor, { ...policy, enabled: false });
        const retry = {
          action: "retry",
          expectedState: "cancelled",
          expectedAttempts: 1,
          note: "Retry after checking source permissions.",
        };
        await assert.rejects(
          () => actOnCollectionJob(db.sql, actor, claim.id, retry),
          /enabled/,
        );
        await collectionPolicy(db.sql, actor, policy);
        const beforeBudget = (
          await db.sql.query("SELECT reserved_micros FROM budget WHERE id=1")
        ).rows[0].reserved_micros;
        const attempts = await Promise.allSettled([
          actOnCollectionJob(db.sql, actor, claim.id, retry),
          actOnCollectionJob(db.sql, actor, claim.id, retry),
        ]);
        assert.equal(
          attempts.filter((x) => x.status === "fulfilled").length,
          1,
        );
        assert.equal(attempts.filter((x) => x.status === "rejected").length, 1);
        const winner = attempts.find((x) => x.status === "fulfilled");
        assert.ok(winner && winner.status === "fulfilled");
        const replacement = winner.value.replacementJobId!;
        const original = await collectionJob(db.sql, actor, claim.id);
        assert.equal(original.job.state, "cancelled");
        assert.equal(Number(original.job.attempts), 1);
        assert.equal(original.actions.length, 2);
        assert.equal(original.actions[1].replacement_job_id, replacement);
        const queued = await collectionJob(db.sql, actor, replacement);
        assert.equal(queued.job.state, "queued");
        assert.equal(Number(queued.job.attempts), 0);
        assert.equal(queued.predecessor, claim.id);
        assert.equal(
          Number(
            (
              await db.sql.query(
                "SELECT COUNT(*) AS n FROM research_jobs WHERE source_id=$1 AND state IN ('queued','running')",
                [source.id],
              )
            ).rows[0].n,
          ),
          1,
        );
        await scheduleSources(db.sql);
        assert.equal(
          Number(
            (
              await db.sql.query(
                "SELECT COUNT(*) AS n FROM research_jobs WHERE source_id=$1",
                [source.id],
              )
            ).rows[0].n,
          ),
          2,
        );
        await db.close();
        db = await openDatabase(dir, url);
        assert.equal(
          (await collectionJob(db.sql, actor, claim.id)).actions.length,
          2,
        );
        await actOnCollectionJob(db.sql, actor, replacement, {
          ...cancel,
          expectedState: "queued",
          expectedAttempts: 0,
        });
        await assert.rejects(
          () => actOnCollectionJob(db.sql, actor, claim.id, retry),
          /already has a replacement/,
        );
        // Active-job and completed-state guards preserve history and budgets.
        await db.sql.query(
          "UPDATE research_jobs SET state='failed',attempts=3,error_code='source_timeout' WHERE id=$1",
          [replacement],
        );
        const other = randomUUID();
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id) VALUES($1,$2)",
          [other, source.id],
        );
        const retryFailed = {
          ...retry,
          expectedState: "failed",
          expectedAttempts: 3,
        };
        await assert.rejects(
          () => actOnCollectionJob(db.sql, actor, replacement, retryFailed),
          /active collection job/,
        );
        await actOnCollectionJob(db.sql, actor, other, {
          ...cancel,
          expectedState: "queued",
          expectedAttempts: 0,
        });
        const next = await actOnCollectionJob(
          db.sql,
          actor,
          replacement,
          retryFailed,
        );
        assert.ok(next.replacementJobId);
        await db.sql.query(
          "UPDATE research_jobs SET state='done' WHERE id=$1",
          [next.replacementJobId],
        );
        for (const action of ["cancel", "retry"])
          await assert.rejects(
            () =>
              actOnCollectionJob(db.sql, actor, next.replacementJobId!, {
                ...retry,
                action,
                expectedState: "done",
                expectedAttempts: 0,
              }),
            /Only/,
          );
        assert.equal(
          (await db.sql.query("SELECT reserved_micros FROM budget WHERE id=1"))
            .rows[0].reserved_micros,
          beforeBudget,
        );
        assert.equal(
          Number(
            (await db.sql.query("SELECT COUNT(*) AS n FROM research_usage"))
              .rows[0].n,
          ),
          0,
        );
        const synthetic = (
          await db.sql.query("SELECT id FROM sources WHERE synthetic LIMIT 1")
        ).rows[0].id;
        const syntheticJob = randomUUID();
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id,state) VALUES($1,$2,'failed')",
          [syntheticJob, synthetic],
        );
        await assert.rejects(
          () =>
            actOnCollectionJob(db.sql, actor, syntheticJob, {
              ...retryFailed,
              expectedAttempts: 0,
            }),
          /non-synthetic/,
        );
        // An administrator whose only shared contribution is a job audit requires operator deletion.
        for (const id of ["job-only-admin", "pending-admin"]) {
          await db.sql.query(
            "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
            [id, id + "@example.test"],
          );
          await db.sql.query("INSERT INTO admin_roles(user_id) VALUES($1)", [
            id,
          ]);
        }
        const finalJob = randomUUID();
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id) VALUES($1,$2)",
          [finalJob, source.id],
        );
        await actOnCollectionJob(db.sql, "job-only-admin", finalJob, {
          ...cancel,
          expectedState: "queued",
          expectedAttempts: 0,
        });
        await assert.rejects(
          () =>
            requestAccountDeletion(db.sql, "job-only-admin", {
              confirmation: "DELETE",
            }),
          /operator-assisted/,
        );
        await requestAccountDeletion(db.sql, "pending-admin", {
          confirmation: "DELETE",
        });
        await assert.rejects(
          () =>
            actOnCollectionJob(db.sql, "pending-admin", finalJob, {
              ...retry,
              expectedAttempts: 0,
            }),
          /deletion is pending/,
        );
        await assert.rejects(
          () => collectionJob(db.sql, actor, randomUUID()),
          /not found/,
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
