import test from "node:test";
import assert from "node:assert/strict";
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
  adminCatalogue,
  createSource,
  createDraft,
  reviewOpportunity,
} from "../src/catalogue/service";
import {
  browseAdmin,
  reviewEditorData,
  parseAdminBrowse,
  editorQuerySchema,
  queryFields,
} from "../src/catalogue/admin-browse";
test("admin browse and editor parameters reject ambiguous or unsupported selections", () => {
  assert.equal(
    parseAdminBrowse(new URLSearchParams("kind=sources&q=fixture&page=2")).page,
    2,
  );
  for (const value of [
    "kind=users",
    "kind=sources&state=draft",
    "page=0",
    "q=a&q=b",
    "userId=other",
  ])
    assert.throws(() => parseAdminBrowse(new URLSearchParams(value)));
  assert.throws(() =>
    editorQuerySchema.parse({ edit: "one", source: "other" }),
  );
  assert.throws(() =>
    editorQuerySchema.parse(
      queryFields(new URLSearchParams("edit=one&edit=two")),
    ),
  );
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: paginated admin browsing reaches records and sources beyond the latest 100`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-admin-browse-")),
        schema = "browse_" + randomUUID().replaceAll("-", "");
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
        const oldSource = await createSource(db.sql, actor, {
          name: "Older original source",
          url: "https://example.test/old-source",
          synthetic: true,
        });
        const oldRecord = await createDraft(db.sql, actor, {
          sourceId: oldSource.id,
          details: {
            ...fixtureDetails,
            title: "Older private original record",
          },
          evidence: fixtureEvidence,
          note: "Original older source evidence.",
        });
        await db.sql.query(
          "UPDATE sources SET created_at='2000-01-01T00:00:00Z' WHERE id=$1",
          [oldSource.id],
        );
        await db.sql.query(
          "UPDATE opportunities SET updated_at='2000-01-01T00:00:00Z' WHERE id=$1",
          [oldRecord.id],
        );
        const sources = Array.from({ length: 102 }, (_, index) => ({
          id: randomUUID(),
          name: "Bulk registry " + index,
          url: "https://example.test/bulk-source-" + index,
        }));
        await db.sql.query(
          "INSERT INTO sources(id,name,url,synthetic,created_by) SELECT item.id,item.name,item.url,true,$2 FROM jsonb_to_recordset($1::jsonb) AS item(id text,name text,url text)",
          [JSON.stringify(sources), actor],
        );
        const records = sources.map((source, index) => ({
          id: randomUUID(),
          source_id: source.id,
          details: { ...fixtureDetails, title: "Bulk opportunity " + index },
        }));
        await db.sql.query(
          "INSERT INTO opportunities(id,source_id,revision,state,details,evidence) SELECT item.id,item.source_id,1,'draft',item.details,$2::jsonb FROM jsonb_to_recordset($1::jsonb) AS item(id text,source_id text,details jsonb)",
          [JSON.stringify(records), JSON.stringify(fixtureEvidence)],
        );
        await db.sql.query(
          "INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note) SELECT item.id,1,'draft',item.details,$2::jsonb,$3,'Seeded private registry fixture.' FROM jsonb_to_recordset($1::jsonb) AS item(id text,details jsonb)",
          [JSON.stringify(records), JSON.stringify(fixtureEvidence), actor],
        );
        const legacy = await adminCatalogue(db.sql, actor);
        assert.ok(!legacy.sources.some((row) => row.id === oldSource.id));
        assert.ok(!legacy.opportunities.some((row) => row.id === oldRecord.id));
        const first = await browseAdmin(db.sql, actor, {
            q: "Bulk opportunity",
            state: "draft",
          }),
          second = await browseAdmin(db.sql, actor, {
            q: "Bulk opportunity",
            state: "draft",
            page: 2,
          });
        assert.equal(first.total, 102);
        assert.equal(first.items.length, 25);
        assert.equal(second.items.length, 25);
        assert.equal(
          new Set([...first.items, ...second.items].map((row) => row.id)).size,
          50,
        );
        assert.equal(
          (
            await browseAdmin(db.sql, actor, {
              kind: "sources",
              q: "Bulk registry",
              page: 5,
            })
          ).items.length,
          2,
        );
        assert.equal(
          (
            await browseAdmin(db.sql, actor, {
              q: "Bulk opportunity",
              state: "published",
            })
          ).total,
          0,
        );
        const selected = await reviewEditorData(db.sql, actor, {
          edit: oldRecord.id,
        });
        assert.equal(selected.editing?.id, oldRecord.id);
        assert.equal(selected.sourceId, oldSource.id);
        assert.ok(selected.sources.some((row) => row.id === oldSource.id));
        assert.ok(
          selected.opportunities.some((row) => row.id === oldRecord.id),
        );
        assert.ok(selected.sources.length <= 101);
        const selectedSource = await reviewEditorData(db.sql, actor, {
          source: oldSource.id,
        });
        assert.equal(selectedSource.editing, null);
        assert.ok(
          selectedSource.sources.some((row) => row.id === oldSource.id),
        );
        await reviewOpportunity(db.sql, actor, oldRecord.id, {
          action: "revise",
          expectedRevision: 1,
          details: { ...fixtureDetails, title: "Older private revised record" },
          evidence: fixtureEvidence,
          note: "Original revision through selected source.",
        });
        const refreshed = await reviewEditorData(db.sql, actor, {
          source: oldSource.id,
        });
        assert.ok(refreshed.sources.some((row) => row.id === oldSource.id));
        assert.equal(
          refreshed.opportunities.find((row) => row.id === oldRecord.id)?.state,
          "draft",
        );
        await createDraft(db.sql, actor, {
          sourceId: oldSource.id,
          details: fixtureDetails,
          evidence: fixtureEvidence,
          note: "Create another draft from the older source.",
        });
        const literal = await createSource(db.sql, actor, {
          name: "Rate_100% source",
          url: "https://example.test/rate-source",
          synthetic: true,
        });
        assert.deepEqual(
          (
            await browseAdmin(db.sql, actor, { kind: "sources", q: "100%" })
          ).items.map((row) => row.id),
          [literal.id],
        );
        assert.equal(
          (await browseAdmin(db.sql, actor, { q: "' OR 1=1 --" })).total,
          0,
        );
        await assert.rejects(
          () => browseAdmin(db.sql, "not-admin"),
          /Administrator/,
        );
        await assert.rejects(
          () => reviewEditorData(db.sql, "not-admin", { edit: oldRecord.id }),
          /Administrator/,
        );
        await assert.rejects(
          () => reviewEditorData(db.sql, actor, { edit: "missing" }),
          /not found/,
        );
        await assert.rejects(
          () => reviewEditorData(db.sql, actor, { source: "missing" }),
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
