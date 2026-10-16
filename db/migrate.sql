\set ON_ERROR_STOP on

BEGIN;
-- Serialize migration runs in this database, including the first run.
SELECT pg_advisory_xact_lock(621904, 1);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

SELECT NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '001_initial_schema'
) AS apply_001 \gset

\if :apply_001
    \ir migrations/001_initial_schema.sql
    INSERT INTO schema_migrations (version) VALUES ('001_initial_schema');
\endif

COMMIT;
