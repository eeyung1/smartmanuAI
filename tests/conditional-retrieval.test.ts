import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage, IncomingHttpHeaders } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import {
  seedLocalCatalogue,
  fixtureDetails,
  fixtureEvidence,
} from "../src/catalogue/fixtures";
import {
  createSource,
  createDraft,
  reviewOpportunity,
} from "../src/catalogue/service";
import {
  collectionPolicy,
  scheduleSources,
  collectOne,
  claimCollection,
  sourceCache,
  finishNotModified,
  finishCollection,
} from "../src/research/collection";
import {
  safeValidators,
  conditionalHeaders,
  readSourceResponse,
  type SourceValidators,
} from "../src/research/retrieval";
const date = "Wed, 21 Oct 2015 07:28:00 GMT",
  body =
    "Original smart manufacturing learning opportunity. Participation is free.";
function response(
  status = 200,
  headers: IncomingHttpHeaders = {},
  content = body,
) {
  return Object.assign(Readable.from([Buffer.from(content)]), {
    statusCode: status,
    headers: { "content-type": "text/plain", ...headers },
  }) as unknown as IncomingMessage;
}
test("conditional HTTP only sends bounded validators and accepts matched bodyless responses", async () => {
  const validators = { etag: 'W/"original"', lastModified: date };
  assert.deepEqual(conditionalHeaders(validators), {
    "If-None-Match": 'W/"original"',
  });
  assert.deepEqual(conditionalHeaders({ etag: null, lastModified: date }), {
    "If-Modified-Since": date,
  });
  for (const etag of [
    "*",
    '"bad"\r\nAuthorization: injected',
    "unquoted",
    '"' + "a".repeat(513) + '"',
    ['"one"', '"two"'],
  ])
    assert.equal(safeValidators({ etag }).etag, null);
  for (const lastModified of [
    "yesterday",
    date + "\r\nX: bad",
    "Tue, 21 Oct 2015 07:28:00 GMT",
    "Wed, 31 Feb 2015 07:28:00 GMT",
  ])
    assert.equal(safeValidators({ lastModified }).lastModified, null);
  assert.deepEqual(
    conditionalHeaders(safeValidators({ etag: "*", lastModified: "bad" })),
    {},
  );
  const fresh = await readSourceResponse(
    response(200, { etag: '"original"', "last-modified": date }),
  );
  assert.deepEqual(fresh, {
    status: "content",
    content: body,
    validators: { etag: '"original"', lastModified: date },
  });
  const stream = response(
    304,
    { etag: '"original"' },
    "Ignored body".repeat(100000),
  );
  let read = false;
  stream[Symbol.asyncIterator] = async function* () {
    read = true;
    throw Error("304 body must not be read");
  };
  assert.deepEqual(await readSourceResponse(stream, validators), {
    status: "not_modified",
    validators: { etag: '"original"', lastModified: date },
  });
  assert.equal(read, false);
  await assert.rejects(
    () => readSourceResponse(response(304)),
    /unexpected_not_modified/,
  );
  await assert.rejects(
    () =>
      readSourceResponse(response(304, { etag: '"different"' }), validators),
    /validator_mismatch/,
  );
  await assert.rejects(
    () => readSourceResponse(response(304, { etag: "bad" }), validators),
    /validator_mismatch/,
  );
  assert.deepEqual(
    (
      await readSourceResponse(response(304, {}), {
        etag: null,
        lastModified: date,
      })
    ).validators,
    { etag: null, lastModified: date },
  );
  for (const headers of [
    { "cache-control": "private, no-store" },
    { vary: "*" },
    { vary: "Cookie" },
  ])
    assert.deepEqual(
      (
        await readSourceResponse(
          response(200, { etag: '"original"', ...headers }),
        )
      ).validators,
      safeValidators(),
    );
  assert.equal(
    (
      await readSourceResponse(
        response(200, {
          etag: '"original"',
          vary: "Accept, Accept-Encoding, User-Agent",
        }),
      )
    ).validators.etag,
    '"original"',
  );
  assert.deepEqual(
    (
      await readSourceResponse(
        response(304, { "cache-control": "no-store" }),
        validators,
      )
    ).validators,
    safeValidators(),
  );
  assert.deepEqual(
    (await readSourceResponse(response(200, {}), validators)).validators,
    safeValidators(),
    "a full response replaces old metadata rather than carrying it forward",
  );
  await assert.rejects(
    () =>
      readSourceResponse(
        response(302, { location: "https://attacker.example.test" }),
        validators,
      ),
    /redirect_disallowed/,
  );
  await assert.rejects(
    () =>
      readSourceResponse(
        response(200, { "content-type": "application/pdf" }),
        validators,
      ),
    /unsupported_content/,
  );
  await assert.rejects(
    () => readSourceResponse(response(200, {}, "x".repeat(256001)), validators),
    /source_too_large/,
  );
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: validator persistence skips unchanged bodies without refreshing publication or defeating worker fences`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-http-validators-")),
        schema = "validators_" + randomUUID().replaceAll("-", "");
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
            name: "Conditional source fixture",
            url: "https://university.example.edu/conditional",
          });
        const published = await createDraft(db.sql, actor, {
          sourceId: source.id,
          details: fixtureDetails,
          evidence: fixtureEvidence,
          note: "Fixture publication for freshness invariants.",
        });
        await reviewOpportunity(db.sql, actor, published.id, {
          action: "publish",
          expectedRevision: 1,
          verified: true,
          note: "Fixture-only human verification acknowledgement.",
        });
        await db.sql.query(
          "UPDATE opportunities SET verified_at='2000-01-01' WHERE id=$1",
          [published.id],
        );
        const policy = {
          sourceId: source.id,
          enabled: true,
          permissionNote: "Fixture conditional requests; no live retrieval.",
        };
        await collectionPolicy(db.sql, actor, policy);
        const schedule = async () => {
          await db.sql.query(
            "UPDATE source_collection_policies SET next_due_at=NOW()-INTERVAL '1 hour' WHERE source_id=$1",
            [source.id],
          );
          await scheduleSources(db.sql);
        };
        const counts = async () => ({
          snapshots: Number(
            (await db.sql.query("SELECT COUNT(*) AS n FROM source_snapshots"))
              .rows[0].n,
          ),
          candidates: Number(
            (
              await db.sql.query(
                "SELECT COUNT(*) AS n FROM research_candidates",
              )
            ).rows[0].n,
          ),
        });
        const verified = JSON.stringify(
          (
            await db.sql.query(
              "SELECT id,revision,verified_at FROM opportunities ORDER BY id",
            )
          ).rows,
        );
        await schedule();
        let calls = 0;
        assert.equal(
          await collectOne(db.sql, async (_, validators) => {
            calls++;
            assert.deepEqual(validators, safeValidators());
            return readSourceResponse(
              response(200, { etag: '"first"', "last-modified": date }),
            );
          }),
          "captured",
        );
        const cacheRow = (
          await db.sql.query(
            "SELECT * FROM source_http_validators WHERE source_id=$1",
            [source.id],
          )
        ).rows[0];
        assert.equal(cacheRow.etag, '"first"');
        assert.equal(cacheRow.url, source.url);
        await db.sql.query(
          "UPDATE source_snapshots SET last_seen_at='2000-01-01' WHERE id=$1",
          [cacheRow.snapshot_id],
        );
        await db.close();
        db = await openDatabase(dir, url);
        await schedule();
        assert.equal(
          await collectOne(db.sql, async (_, validators) => {
            calls++;
            assert.deepEqual(validators, {
              etag: '"first"',
              lastModified: date,
            });
            return readSourceResponse(response(304, {}), validators);
          }),
          "not_modified",
        );
        assert.deepEqual(await counts(), { snapshots: 1, candidates: 1 });
        assert.equal(calls, 2);
        assert.ok(
          new Date(
            String(
              (
                await db.sql.query(
                  "SELECT last_seen_at FROM source_snapshots WHERE id=$1",
                  [cacheRow.snapshot_id],
                )
              ).rows[0].last_seen_at,
            ),
          ).getUTCFullYear() > 2000,
        );
        assert.equal(
          JSON.stringify(
            (
              await db.sql.query(
                "SELECT id,revision,verified_at FROM opportunities ORDER BY id",
              )
            ).rows,
          ),
          verified,
        );
        // Same excerpt with a new validator still deduplicates, but replaces the metadata.
        await schedule();
        assert.equal(
          await collectOne(db.sql, async () =>
            readSourceResponse(response(200, { etag: '"second"' })),
          ),
          "unchanged",
        );
        assert.deepEqual(await counts(), { snapshots: 1, candidates: 1 });
        assert.equal(
          (
            await db.sql.query(
              "SELECT last_modified FROM source_http_validators WHERE source_id=$1",
              [source.id],
            )
          ).rows[0].last_modified,
          null,
        );
        await schedule();
        assert.equal(
          await collectOne(db.sql, async () =>
            readSourceResponse(
              response(
                200,
                { "last-modified": date },
                body + " Changed intake.",
              ),
            ),
          ),
          "captured",
        );
        assert.deepEqual(await counts(), { snapshots: 2, candidates: 2 });
        await schedule();
        assert.equal(
          await collectOne(db.sql, async (_, validators) => {
            assert.deepEqual(conditionalHeaders(validators), {
              "If-Modified-Since": date,
            });
            return readSourceResponse(response(304, {}), validators);
          }),
          "not_modified",
        );
        // Full responses without usable metadata force a full subsequent request.
        await schedule();
        assert.equal(
          await collectOne(db.sql, async () =>
            readSourceResponse(
              response(
                200,
                { etag: '"ignored"', "cache-control": "no-store" },
                body + " Changed intake.",
              ),
            ),
          ),
          "unchanged",
        );
        await schedule();
        assert.equal(
          await collectOne(db.sql, async (_, validators) => {
            assert.deepEqual(validators, safeValidators());
            return { status: "not_modified", validators };
          }),
          "retry_or_failed",
        );
        const retry = (
          await db.sql.query(
            "SELECT * FROM research_jobs WHERE state='queued' AND source_id=$1",
            [source.id],
          )
        ).rows[0];
        assert.equal(retry.error_code, "unexpected_not_modified");
        await db.sql.query(
          "UPDATE research_jobs SET available_at=NOW()-INTERVAL '1 hour' WHERE id=$1",
          [retry.id],
        );
        assert.equal(
          await collectOne(db.sql, async () =>
            readSourceResponse(
              response(200, { etag: '"third"' }, body + " Changed intake."),
            ),
          ),
          "unchanged",
        );
        // URL binding prevents applying a previous URL's validators to a newly configured URL.
        await db.sql.query("UPDATE sources SET url=$2 WHERE id=$1", [
          source.id,
          "https://university.example.edu/new-url",
        ]);
        await schedule();
        assert.equal(
          await collectOne(db.sql, async (_, validators) => {
            assert.deepEqual(validators, safeValidators());
            return readSourceResponse(
              response(200, { etag: '"new-url"' }, body + " New page."),
            );
          }),
          "captured",
        );
        // Cancellation/pausing, expired leases and reclamation cannot update cached observations.
        await schedule();
        const old = await claimCollection(db.sql);
        assert.ok(old);
        const oldCache = await sourceCache(db.sql, old);
        assert.ok(oldCache);
        await db.sql.query(
          "UPDATE research_jobs SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1",
          [old.id],
        );
        assert.equal(
          await finishNotModified(
            db.sql,
            old,
            oldCache,
            safeValidators({ etag: '"forged"' }),
          ),
          "discarded",
        );
        const reclaimed = await claimCollection(db.sql);
        assert.ok(reclaimed);
        assert.equal(
          await finishNotModified(db.sql, old, oldCache, safeValidators()),
          "discarded",
        );
        // A cache changed after request dispatch cannot be used as proof about another snapshot.
        await db.sql.query(
          "UPDATE source_http_validators SET etag=$2 WHERE source_id=$1",
          [source.id, '"changed-under-request"'],
        );
        await assert.rejects(
          () =>
            finishNotModified(db.sql, reclaimed, oldCache, safeValidators()),
          /validator_cache_changed/,
        );
        await collectionPolicy(db.sql, actor, { ...policy, enabled: false });
        assert.equal(
          await finishNotModified(
            db.sql,
            reclaimed,
            oldCache,
            safeValidators(),
          ),
          "discarded",
        );
        assert.equal(
          await finishCollection(db.sql, reclaimed, body, {
            etag: '"late"',
            lastModified: null,
          }),
          "discarded",
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT etag FROM source_http_validators WHERE source_id=$1",
              [source.id],
            )
          ).rows[0].etag,
          '"changed-under-request"',
        );
        assert.equal(
          JSON.stringify(
            (
              await db.sql.query(
                "SELECT id,revision,verified_at FROM opportunities ORDER BY id",
              )
            ).rows,
          ),
          verified,
        );
        assert.equal(
          Number(
            (await db.sql.query("SELECT COUNT(*) AS n FROM research_usage"))
              .rows[0].n,
          ),
          0,
        );
        // Database identity binds the snapshot to the same source.
        const another = await createSource(db.sql, actor, {
          name: "Other fixture source",
          url: "https://university.example.edu/other",
        });
        await assert.rejects(() =>
          db.sql.query(
            "INSERT INTO source_http_validators(source_id,snapshot_id,url) VALUES($1,$2,$3)",
            [another.id, cacheRow.snapshot_id, another.url],
          ),
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
