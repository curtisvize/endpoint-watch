# Database migrations

These scripts use PostgreSQL and `psql` (tested with PostgreSQL 17). They are
separate from API startup; the API does not connect to the database yet.

Create an empty local database with `createdb endpoint_watch`, then run from the
repository root:

```bash
PGDATABASE=endpoint_watch psql -X -f db/migrate.sql
PGDATABASE=endpoint_watch psql -X -f db/tests/schema.sql
```

Use standard PostgreSQL connection settings (`PGHOST`, `PGPORT`, `PGUSER`,
`PGDATABASE`) for your installation and a local `.pgpass` file or interactive
password prompt for credentials. Do not commit credentials. Use a dedicated
database and a trusted database owner account for migrations.

`migrate.sql` explicitly lists migrations in order and records completed versions
in `schema_migrations`. Re-running skips applied versions. The entire run is one
transaction, with an advisory lock preventing simultaneous migration runs.
`ON_ERROR_STOP` stops on failure; when the connection closes, uncommitted changes
are rolled back. Tests also roll back their data (identity sequence values may
still advance); run them against a disposable development database.

To add a migration, create the next numbered SQL file and append a corresponding
version check, `\ir`, and history insert before `COMMIT` in `migrate.sql`.
Migration files must not contain transaction control. Applied files are immutable:
make corrections in a new migration. This minimal mechanism has no automatic
rollback commands or checksum tracking. Nontransactional operations such as
`CREATE INDEX CONCURRENTLY` require a future migration-process decision.

## Schema choices

- Both domain tables use bigint identity primary keys without extensions. Future
  `pg` callers should preserve bigint IDs as strings rather than assuming they fit
  JavaScript's safe integer range.
- `timestamptz` stores instants independently of the session timezone; PostgreSQL
  renders them using the session timezone. `checked_at` is supplied by the checker
  so it records check start, not insertion time.
- Response times use double precision to preserve the checker's fractional
  milliseconds, constrained to finite nonnegative values.
- Outcomes use text with CHECK constraints instead of a PostgreSQL enum, keeping
  allowed values explicit and straightforward to change through SQL migrations.
- HTTP results require a matching status code and no error message; timeout and
  connection failures require a nonblank sanitized diagnostic and no status code.
- Monitor names and URLs are not unique: distinct monitor configurations may
  target the same URL. URL constraints provide a basic HTTP(S) shape check, not
  full URL parsing or SSRF protection. Future configuration writers must validate
  URLs and enforce trusted/allowlisted targets in application code.
- Monitor deletion is restricted while check history exists. Disable monitors to
  stop future checks; retention and deliberate history deletion remain deferred.
- The history index supports `WHERE monitor_id = ... ORDER BY checked_at DESC,
  id DESC LIMIT ...`, including a deterministic tie-breaker and foreign-key lookups.
- No timeout column, seed targets, scheduling state, or retention policy is added;
  those are outside the documented initial table definitions and this task.
