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
export async function openDatabase(
  dataDir: string,
  databaseURL?: string,
  options: {
    schema?: string;
    migrate?: boolean;
    ssl?: boolean;
    ca?: string;
  } = {},
) {
  if (options.schema && !/^[a-z][a-z0-9_]{0,62}$/.test(options.schema))
    throw new Error("Invalid database schema.");
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
  const pool = new Pool({
    connectionString: databaseURL,
    max: options.schema ? 2 : 4,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
    ...(options.ssl
      ? {
          ssl: {
            rejectUnauthorized: true,
            ...(options.ca ? { ca: options.ca } : {}),
          },
        }
      : {}),
  });
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
  const raw = makeSQL(pool);
  const sql: SQL = options.schema
    ? {
        query: async (query, params) =>
          raw.transaction(async (tx) => {
            await tx.exec(
              'SET LOCAL search_path="' + options.schema + '",pg_catalog',
            );
            return tx.query(query, params);
          }),
        exec: async (query) =>
          raw.transaction(async (tx) => {
            await tx.exec(
              'SET LOCAL search_path="' + options.schema + '",pg_catalog',
            );
            return tx.exec(query);
          }),
        transaction: async (fn) =>
          raw.transaction(async (tx) => {
            await tx.exec(
              'SET LOCAL search_path="' + options.schema + '",pg_catalog',
            );
            return fn(tx);
          }),
      }
    : raw;
  if (options.migrate !== false) await migrate(sql);
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
    {
      schema: config.databaseSchema,
      migrate: config.mode === "local",
      ssl: config.mode === "staging",
      ca: config.databaseCA,
    },
  ));
}
