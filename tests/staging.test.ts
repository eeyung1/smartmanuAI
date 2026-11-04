import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import { localConfig } from "../src/config";
import { getAuth } from "../src/auth";
import { stagingSchemaSQL } from "../scripts/lib/staging-schema";
const stage = {
  SMARTMANU_MODE: "staging",
  BETTER_AUTH_URL: "https://smartmanuai-test.vercel.app",
  BETTER_AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters",
  SMARTMANU_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  DATABASE_URL:
    "postgresql://smartmanuai_reader.abcdefghijklmnopqrst:synthetic-test-password@aws-1-eu-west-1.pooler.supabase.com:6543/postgres",
};
test("hosted staging requires explicit isolated reader config and forbids live work", () => {
  assert.equal(localConfig(stage).databaseSchema, "smartmanuai");
  for (const override of [
    { BETTER_AUTH_URL: "http://smartmanuai-test.vercel.app" },
    { BETTER_AUTH_URL: "https://attacker.test" },
    { BETTER_AUTH_URL: "https://smartmanuai-test.vercel.app/path" },
    {
      DATABASE_URL:
        "postgresql://postgres:secret@aws-1-eu-west-1.pooler.supabase.com:6543/postgres",
    },
    { DATABASE_URL: stage.DATABASE_URL + "?sslmode=no-verify" },
    {
      DATABASE_URL: stage.DATABASE_URL.replace(
        "pooler.supabase.com",
        "attacker.test",
      ),
    },
    { SMARTMANU_ENABLE_COLLECTION: "1" },
    { SMARTMANU_ENABLE_PAID_RESEARCH: "1" },
    { SMARTMANU_EMAIL_MODE: "local" },
    { SMARTMANU_SUPABASE_PROJECT_REF: "" },
  ])
    assert.throws(() => localConfig({ ...stage, ...override }));
});
test("staging auth is unavailable without initializing a database or local mail", async () => {
  const previous = { ...process.env };
  try {
    for (const key of [
      "SMARTMANU_ENABLE_COLLECTION",
      "SMARTMANU_ENABLE_PAID_RESEARCH",
      "SMARTMANU_EMAIL_MODE",
      "SMARTMANU_TELEGRAM_MODE",
      "SMARTMANU_DELIVERY_MODE",
    ])
      delete process.env[key];
    Object.assign(process.env, stage);
    const auth = await getAuth();
    assert.equal(await auth.api.getSession({ headers: new Headers() }), null);
    const response = await auth.handler(
      new Request(stage.BETTER_AUTH_URL + "/api/auth/sign-in/magic-link", {
        method: "POST",
      }),
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
test("committed hosted schema SQL matches its deterministic generator", async () =>
  assert.equal(
    await readFile("db/staging/bootstrap.sql", "utf8"),
    (await stagingSchemaSQL()) + "\n",
  ));
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: hosted schema reader can only read reviewed catalogue and cannot access other projects`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-staging-")),
        suffix = randomUUID().replaceAll("-", "").slice(0, 12),
        schema = "staging_" + suffix,
        owner = "owner_" + suffix,
        reader = "reader_" + suffix;
      const db = await openDatabase(
        dir,
        kind === "postgres" ? process.env.TEST_DATABASE_URL : undefined,
      );
      try {
        const operator = String(
          (await db.sql.query("SELECT current_user AS name")).rows[0].name,
        );
        await db.sql.transaction(async (tx) => {
          await tx.exec(
            await stagingSchemaSQL({ schema, owner, reader, operator }),
          );
        });
        // Seed as app owner, using existing catalogue services to exercise trigger search_path.
        await db.sql.transaction(async (tx) => {
          await tx.exec(
            `SET LOCAL ROLE "${owner}"; SET LOCAL search_path="${schema}",pg_catalog;`,
          );
          await tx.query(
            "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('reviewer','Private reviewer','reviewer@example.test',NOW(),NOW())",
          );
          await tx.query(
            "INSERT INTO sources(id,name,url,synthetic,created_by) VALUES('source','Public source','https://example.test/source',true,'reviewer'),('private-source','Private source','https://example.test/private',true,'reviewer')",
          );
          await tx.query(
            "INSERT INTO opportunities(id,source_id,revision,state,details,evidence,verified_at) VALUES('published','source',1,'published','{}','{}',NOW()),('private-draft','private-source',1,'draft','{}','{}',NULL)",
          );
        });
        await db.sql.transaction(async (tx) => {
          await tx.exec(
            `SET LOCAL ROLE "${reader}"; SET LOCAL search_path="${schema}",pg_catalog;`,
          );
          assert.equal(
            Number(
              (await tx.query("SELECT COUNT(*) AS n FROM schema_migrations"))
                .rows[0].n,
            ),
            14,
          );
          assert.deepEqual(
            (await tx.query("SELECT id FROM opportunities")).rows.map(
              (x) => x.id,
            ),
            ["published"],
          );
          assert.deepEqual(
            (await tx.query("SELECT id FROM sources")).rows.map((x) => x.id),
            ["source"],
          );
        });
        for (const query of [
          `SELECT * FROM "${schema}".auth_user`,
          `INSERT INTO "${schema}".sources(id,name,url,created_by) VALUES('bad','bad','https://example.test','reviewer')`,
          `CREATE TABLE "${schema}".bad(id text)`,
          `SELECT * FROM public.auth_user`,
        ])
          await assert.rejects(() =>
            db.sql.transaction(async (tx) => {
              await tx.exec(`SET LOCAL ROLE "${reader}";`);
              await tx.exec(query);
            }),
          );
        // A scoped app connection pins each query's namespace without session-level SET state.
        if (kind === "postgres") {
          const scoped = await openDatabase(
            dir,
            process.env.TEST_DATABASE_URL,
            { schema, migrate: false },
          );
          try {
            assert.equal(
              Number(
                (
                  await scoped.sql.query(
                    "SELECT COUNT(*) AS n FROM schema_migrations",
                  )
                ).rows[0].n,
              ),
              14,
            );
            assert.equal(
              (await scoped.sql.query("SELECT current_schema() AS name"))
                .rows[0].name,
              schema,
            );
          } finally {
            await scoped.close();
          }
        }
        const policies = (
          await db.sql.query(
            "SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname=$1",
            [schema],
          )
        ).rows;
        assert.ok(policies.length > 30);
        assert.ok(policies.every((x) => x.rowsecurity));
      } finally {
        await db.sql.exec(
          `DROP SCHEMA IF EXISTS "${schema}" CASCADE; DROP ROLE IF EXISTS "${reader}"; DROP ROLE IF EXISTS "${owner}";`,
        );
        await db.close();
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
