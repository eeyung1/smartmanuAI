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
  researchDashboard,
  collectionPolicy,
} from "../src/research/collection";
import { applyExtraction } from "../src/research/extraction";
import {
  browseResearch,
  parseResearchBrowse,
  selectedResearchData,
  researchSelectionSchema,
} from "../src/research/browse";
import { queryFields } from "../src/catalogue/admin-browse";
test("research parameters reject ambiguous selections and states from another list", () => {
  assert.equal(
    parseResearchBrowse(new URLSearchParams("kind=jobs&state=done&page=2"))
      .page,
    2,
  );
  for (const input of [
    "kind=users",
    "kind=jobs&state=pending",
    "kind=candidates&state=enabled",
    "page=0",
    "q=a&q=b",
    "source=bad",
    "userId=other",
  ])
    assert.throws(() => parseResearchBrowse(new URLSearchParams(input)));
  const id = randomUUID();
  assert.throws(() =>
    researchSelectionSchema.parse({ source: id, candidate: id }),
  );
  assert.throws(() =>
    researchSelectionSchema.parse(
      queryFields(new URLSearchParams("source=" + id + "&source=" + id)),
    ),
  );
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: research browsing reaches older sources, jobs and candidates and retains selected records after review`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-research-browse-")),
        schema = "research_browse_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", `-c search_path=${schema}`);
        url = parsed.href;
      }
      const db = await openDatabase(dir, url);
      try {
        await seedLocalCatalogue(db.sql);
        const actor = "local-fixture-reviewer";
        const old = await createSource(db.sql, actor, {
          name: "Older_100% original source",
          url: "https://example.test/older-research",
          synthetic: true,
        });
        await db.sql.query(
          "UPDATE sources SET created_at='2000-01-01' WHERE id=$1",
          [old.id],
        );
        const sources = Array.from({ length: 102 }, (_, i) => ({
          id: randomUUID(),
          name: "Research bulk " + i,
          url: "https://example.test/research-" + i,
        }));
        await db.sql.query(
          "INSERT INTO sources(id,name,url,synthetic,created_by) SELECT x.id,x.name,x.url,true,$2 FROM jsonb_to_recordset($1::jsonb) AS x(id text,name text,url text)",
          [JSON.stringify(sources), actor],
        );
        const records = [
          { id: randomUUID(), source_id: old.id },
          ...sources.map((s) => ({ id: randomUUID(), source_id: s.id })),
        ];
        const content =
          "Original smart manufacturing excerpt <script>untrusted()</script>";
        await db.sql.query(
          "INSERT INTO source_snapshots(id,source_id,content_hash,content) SELECT x.id,x.source_id,x.id,$2 FROM jsonb_to_recordset($1::jsonb) AS x(id text,source_id text)",
          [JSON.stringify(records), content],
        );
        await db.sql.query(
          "INSERT INTO research_candidates(id,snapshot_id,created_at) SELECT x.id,x.id,CASE WHEN x.source_id=$2 THEN '2000-01-01'::timestamptz ELSE NOW() END FROM jsonb_to_recordset($1::jsonb) AS x(id text,source_id text)",
          [JSON.stringify(records), old.id],
        );
        await db.sql.query(
          "INSERT INTO research_jobs(id,source_id,state,attempts,created_at) SELECT x.id,x.source_id,'done',1,CASE WHEN x.source_id=$2 THEN '2000-01-01'::timestamptz ELSE NOW() END FROM jsonb_to_recordset($1::jsonb) AS x(id text,source_id text)",
          [JSON.stringify(records), old.id],
        );
        const legacy = await researchDashboard(db.sql, actor);
        assert.equal(legacy.sources.length, 100);
        assert.equal(legacy.jobs.length, 50);
        assert.equal(legacy.candidates.length, 25);
        assert.ok(!legacy.sources.some((x) => x.id === old.id));
        assert.ok(!legacy.candidates.some((x) => x.id === records[0].id));
        for (const list of ["sources", "jobs", "candidates"]) {
          const first = await browseResearch(db.sql, actor, {
              kind: list,
              q: "Research bulk",
            }),
            second = await browseResearch(db.sql, actor, {
              kind: list,
              q: "Research bulk",
              page: 2,
            });
          assert.equal(first.total, 102);
          assert.equal(first.items.length, 25);
          assert.equal(second.items.length, 25);
          assert.equal(
            new Set([...first.items, ...second.items].map((x) => x.id)).size,
            50,
          );
          assert.equal(
            (
              await browseResearch(db.sql, actor, {
                kind: list,
                q: "Research bulk",
                page: 5,
              })
            ).items.length,
            2,
          );
          assert.equal(
            (
              await browseResearch(db.sql, actor, {
                kind: list,
                source: old.id,
              })
            ).total,
            1,
          );
        }
        assert.equal(
          (await browseResearch(db.sql, actor, { q: "100%" })).items[0].id,
          old.id,
        );
        assert.equal(
          (await browseResearch(db.sql, actor, { q: "' OR 1=1 --" })).total,
          0,
        );
        assert.equal(
          (
            await browseResearch(db.sql, actor, {
              kind: "jobs",
              state: "failed",
            })
          ).total,
          0,
        );
        assert.equal(
          (await browseResearch(db.sql, actor, { state: "enabled" })).total,
          0,
        );
        const selected = await selectedResearchData(db.sql, actor, {
          candidate: records[0].id,
        });
        assert.equal(selected.data.candidates[0].content, content);
        assert.equal(selected.data.sources[0].id, old.id);
        assert.ok(selected.data.sources.length <= 101);
        assert.ok(selected.data.candidates.length <= 26);
        await collectionPolicy(db.sql, actor, {
          sourceId: old.id,
          enabled: false,
          permissionNote: "Original policy note retained.",
        });
        const policy = await selectedResearchData(db.sql, actor, {
          source: old.id,
        });
        assert.equal(
          policy.data.sources[0].permission_note,
          "Original policy note retained.",
        );
        await applyExtraction(db.sql, actor, records[0].id, {
          relevant: false,
          details: null,
          evidence: Object.fromEntries(
            ["title", "funding", "deadline", "eligibility"].map((key) => [
              key,
              { quote: null, reason: "Unsupported opportunity details." },
            ]),
          ),
        });
        const refreshed = await selectedResearchData(db.sql, actor, {
          candidate: records[0].id,
        });
        assert.equal(refreshed.data.candidates[0].state, "rejected");
        assert.equal(refreshed.data.candidates[0].content, content);
        assert.equal(refreshed.data.sources[0].id, old.id);
        assert.equal(
          (
            await browseResearch(db.sql, actor, {
              kind: "candidates",
              source: old.id,
              state: "rejected",
            })
          ).total,
          1,
        );
        assert.equal(
          Number(
            (await db.sql.query("SELECT COUNT(*) AS n FROM research_usage"))
              .rows[0].n,
          ),
          0,
        );
        for (const fn of [
          () => browseResearch(db.sql, "not-admin"),
          () => selectedResearchData(db.sql, "not-admin", { source: old.id }),
        ])
          await assert.rejects(fn, /Administrator/);
        for (const input of [
          { source: randomUUID() },
          { candidate: randomUUID() },
        ])
          await assert.rejects(
            () => selectedResearchData(db.sql, actor, input),
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
