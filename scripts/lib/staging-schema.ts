import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
export async function stagingSchemaSQL(
  input: {
    schema?: string;
    owner?: string;
    reader?: string;
    operator?: string;
  } = {},
) {
  const {
    schema = "smartmanuai",
    owner = "smartmanuai_owner",
    reader = "smartmanuai_reader",
    operator = "postgres",
  } = input;
  for (const name of [schema, owner, reader, operator])
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(name))
      throw Error("Invalid staging identifier");
  const files = (await readdir(resolve("db/migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const chunks = [
    `CREATE ROLE "${owner}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
    `CREATE ROLE "${reader}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
    `GRANT "${owner}" TO "${operator}";`,
    `CREATE SCHEMA "${schema}" AUTHORIZATION "${owner}";`,
    `SET LOCAL ROLE "${owner}";`,
    `SET LOCAL search_path="${schema}",pg_catalog;`,
    "CREATE TABLE schema_migrations(name text PRIMARY KEY);",
  ];
  for (const file of files) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(file)) throw Error("Invalid migration file");
    chunks.push(await readFile(resolve("db/migrations", file), "utf8"));
    chunks.push(`INSERT INTO schema_migrations(name) VALUES('${file}');`);
  }
  chunks.push(
    `DO $guard$ DECLARE item record; BEGIN FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='${schema}' LOOP EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY','${schema}',item.tablename); END LOOP; FOR item IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='${schema}' LOOP EXECUTE format('ALTER FUNCTION %s SET search_path=${schema},pg_catalog',item.signature); END LOOP; END $guard$;`,
    `REVOKE ALL ON SCHEMA "${schema}" FROM PUBLIC;`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA "${schema}" FROM PUBLIC;`,
    `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "${schema}" FROM PUBLIC;`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`,
    `GRANT USAGE ON SCHEMA "${schema}" TO "${reader}";`,
    `GRANT SELECT ON opportunities,sources,schema_migrations,opportunity_source_aliases TO "${reader}";`,
    `CREATE POLICY staging_public_opportunities ON opportunities FOR SELECT TO "${reader}" USING(state IN ('published','closed'));`,
    `CREATE POLICY staging_public_sources ON sources FOR SELECT TO "${reader}" USING(EXISTS(SELECT 1 FROM "${schema}".opportunities o WHERE o.source_id=sources.id AND o.state IN ('published','closed')) OR EXISTS(SELECT 1 FROM "${schema}".opportunity_source_aliases a JOIN "${schema}".opportunities o ON o.id=a.opportunity_id WHERE a.source_id=sources.id AND o.state IN ('published','closed')));`,
    `CREATE POLICY staging_public_source_aliases ON opportunity_source_aliases FOR SELECT TO "${reader}" USING(EXISTS(SELECT 1 FROM "${schema}".opportunities o WHERE o.id=opportunity_source_aliases.opportunity_id AND o.state IN ('published','closed')));`,
    `CREATE POLICY staging_migration_status ON schema_migrations FOR SELECT TO "${reader}" USING(true);`,
    "RESET ROLE;",
  );
  return chunks.join("\n");
}
