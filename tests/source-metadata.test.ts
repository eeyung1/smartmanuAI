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
import { createSource, listPublic } from "../src/catalogue/service";
import { updateSourceMetadata } from "../src/catalogue/source-metadata";
import {
  collectionPolicy,
  researchDashboard,
} from "../src/research/collection";
import { selectedResearchData } from "../src/research/browse";
import SourceMetadataFields from "../app/components/source-metadata-fields";
import { LocaleProvider } from "../src/i18n/context";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: admin source labels default unknown, reject stale edits and leave verification and collection unchanged`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-source-meta-")),
        schema = "source_meta_" + randomUUID().replaceAll("-", "");
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
        const source = await createSource(db.sql, actor, {
          name: "Operator metadata fixture",
          url: "https://school.example.edu/source",
        });
        assert.equal(source.sourceType, "unknown");
        assert.equal(source.sourceLanguage, "unknown");
        assert.equal(source.metadataVersion, 1);
        const explicit = await createSource(db.sql, actor, {
          name: "Multilingual scholarship source",
          url: "https://school.example.edu/scholarships",
          sourceType: "scholarship_body",
          sourceLanguage: "multilingual",
        });
        assert.equal(explicit.sourceType, "scholarship_body");
        await collectionPolicy(db.sql, actor, {
          sourceId: source.id,
          enabled: false,
          permissionNote: "Metadata changes must not enable collection.",
          cadenceHours: 168,
        });
        const before = (
          await db.sql.query(
            "SELECT enabled,permission_note,next_due_at::text AS due,cadence_hours FROM source_collection_policies WHERE source_id=$1",
            [source.id],
          )
        ).rows[0];
        const publicBefore = await listPublic(db.sql);
        const update = {
          sourceId: source.id,
          expectedVersion: 1,
          sourceType: "university",
          sourceLanguage: "zh",
        };
        for (const invalid of [
          { ...update, sourceType: "official" },
          { ...update, sourceLanguage: "fr" },
          { ...update, sourceType: null },
          { ...update, url: "https://another.example.edu" },
          { ...update, enabled: true },
          { ...update, synthetic: true },
          { ...update, expectedVersion: 0 },
        ])
          await assert.rejects(updateSourceMetadata(db.sql, actor, invalid));
        await assert.rejects(
          updateSourceMetadata(db.sql, "non-admin", update),
          /Administrator/,
        );
        const concurrent = await Promise.allSettled([
          updateSourceMetadata(db.sql, actor, update),
          updateSourceMetadata(db.sql, actor, update),
        ]);
        assert.equal(
          concurrent.filter((v) => v.status === "fulfilled").length,
          1,
        );
        assert.match(
          String(concurrent.find((v) => v.status === "rejected")?.reason),
          /Reload/,
        );
        const stored = (
          await db.sql.query(
            "SELECT source_type,source_language,metadata_version,url,synthetic FROM sources WHERE id=$1",
            [source.id],
          )
        ).rows[0];
        assert.equal(stored.metadata_version, 2);
        assert.equal(stored.source_type, "university");
        assert.equal(stored.source_language, "zh");
        assert.equal(stored.url, source.url);
        assert.equal(stored.synthetic, false);
        assert.deepEqual(
          (
            await db.sql.query(
              "SELECT enabled,permission_note,next_due_at::text AS due,cadence_hours FROM source_collection_policies WHERE source_id=$1",
              [source.id],
            )
          ).rows[0],
          before,
        );
        assert.deepEqual(await listPublic(db.sql), publicBefore);
        // Metadata labels on a source with a published record must not reverify that record.
        const fixture = (
          await db.sql.query(
            "SELECT source_id,verified_at::text AS verified FROM opportunities WHERE id='synthetic-course'",
          )
        ).rows[0];
        await updateSourceMetadata(db.sql, actor, {
          ...update,
          sourceId: fixture.source_id,
          sourceLanguage: "en",
        });
        assert.equal(
          (
            await db.sql.query(
              "SELECT verified_at::text AS verified FROM opportunities WHERE id='synthetic-course'",
            )
          ).rows[0].verified,
          fixture.verified,
        );
        assert.doesNotMatch(
          JSON.stringify(await listPublic(db.sql)),
          /source_type|source_language|metadata_version/,
        );
        await assert.rejects(
          db.sql.query(
            "UPDATE sources SET source_type='official' WHERE id=$1",
            [source.id],
          ),
        );
        await assert.rejects(
          updateSourceMetadata(db.sql, actor, {
            ...update,
            sourceId: randomUUID(),
          }),
          /Source not found/,
        );
        // The selected-source editor must retain metadata even beyond the latest dashboard window.
        await db.sql.query(
          "UPDATE sources SET created_at='2000-01-01' WHERE id=$1",
          [source.id],
        );
        const dummy = Array.from({ length: 101 }, () => ({ id: randomUUID() }));
        await db.sql.query(
          "INSERT INTO sources(id,name,url,created_by) SELECT x.id,'Other source','https://school.example.edu/'||x.id,$2 FROM jsonb_to_recordset($1::jsonb) AS x(id text)",
          [JSON.stringify(dummy), actor],
        );
        assert.ok(
          !(await researchDashboard(db.sql, actor)).sources.some(
            (s) => s.id === source.id,
          ),
        );
        const selected = (
          await selectedResearchData(db.sql, actor, { source: source.id })
        ).data.sources.find((s) => s.id === source.id);
        assert.equal(selected?.source_type, "university");
        assert.equal(selected?.source_language, "zh");
        assert.equal(selected?.metadata_version, 2);
        for (const [locale, pattern] of [
          ["en", /Source language/],
          ["zh-Hans", /来源语言/],
        ] as const) {
          const html = renderToStaticMarkup(
            createElement(LocaleProvider, {
              locale,
              children: createElement(SourceMetadataFields, {
                sourceType: "university",
                sourceLanguage: "zh",
              }),
            }),
          );
          assert.match(html, pattern);
          assert.match(html, /<option value="zh" selected="">/);
          assert.match(html, /name="sourceType"/);
        }
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
