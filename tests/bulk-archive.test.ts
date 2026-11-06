import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openDatabase, type SQL } from "../src/db";
import {
  seedLocalCatalogue,
  fixtureDetails,
  fixtureEvidence,
} from "../src/catalogue/fixtures";
import {
  createDraft,
  reviewOpportunity,
  revisionHistory,
} from "../src/catalogue/service";
import { bulkArchive } from "../src/catalogue/bulk-archive";
import BulkArchive from "../app/admin/catalogue/bulk-archive";
import { LocaleProvider } from "../src/i18n/context";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: bounded bulk archives keep per-record revisions/audit and stop on unconfirmed or unauthorized outcomes`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-bulk-archive-")),
        schema = "bulk_archive_" + randomUUID().replaceAll("-", "");
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
        const source = (
          await db.sql.query(
            "SELECT source_id FROM opportunities WHERE id='synthetic-course'",
          )
        ).rows[0].source_id;
        const make = async (state = "rejected") => {
          const draft = await createDraft(db.sql, actor, {
            sourceId: source,
            details: fixtureDetails,
            evidence: fixtureEvidence,
            note: "Create bulk archive fixture.",
          });
          let expectedRevision = 1;
          if (state === "published" || state === "closed") {
            await reviewOpportunity(db.sql, actor, draft.id, {
              action: "publish",
              expectedRevision,
              verified: true,
              note: "Verify the synthetic fixture before publication.",
            });
            expectedRevision++;
          }
          if (state === "closed" || state === "rejected") {
            await reviewOpportunity(db.sql, actor, draft.id, {
              action: state === "closed" ? "close" : "reject",
              expectedRevision,
              note: "Prepare an eligible archive fixture.",
            });
            expectedRevision++;
          }
          return { id: draft.id, expectedRevision };
        };
        const a = await make(),
          b = await make("closed"),
          stale = await make(),
          draft = await make("draft"),
          published = await make("published");
        const note = "Bulk archive after operator review.";
        for (const input of [
          { items: [], note },
          { items: [a, a], note },
          {
            items: Array.from({ length: 26 }, () => ({
              id: randomUUID(),
              expectedRevision: 1,
            })),
            note,
          },
          { items: [{ ...a, expectedRevision: 0 }], note },
          { items: [a], note: "bad" },
          { items: [a], note, action: "publish" },
        ])
          await assert.rejects(bulkArchive(db.sql, actor, input));
        await assert.rejects(
          bulkArchive(db.sql, "non-admin", { items: [a], note }),
          /Administrator/,
        );
        assert.equal(
          (await revisionHistory(db.sql, actor, a.id)).length,
          2,
          "invalid batches make no changes",
        );
        const missing = { id: randomUUID(), expectedRevision: 1 };
        const mixed = await bulkArchive(db.sql, actor, {
          items: [
            a,
            b,
            { ...stale, expectedRevision: 1 },
            missing,
            draft,
            published,
          ],
          note,
        });
        assert.equal(mixed.stoppedEarly, false);
        assert.deepEqual(
          mixed.results.map((row) => row.outcome),
          ["archived", "archived", "skipped", "skipped", "skipped", "skipped"],
        );
        assert.deepEqual(
          mixed.results
            .slice(2)
            .map((row) => (row.outcome === "skipped" ? row.reason : null)),
          ["conflict", "not_found", "ineligible", "ineligible"],
        );
        const history = await revisionHistory(db.sql, actor, a.id);
        assert.equal(history.length, 3);
        assert.equal(history[0].state, "archived");
        assert.equal(history[0].note, note);
        assert.equal(history[0].actor_id, actor);
        assert.equal(
          (
            await db.sql.query("SELECT state FROM opportunities WHERE id=$1", [
              published.id,
            ])
          ).rows[0].state,
          "published",
        );
        assert.equal(
          (await bulkArchive(db.sql, actor, { items: [a], note })).results[0]
            .outcome,
          "skipped",
        );
        assert.equal(
          (await revisionHistory(db.sql, actor, a.id)).length,
          3,
          "replay does not add revisions",
        );
        const race = await make();
        const concurrent = await Promise.all([
          bulkArchive(db.sql, actor, { items: [race], note }),
          bulkArchive(db.sql, actor, { items: [race], note }),
        ]);
        assert.equal(
          concurrent
            .flatMap((result) => result.results)
            .filter((row) => row.outcome === "archived").length,
          1,
        );
        assert.equal((await revisionHistory(db.sql, actor, race.id)).length, 3);
        const uncertain = await Promise.all([make(), make(), make()]);
        let transactions = 0;
        const interrupted: SQL = {
          query: db.sql.query.bind(db.sql),
          exec: db.sql.exec.bind(db.sql),
          transaction: async (fn) => {
            if (++transactions === 2)
              throw Error("Simulated database interruption");
            return db.sql.transaction(fn);
          },
        };
        const stopped = await bulkArchive(interrupted, actor, {
          items: uncertain,
          note,
        });
        assert.equal(stopped.stoppedEarly, true);
        assert.deepEqual(
          stopped.results.map((row) => row.outcome),
          ["archived", "unknown", "not_attempted"],
        );
        assert.equal(
          (await revisionHistory(db.sql, actor, uncertain[2].id)).length,
          2,
        );
        const revoked = await Promise.all([make(), make(), make()]);
        let checks = 0;
        const losingRole: SQL = {
          exec: db.sql.exec.bind(db.sql),
          transaction: db.sql.transaction.bind(db.sql),
          query: async <T extends Record<string, unknown>>(
            sql: string,
            params?: unknown[],
          ) => {
            if (
              sql.includes("SELECT user_id FROM admin_roles") &&
              ++checks === 3
            )
              await db.sql.query("DELETE FROM admin_roles WHERE user_id=$1", [
                actor,
              ]);
            return db.sql.query<T>(sql, params);
          },
        };
        const denied = await bulkArchive(losingRole, actor, {
          items: revoked,
          note,
        });
        assert.deepEqual(
          denied.results.map((row) => row.outcome),
          ["archived", "skipped", "not_attempted"],
        );
        assert.equal(denied.stoppedEarly, true);
        await db.sql.query("INSERT INTO admin_roles(user_id) VALUES($1)", [
          actor,
        ]);
        assert.equal(
          (await revisionHistory(db.sql, actor, revoked[2].id)).length,
          2,
        );
        for (const [locale, pattern] of [
          ["en", /Archive closed or rejected/],
          ["zh-Hans", /批量归档本页/],
        ] as const) {
          const html = renderToStaticMarkup(
            createElement(LocaleProvider, {
              locale,
              children: createElement(BulkArchive, {
                items: [
                  {
                    id: stale.id,
                    title: "Eligible fixture",
                    revision: stale.expectedRevision,
                    state: "rejected",
                  },
                ],
              }),
            }),
          );
          assert.match(html, pattern);
          assert.match(html, /name="archiveRecord"/);
          assert.match(html, /name="note"/);
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
