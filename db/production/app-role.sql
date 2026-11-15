CREATE ROLE "smartmanuai_app" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA "smartmanuai" TO "smartmanuai_app";
GRANT SELECT ON ALL TABLES IN SCHEMA "smartmanuai" TO "smartmanuai_app";
DO $grants$ DECLARE item record; BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='smartmanuai' LOOP
    IF item.tablename NOT IN ('schema_migrations','admin_roles') THEN
      EXECUTE format('GRANT INSERT, UPDATE, DELETE ON %I.%I TO %I','smartmanuai',item.tablename,'smartmanuai_app');
      EXECUTE format('CREATE POLICY backend_application ON %I.%I FOR ALL TO %I USING(true) WITH CHECK(true)','smartmanuai',item.tablename,'smartmanuai_app');
    ELSE
      EXECUTE format('CREATE POLICY backend_application ON %I.%I FOR SELECT TO %I USING(true)','smartmanuai',item.tablename,'smartmanuai_app');
    END IF;
  END LOOP;
END $grants$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "smartmanuai" TO "smartmanuai_app";
