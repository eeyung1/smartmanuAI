import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import { createSource } from "../src/catalogue/service";
import {
  collectionPolicy,
  scheduleSources,
  collectOne,
  claimCollection,
  failCollection,
} from "../src/research/collection";
import { actOnCollectionJob, collectionJob } from "../src/research/jobs";
import {
  parseRetryAfter,
  readSourceResponse,
  RetrievalError,
} from "../src/research/retrieval";
const timestamp = (value: unknown) =>
  new Date(value instanceof Date ? value.getTime() : String(value));
test("Retry-After parses bounded seconds/dates and never consumes a rate-limit body", async () => {
  const now = new Date("2026-11-02T12:00:00Z");
  assert.deepEqual(parseRetryAfter("3600", now), {
    until: "2026-11-02T13:00:00.000Z",
    requiresReview: false,
  });
  assert.deepEqual(parseRetryAfter("Mon, 02 Nov 2026 14:00:00 GMT", now), {
    until: "2026-11-02T14:00:00.000Z",
    requiresReview: false,
  });
  assert.deepEqual(parseRetryAfter("0", now), {
    until: now.toISOString(),
    requiresReview: false,
  });
  assert.deepEqual(parseRetryAfter("Sun, 01 Nov 2026 12:00:00 GMT", now), {
    until: now.toISOString(),
    requiresReview: false,
  });
  assert.deepEqual(parseRetryAfter("604800", now), {
    until: "2026-11-09T12:00:00.000Z",
    requiresReview: false,
  });
  for (const value of [
    "604801",
    "9999999999999999999999999999999",
    "Tue, 10 Nov 2026 12:00:00 GMT",
  ])
    assert.deepEqual(parseRetryAfter(value, now), {
      until: null,
      requiresReview: true,
    });
  for (const value of [
    undefined,
    ["60", "120"],
    "-1",
    "1.5",
    "soon",
    "1\r\nX: bad",
    "Mon, 31 Feb 2026 12:00:00 GMT",
  ])
    assert.equal(parseRetryAfter(value, now), null);
  for (const status of [429, 503]) {
    const stream = Object.assign(Readable.from([]), {
      statusCode: status,
      headers: { "retry-after": "3600" },
    }) as unknown as IncomingMessage;
    let read = false;
    stream[Symbol.asyncIterator] = async function* () {
      read = true;
      throw Error("Do not read error pages");
    };
    await assert.rejects(
      () => readSourceResponse(stream),
      (error: unknown) =>
        error instanceof RetrievalError &&
        error.code ===
          (status === 429 ? "source_rate_limited" : "source_unavailable") &&
        !!error.retryAfter?.until,
    );
    assert.equal(read, false);
  }
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: Retry-After survives restart, gates scheduling/replacements and fences late failure`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-retry-after-")),
        schema = "retry_after_" + randomUUID().replaceAll("-", "");
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
        const actor = "local-fixture-reviewer",
          source = await createSource(db.sql, actor, {
            name: "Backoff fixture source",
            url: "https://university.example.edu/backoff",
          });
        const policy = {
          sourceId: source.id,
          enabled: true,
          permissionNote: "Fixture permission; no live network requests.",
        };
        await collectionPolicy(db.sql, actor, policy);
        const schedule = async () => {
          await db.sql.query(
            "UPDATE source_collection_policies SET next_due_at=NOW()-INTERVAL '1 hour' WHERE source_id=$1",
            [source.id],
          );
          return scheduleSources(db.sql);
        };
        await schedule();
        const until = new Date(Date.now() + 3600000).toISOString();
        let calls = 0;
        assert.equal(
          await collectOne(db.sql, async () => {
            calls++;
            throw new RetrievalError("source_rate_limited", {
              until,
              requiresReview: false,
            });
          }),
          "retry_or_failed",
        );
        const job = (
          await db.sql.query("SELECT * FROM research_jobs WHERE source_id=$1", [
            source.id,
          ])
        ).rows[0];
        assert.equal(job.state, "queued");
        assert.equal(job.attempts, 1);
        assert.equal(timestamp(job.available_at).toISOString(), until);
        await db.close();
        db = await openDatabase(dir, url);
        assert.equal(await claimCollection(db.sql), null);
        assert.equal(await schedule(), 0);
        assert.equal(
          await collectOne(db.sql, async () => {
            calls++;
            return "Must not fetch";
          }),
          "empty",
        );
        assert.equal(calls, 1);
        // A replacement retains both job and source wait times rather than bypassing them.
        await actOnCollectionJob(db.sql, actor, String(job.id), {
          action: "cancel",
          expectedState: "queued",
          expectedAttempts: 1,
          note: "Cancel fixture while preserving source delay.",
        });
        const replacement = await actOnCollectionJob(
          db.sql,
          actor,
          String(job.id),
          {
            action: "retry",
            expectedState: "cancelled",
            expectedAttempts: 1,
            note: "Queue fixture replacement after the cooldown.",
          },
        );
        const detail = await collectionJob(
          db.sql,
          actor,
          replacement.replacementJobId!,
        );
        assert.ok(
          timestamp(detail.job.available_at).getTime() >=
            new Date(until).getTime(),
        );
        assert.equal(timestamp(detail.job.retry_after_at).toISOString(), until);
        assert.equal(await claimCollection(db.sql), null);
        await db.sql.query(
          "UPDATE source_retry_after SET retry_after_at=NOW()-INTERVAL '1 second' WHERE source_id=$1",
          [source.id],
        );
        await db.sql.query(
          "UPDATE research_jobs SET available_at=NOW()-INTERVAL '1 second' WHERE id=$1",
          [replacement.replacementJobId],
        );
        const expired = await claimCollection(db.sql);
        assert.ok(expired);
        await db.sql.query(
          "UPDATE research_jobs SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1",
          [expired.id],
        );
        assert.equal(
          await failCollection(
            db.sql,
            expired,
            new RetrievalError("source_rate_limited", {
              until: null,
              requiresReview: true,
            }),
          ),
          "discarded",
        );
        const reclaimed = await claimCollection(db.sql);
        assert.ok(reclaimed);
        assert.equal(
          await failCollection(
            db.sql,
            expired,
            new RetrievalError("source_rate_limited", {
              until: null,
              requiresReview: true,
            }),
          ),
          "discarded",
        );
        assert.equal(
          await failCollection(
            db.sql,
            reclaimed,
            new RetrievalError(
              "source_rate_limited",
              parseRetryAfter("999999999"),
            ),
          ),
          "retry_or_failed",
        );
        const blocked = await collectionJob(db.sql, actor, reclaimed.id);
        assert.equal(blocked.job.state, "failed");
        assert.equal(blocked.job.requires_review, true);
        assert.equal(await schedule(), 0);
        assert.equal(await claimCollection(db.sql), null);
        await assert.rejects(
          () =>
            actOnCollectionJob(db.sql, actor, reclaimed.id, {
              action: "retry",
              expectedState: "failed",
              expectedAttempts: 2,
              note: "Must not bypass an operator review pause.",
            }),
          /source-policy review/,
        );
        await collectionPolicy(db.sql, actor, {
          ...policy,
          permissionNote: "Operator reviewed the fixture Retry-After pause.",
        });
        assert.equal(
          Number(
            (
              await db.sql.query(
                "SELECT COUNT(*) AS n FROM source_retry_after WHERE source_id=$1",
                [source.id],
              )
            ).rows[0].n,
          ),
          0,
        );
        const resumed = await actOnCollectionJob(db.sql, actor, reclaimed.id, {
          action: "retry",
          expectedState: "failed",
          expectedAttempts: 2,
          note: "Operator approved a new fixture attempt.",
        });
        await db.sql.query(
          "UPDATE research_jobs SET available_at=NOW()-INTERVAL '1 second' WHERE id=$1",
          [resumed.replacementJobId],
        );
        const paused = await claimCollection(db.sql);
        assert.ok(paused);
        await collectionPolicy(db.sql, actor, { ...policy, enabled: false });
        assert.equal(
          await failCollection(
            db.sql,
            paused,
            new RetrievalError("source_unavailable", {
              until,
              requiresReview: false,
            }),
          ),
          "discarded",
        );
        assert.equal(
          Number(
            (
              await db.sql.query(
                "SELECT COUNT(*) AS n FROM source_retry_after WHERE source_id=$1",
                [source.id],
              )
            ).rows[0].n,
          ),
          0,
        );
        // Invalid/missing headers retain the five-minute baseline and three-attempt cap.
        await collectionPolicy(db.sql, actor, policy);
        await schedule();
        const fallback = await claimCollection(db.sql);
        assert.ok(fallback);
        await db.sql.query("UPDATE research_jobs SET attempts=3 WHERE id=$1", [
          fallback.id,
        ]);
        const before = Date.now();
        await failCollection(
          db.sql,
          fallback,
          new RetrievalError("source_unavailable"),
        );
        const failed = await collectionJob(db.sql, actor, fallback.id);
        assert.equal(failed.job.state, "failed");
        assert.ok(
          timestamp(failed.job.available_at).getTime() >= before + 299000,
        );
        assert.equal(failed.job.requires_review, false);
        assert.equal(
          Number(
            (await db.sql.query("SELECT COUNT(*) AS n FROM source_snapshots"))
              .rows[0].n,
          ),
          0,
        );
        assert.equal(
          Number(
            (await db.sql.query("SELECT COUNT(*) AS n FROM research_usage"))
              .rows[0].n,
          ),
          0,
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
