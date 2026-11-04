import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import {
  createDraft,
  createSource,
  reviewOpportunity,
  revisionHistory,
} from "../src/catalogue/service";
import { fixtureDetails, fixtureEvidence } from "../src/catalogue/fixtures";
import { browseAdmin, parseAdminBrowse } from "../src/catalogue/admin-browse";

for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: archive is limited to closed or rejected records and is audited`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-lifecycle-archive-")),
        schema = "archive_" + randomUUID().replaceAll("-", "");
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
        const actor = "local-fixture-reviewer";
        await db.sql.query(
          "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,'Reviewer','archive-reviewer@example.test',NOW(),NOW()) ON CONFLICT(id) DO NOTHING",
          [actor],
        );
        await db.sql.query(
          "INSERT INTO admin_roles(user_id) VALUES($1) ON CONFLICT DO NOTHING",
          [actor],
        );
        const source = await createSource(db.sql, actor, {
          name: "Archive test source",
          url: "https://example.test/archive-source",
          synthetic: true,
        });
        const closed = await createDraft(db.sql, actor, {
          sourceId: source.id,
          details: fixtureDetails,
          evidence: fixtureEvidence,
          note: "Create a record to close and archive.",
        });
        await assert.rejects(
          () =>
            reviewOpportunity(db.sql, actor, closed.id, {
              action: "archive",
              expectedRevision: 1,
              note: "A draft cannot be archived.",
            }),
          /Only closed or rejected/,
        );
        await reviewOpportunity(db.sql, actor, closed.id, {
          action: "publish",
          expectedRevision: 1,
          verified: true,
          note: "Verify the source before publication.",
        });
        await reviewOpportunity(db.sql, actor, closed.id, {
          action: "close",
          expectedRevision: 2,
          note: "The source confirms applications have closed.",
        });
        const archived = await reviewOpportunity(db.sql, actor, closed.id, {
          action: "archive",
          expectedRevision: 3,
          note: "Archive this closed record from active catalogue review.",
        });
        assert.deepEqual(archived, {
          id: closed.id,
          revision: 4,
          state: "archived",
        });
        const history = await revisionHistory(db.sql, actor, closed.id);
        assert.equal(history[0].state, "archived");
        assert.equal(
          history[0].note,
          "Archive this closed record from active catalogue review.",
        );

        const rejected = await createDraft(db.sql, actor, {
          sourceId: source.id,
          details: fixtureDetails,
          evidence: fixtureEvidence,
          note: "Create a separate record to reject and archive.",
        });
        await reviewOpportunity(db.sql, actor, rejected.id, {
          action: "reject",
          expectedRevision: 1,
          note: "Reject this record because its source is insufficient.",
        });
        await reviewOpportunity(db.sql, actor, rejected.id, {
          action: "archive",
          expectedRevision: 2,
          note: "Archive this rejected record after review.",
        });
        assert.equal(
          (await browseAdmin(db.sql, actor, { state: "archived" })).total,
          2,
        );
        assert.equal(
          parseAdminBrowse(new URLSearchParams("state=archived")).state,
          "archived",
        );
      } finally {
        await db.close();
        await pool?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await pool?.end();
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
