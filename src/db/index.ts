import { PGlite } from "@electric-sql/pglite";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { drizzle as postgresDrizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { localConfig } from "../config";
import * as schema from "./schema";
export interface SQL {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: SQL) => Promise<T>): Promise<T>;
}
export async function migrate(sql: SQL) {
  await sql.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)",
  );
  for (const name of (await readdir(resolve("db/migrations")))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    await sql.transaction(async (tx) => {
      if (
        (
          await tx.query("SELECT name FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rows.length
      )
        return;
      await tx.exec(await readFile(resolve("db/migrations", name), "utf8"));
      await tx.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    });
  }
}
export async function openDatabase(dataDir: string, databaseURL?: string) {
  if (!databaseURL) {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const engine = new PGlite(resolve(dataDir, "postgres"));
    const sql = engine as unknown as SQL;
    await migrate(sql);
    return {
      sql,
      orm: pgliteDrizzle(engine, { schema }),
      close: () => engine.close(),
      kind: "pglite" as const,
    };
  }
  const pool = new Pool({ connectionString: databaseURL, max: 4 });
  const makeSQL = (client: Pick<Pool, "query">): SQL => ({
    query: async (query, params) => client.query(query, params),
    exec: async (query) => client.query(query),
    transaction: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const result = await fn(makeSQL(c));
        await c.query("COMMIT");
        return result;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
  });
  const sql = makeSQL(pool);
  await migrate(sql);
  return {
    sql,
    orm: postgresDrizzle(pool, { schema }),
    close: () => pool.end(),
    kind: "postgres" as const,
  };
}
type Database = Awaited<ReturnType<typeof openDatabase>>;
const globalDatabase = globalThis as typeof globalThis & {
  smartmanuDatabase?: Promise<Database>;
};
export function getDatabase() {
  const config = localConfig();
  return (globalDatabase.smartmanuDatabase ??= openDatabase(
    config.dataDir,
    config.databaseURL,
  ));
}
