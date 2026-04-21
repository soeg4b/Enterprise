-- Postgres init: create non-superuser application role and grant least privileges.
-- Runs once on first container start (only when /var/lib/postgresql/data is empty).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'deliveriq_app') THEN
    CREATE ROLE deliveriq_app LOGIN PASSWORD 'deliveriq_app_change_me'
      NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
  END IF;
END$$;

GRANT CONNECT ON DATABASE deliveriq TO deliveriq_app;
GRANT USAGE   ON SCHEMA public        TO deliveriq_app;

-- Privileges on all current and future tables/sequences in `public`.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES   IN SCHEMA public TO deliveriq_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO deliveriq_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES   TO deliveriq_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT                  ON SEQUENCES TO deliveriq_app;

-- Audit-log immutability (defence-in-depth).
-- Will succeed once the app has run prisma migrate; safe no-op otherwise.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='audit_log') THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $f$
      BEGIN
        RAISE EXCEPTION 'audit_log is append-only (% denied)', TG_OP;
      END;
      $f$ LANGUAGE plpgsql;
    $sql$;
    BEGIN
      EXECUTE 'DROP TRIGGER IF EXISTS audit_log_no_update ON public.audit_log';
      EXECUTE 'CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON public.audit_log
               FOR EACH ROW EXECUTE FUNCTION audit_log_immutable()';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping audit_log trigger creation: %', SQLERRM;
    END;
  END IF;
END$$;
