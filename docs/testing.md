# Testing and CI

Run npm commands from `apps/api`. No new dependencies are needed beyond the
existing development packages; PostgreSQL-backed tests additionally need a
dedicated database and the `psql` client. See [database setup](../db/README.md).

## Automated checks

From `apps/api`, run `npm ci`, `npm test`, `npm run typecheck:tests`, and
`npm run build`. Database integration tests require a dedicated PostgreSQL
database, the `psql` client, and `TEST_DATABASE_URL`; see the
[integration test instructions](#postgresql-integration-tests).
`npm run test:integration` explicitly requires database configuration.

GitHub Actions runs on pull requests and pushes to `main`, using Node.js 24 and
a disposable PostgreSQL 17 service to apply migrations, verify the schema, run
all tests, type-check test code, and build. No deployment or release steps run.

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
wrapper must forward all supplied arguments unchanged, including `--dbname`
(the connection URL), and honor `PGOPTIONS` (the isolated schema search path).
It must not replace connection arguments with hardcoded settings. If running `psql` inside a
container, the repository's `db` directory must be readable at the same absolute
path as on the test host, for `-f` and relative migration includes to resolve.

GitHub Actions uses a disposable PostgreSQL 17 service, installs `psql`, applies
migrations, runs the SQL schema checks and full Vitest suite with database tests
enabled, type-checks tests, and builds on Node.js 24. It performs no deployment.

## Verify GitHub Actions

Open a pull request or push to `main` to trigger [API checks](../.github/workflows/ci.yml).
A push to another branch alone does not trigger the current workflow. In the PR's
Checks tab or repository Actions tab, confirm `test-and-build` passes dependency
installation, migrations/schema verification, the full suite without database-test
skips, test type-checking, and the build. After merging, check the run on `main` too.
Local success does not establish that a GitHub-hosted run passed; inspect its logs.

For migration subprocess failures, diagnostics report a sanitized exit status
and SQLSTATE. Exit 2 indicates a connection failure; the deliberate rollback test
requires exit 3 and SQLSTATE `42P07` (duplicate table). Connection URLs are passed
to `psql --dbname`; do not put the full URL in `PGDATABASE` or override arguments
in a wrapper. No raw connection diagnostics or credentials should be published.
