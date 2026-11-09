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
import { createDraft, reviewOpportunity } from "../src/catalogue/service";
import {
  auditHistory,
  historyChanges,
  parseHistoryQuery,
} from "../src/catalogue/history";
test("audit comparisons preserve missing/null/zero/type differences and ignore object key order", () => {
  const prior = {
    revision: 1,
    state: "draft",
    details: {
      fee: null,
      covered: null,
      rules: { age: 20, level: "master" },
      kind: {},
      order: ["a", "b"],
    },
    evidence: { title: "Original <source>" },
  };
  const current = {
    revision: 2,
    state: "published",
    details: {
      fee: "0",
      covered: false,
      rules: { level: "master", age: 20 },
      kind: [],
      order: ["b", "a"],
      newUnknown: null,
    },
    evidence: { title: "Original <source>" },
  };
  const changes = historyChanges(current, prior);
  assert.deepEqual(
    changes.map((change) => change.field),
    [
      "state",
      "details.covered",
      "details.fee",
      "details.kind",
      "details.newUnknown",
      "details.order",
    ],
  );
  assert.equal(
    changes.find((change) => change.field === "details.fee")?.before.value,
    null,
  );
  assert.equal(
    changes.find((change) => change.field === "details.fee")?.after.value,
    "0",
  );
  assert.equal(
    changes.find((change) => change.field === "details.newUnknown")?.before
      .present,
    false,
  );
  assert.equal(
    changes.find((change) => change.field === "details.newUnknown")?.after
      .present,
    true,
  );
  assert.deepEqual(historyChanges(prior, { ...prior }), []);
  for (const value of [
    "before=0",
    "before=-1",
    "before=1.5",
    "before=2&before=3",
    "userId=other",
  ])
    assert.throws(() => parseHistoryQuery(new URLSearchParams(value)));
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: admin audit history is bounded, stable across new revisions and read-only`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-audit-")),
        schema = "audit_" + randomUUID().replaceAll("-", "");
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
        const actor = "local-fixture-reviewer",
          sourceId = (
            await db.sql.query(
              "SELECT source_id FROM opportunities WHERE id='synthetic-course'",
            )
          ).rows[0].source_id;
        const draft = await createDraft(db.sql, actor, {
          sourceId,
          details: fixtureDetails,
          evidence: fixtureEvidence,
          note: "Original initial reason.",
        });
        async function revise(number: number) {
          await reviewOpportunity(db.sql, actor, draft.id, {
            action: "revise",
            expectedRevision: number - 1,
            details: { ...fixtureDetails, applicationFee: "CNY " + number },
            evidence: fixtureEvidence,
            note: "Original reason " + number,
          });
        }
        for (let revision = 2; revision <= 27; revision++)
          await revise(revision);
        await assert.rejects(
          () => auditHistory(db.sql, "not-admin", draft.id),
          /Administrator/,
        );
        await assert.rejects(
          () => auditHistory(db.sql, actor, "missing"),
          /not found/,
        );
        await db.sql.query(
          "UPDATE opportunity_revisions SET created_at=$2 WHERE opportunity_id=$1 AND revision=27",
          [draft.id, "2026-11-02T08:00:00.123Z"],
        );
        const first = await auditHistory(db.sql, actor, draft.id);
        assert.equal(first.items[0].createdAt, "2026-11-02T08:00:00.123Z");
        assert.equal(first.items.length, 20);
        assert.equal(first.nextBefore, 8);
        assert.equal(first.items[0].actorId, actor);
        assert.equal(first.items[0].note, "Original reason 27");
        assert.equal(first.items.at(-1)?.comparison, "compared");
        assert.equal(
          first.items
            .at(-1)
            ?.changes.find(
              (change) => change.field === "details.applicationFee",
            )?.before.value,
          "CNY 7",
        );
        await revise(28);
        const second = await auditHistory(db.sql, actor, draft.id, {
          before: first.nextBefore,
        });
        assert.equal(second.items.length, 7);
        assert.equal(second.nextBefore, null);
        assert.equal(second.items.at(-1)?.comparison, "initial");
        assert.equal(
          new Set(
            [...first.items, ...second.items].map((item) => item.revision),
          ).size,
          27,
        );
        assert.deepEqual(
          [...first.items, ...second.items]
            .map((item) => item.revision)
            .sort((a, b) => a - b),
          Array.from({ length: 27 }, (_, index) => index + 1),
        );
        assert.equal(
          (await auditHistory(db.sql, actor, draft.id)).items[0].revision,
          28,
        );
        const counts = await db.sql.query(
          "SELECT COUNT(*) AS total FROM opportunity_revisions WHERE opportunity_id=$1",
          [draft.id],
        );
        await auditHistory(db.sql, actor, draft.id, { before: 1 });
        assert.equal(
          (
            await db.sql.query(
              "SELECT COUNT(*) AS total FROM opportunity_revisions WHERE opportunity_id=$1",
              [draft.id],
            )
          ).rows[0].total,
          counts.rows[0].total,
        );
        await db.sql.query(
          "DELETE FROM opportunity_revisions WHERE opportunity_id=$1 AND revision=27",
          [draft.id],
        );
        assert.equal(
          (await auditHistory(db.sql, actor, draft.id)).items[0].comparison,
          "unavailable",
        );
        await db.sql.query(
          "INSERT INTO sources(id,name,url,created_by) SELECT 'alias-'||n,'Historical source '||n,'https://example.test/alias-'||n,$1 FROM generate_series(1,101) n",
          [actor],
        );
        await db.sql.query(
          "INSERT INTO opportunity_source_aliases(opportunity_id,source_id) SELECT $1,'alias-'||n FROM generate_series(1,101) n",
          [draft.id],
        );
        const aliased = await auditHistory(db.sql, actor, draft.id);
        assert.equal(aliased.sourceAliases.length, 100);
        assert.equal(aliased.aliasesTruncated, true);
        assert.equal(
          Number(
            (
              await db.sql.query(
                "SELECT count(*) AS n FROM opportunity_source_aliases WHERE opportunity_id=$1",
                [draft.id],
              )
            ).rows[0].n,
          ),
          101,
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
