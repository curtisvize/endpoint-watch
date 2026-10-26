# Database migrations

These scripts use PostgreSQL and `psql` (tested with PostgreSQL 17). They are
separate from API startup. The API reads monitoring data from the migrated database.

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

## TypeScript access layer

`apps/api/src/database/pool.ts` exports `createDatabasePool(config?)`. It accepts
`pg`'s `PoolConfig` overrides and otherwise uses standard PostgreSQL environment
settings (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`). There is no
automatic `DATABASE_URL` loading; pass a connection URL explicitly using
`{ connectionString: ... }` when needed. Keep credentials outside source control.
TLS can be configured through `PoolConfig.ssl`; verification is not disabled by
this layer.

Pool defaults are 10 connections, a 5-second connection-acquisition timeout, and
a 30-second idle timeout. Creation is lazy; importing the module opens no
connections. Owners must call `pool.end()` during shutdown. Idle connection
errors produce a generic diagnostic without connection details.

`repository.ts` provides these functions, taking a pool or a transaction's
`PoolClient` as their first argument:

- `listEnabledMonitors(db)` returns enabled monitors ordered by ID.
- `listMonitors(db)` returns all configured monitors, including disabled monitors,
  ordered by ID.
- `getMonitorById(db, id)` returns a monitor (including disabled monitors) or null.
- `insertCheckResult(db, input)` returns the inserted record. Input uses the
  schema's field names, including `monitor_id`, `outcome`, and `error_message`.
- `getRecentResultsForMonitor(db, monitorId, limit?)` returns newest-first results,
  breaking timestamp ties by descending ID. The default limit is 20; accepted
  limits are integers from 1 through 1000. Missing monitors/history return `[]`.

Record types are in `records.ts`: bigint IDs are strings, timestamps are `Date`
objects, and nullable columns remain null. Queries parameterize all supplied
values. Database failures reject the returned promise with the original `pg`
error for callers to handle; callers must sanitize errors before logging or
returning them over HTTP. Diagnostic text supplied for insertion must already
be sanitized.

API startup creates a lazy pool for read-only monitoring routes, with a five-second
SQL statement timeout. SIGINT/SIGTERM stop accepting requests and close the pool
after active requests finish. The Milestone 1 on-demand route still uses its
environment-configured target without reading or writing PostgreSQL.

## PostgreSQL integration tests

From `apps/api`, `npm test` runs database-free checks and existing API tests.
PostgreSQL integration tests are skipped unless `TEST_DATABASE_URL` is set.
To execute them, install the PostgreSQL client (`psql`), create a **dedicated test
database**, and run from `apps/api` with connection settings for your installation:

```bash
createdb endpoint_watch_test
export TEST_DATABASE_URL=postgresql://localhost/endpoint_watch_test
psql -X --dbname="$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f ../../db/migrate.sql
psql -X --dbname="$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f ../../db/tests/schema.sql
npm run test:integration
# Or run all tests with PostgreSQL enabled:
npm test
```

The dedicated integration command fails if `TEST_DATABASE_URL` is absent, so
integration coverage cannot silently disappear when that command is used.
The role must be allowed to create/drop schemas in the test database. No public
HTTP test services are used. Missing `psql`, database connectivity, or migrations
cause failures rather than skips once `TEST_DATABASE_URL` is set.

Repository and API tests require migrated public tables. They insert fixtures,
temporarily disable existing monitors, and take table locks inside transactions
that are rolled back after each test. Identity sequences may advance. Migration
tests create randomly named schemas, execute the actual `migrate.sql` via `psql`,
and remove those schemas afterward. They verify first application, repeat-run
data preservation, migration tracking, UTC-compatible types, indexes, and atomic
rollback when a table collision forces a migration failure. Tests never reset
the public schema. An interrupted test process may leave a temporary schema;
discarding the dedicated test database cleans it up.

Persistence/API tests run the actual scheduler, HTTP checker, repositories, and
Express routes against PostgreSQL and a loopback mock HTTP server. They cover
healthy responses, HTTP 500 responses, timeouts, and history retrieval while
confirming on-demand checks remain non-persistent. Another test rejects local
PostgreSQL connections to check generic API errors without breaking `/health`.
Existing repository tests cover all four outcomes, filtering, bigint/date decoding,
fractional durations, ordering/limits, parameterized inputs, and constraints.

Do not run these tests against a production or shared development database, or
against the database being used by a running worker. The tests are isolated by
transactions and unique schema names, and may be run repeatedly.

`TEST_PSQL_BIN` optionally selects a different `psql` executable or wrapper. A
wrapper must honor `PGDATABASE` (the connection URL), `PGOPTIONS` (the isolated
schema search path), and the supplied arguments. If running `psql` inside a
container, the repository's `db` directory must be readable at the same absolute
path as on the test host, for `-f` and relative migration includes to resolve.

GitHub Actions uses a disposable PostgreSQL 17 service, installs `psql`, applies
migrations, runs the SQL schema checks and full Vitest suite with database tests
enabled, type-checks tests, and builds on Node.js 24. It performs no deployment.
