/** Backend application identity only: no ownership, DDL, RLS bypass or role administration. */
export function productionRoleSQL(
  schema = "smartmanuai",
  role = "smartmanuai_app",
) {
  for (const name of [schema, role])
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(name))
      throw Error("Invalid production identifier.");
  return `CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA "${schema}" TO "${role}";
GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO "${role}";
DO $grants$ DECLARE item record; BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='${schema}' LOOP
    IF item.tablename NOT IN ('schema_migrations','admin_roles') THEN
      EXECUTE format('GRANT INSERT, UPDATE, DELETE ON %I.%I TO %I','${schema}',item.tablename,'${role}');
      EXECUTE format('CREATE POLICY backend_application ON %I.%I FOR ALL TO %I USING(true) WITH CHECK(true)','${schema}',item.tablename,'${role}');
    ELSE
      EXECUTE format('CREATE POLICY backend_application ON %I.%I FOR SELECT TO %I USING(true)','${schema}',item.tablename,'${role}');
    END IF;
  END LOOP;
END $grants$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "${schema}" TO "${role}";`;
}
