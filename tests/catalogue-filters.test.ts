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
  createDraft,
  reviewOpportunity,
  listPublic,
} from "../src/catalogue/service";
import {
  parseFilters,
  parseSearchFilters,
  type Details,
} from "../src/catalogue/schema";
test("catalogue filter parsing rejects invalid and duplicate fields without widening a query", () => {
  assert.equal(
    parseSearchFilters(
      new URLSearchParams("topic=digital+twins&country=CN&page=2"),
    ).topic,
    "digital twins",
  );
  for (const query of [
    "mode=invalid",
    "country=US",
    "topic=x",
    "deadline=yesterday",
    "studyLevel=postdoc",
    "page=0",
    "page=2&page=3",
    "topic=robotics&topic=twins",
    "userId=other",
  ]) {
    assert.throws(() => parseSearchFilters(new URLSearchParams(query)), query);
  }
  assert.throws(() => parseFilters({ mode: ["online", "in_person"] }));
});
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: combined public filters preserve unknown facts, literal topics, freshness and pagination`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-filters-"));
      const schema = "filters_" + randomUUID().replaceAll("-", "");
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
        const sourceId = (
          await db.sql.query(
            "SELECT source_id FROM opportunities WHERE id='synthetic-course'",
          )
        ).rows[0].source_id;
        const day = (offset: number) =>
          new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
        async function publish(index: string, change: Partial<Details> = {}) {
          const draft = await createDraft(db.sql, "local-fixture-reviewer", {
            sourceId,
            details: {
              ...fixtureDetails,
              title: "Filter fixture " + index,
              topics: ["digital twins", "advanced digital twins"],
              deadline: day(7),
              deadlineText: "Source date only; timezone not stated.",
              ...change,
            },
            evidence: fixtureEvidence,
            note: "Seed reviewed filter fixture.",
          });
          await reviewOpportunity(db.sql, "local-fixture-reviewer", draft.id, {
            action: "publish",
            expectedRevision: 1,
            verified: true,
            note: "Verify synthetic filter source evidence.",
          });
          return draft.id;
        }
        const ids: string[] = [];
        for (let i = 0; i < 13; i++)
          ids.push(
            await publish(String(i), {
              category: "scholarship",
              mode: "in_person",
              country: "CN",
              funding: "tuition_only",
              tuitionCovered: true,
              studyLevel: "master",
            }),
          );
        const criteria = {
          topic: "DIGITAL TWINS",
          category: "scholarship",
          mode: "in_person",
          country: "CN",
          studyLevel: "master",
          funding: "tuition_only",
          language: "en",
          deadline: "next_30_days",
        } as const;
        const first = await listPublic(db.sql, criteria),
          second = await listPublic(db.sql, { ...criteria, page: 2 });
        assert.equal(first.total, 13);
        assert.equal(first.items.length, 12);
        assert.equal(second.items.length, 1);
        assert.equal(
          new Set([...first.items, ...second.items].map((item) => item.id))
            .size,
          13,
        );
        assert.equal(
          (await listPublic(db.sql, { ...criteria, mode: "online" })).total,
          0,
        );
        assert.equal(
          (await listPublic(db.sql, { ...criteria, studyLevel: "not_stated" }))
            .total,
          0,
        );
        const unknown = await publish("unknown", {
          deadline: null,
          deadlineText: null,
          topics: ["robotics"],
        });
        const unknownResult = await listPublic(db.sql, {
          country: "not_stated",
          studyLevel: "not_stated",
          deadline: "not_stated",
          topic: "robotics",
        });
        assert.deepEqual(
          unknownResult.items.map((item) => item.id),
          [unknown],
        );
        await publish("far", { deadline: day(31) });
        await publish("boundary", { deadline: day(30) });
        assert.equal(
          (
            await listPublic(db.sql, {
              topic: "digital twins",
              deadline: "next_30_days",
            })
          ).total,
          14,
        );
        assert.equal(
          (
            await listPublic(db.sql, {
              topic: "digital twins",
              deadline: "dated",
            })
          ).total,
          15,
        );
        const literal = await publish("literal", {
          topics: ["yield_50% automation"],
        });
        assert.deepEqual(
          (await listPublic(db.sql, { topic: "50%" })).items.map(
            (item) => item.id,
          ),
          [literal],
        );
        assert.equal((await listPublic(db.sql, { topic: "50_" })).total, 0);
        assert.equal(
          (await listPublic(db.sql, { topic: "' OR 1=1 --" })).total,
          0,
        );
        const hidden = await createDraft(db.sql, "local-fixture-reviewer", {
          sourceId,
          details: {
            ...fixtureDetails,
            title: "Private filter draft",
            topics: ["digital twins", "advanced digital twins"],
          },
          evidence: fixtureEvidence,
          note: "Do not publish this fixture.",
        });
        assert.ok(
          !(await listPublic(db.sql, { topic: "digital twins" })).items.some(
            (item) => item.id === hidden.id,
          ),
        );
        await db.sql.query(
          "UPDATE opportunities SET verified_at=NOW()-INTERVAL '8 days' WHERE id=$1",
          [ids[0]],
        );
        await db.sql.query(
          "UPDATE opportunities SET details=jsonb_set(details,'{deadline}',to_jsonb($2::text)) WHERE id=$1",
          [ids[1], day(0)],
        );
        await reviewOpportunity(db.sql, "local-fixture-reviewer", ids[2], {
          action: "close",
          expectedRevision: 2,
          note: "Close filter fixture.",
        });
        assert.equal((await listPublic(db.sql, criteria)).total, 10);
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
