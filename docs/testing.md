# Testing and CI

Run backend npm commands from `apps/api`; frontend commands below use `apps/web`.
No new dependencies are needed beyond the
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

Both CI jobs select Node through the root `.nvmrc`. Native validation must use
Node 24 too (`nvm install` and `nvm use` from the root, if using nvm). The
[security maintenance record](security.md) documents the latest dependency/image
validation and the remaining vulnerability findings. GitHub-hosted verification
must still be checked after pushing these changes.

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

Open a pull request or push to `main` to trigger [Application checks](../.github/workflows/ci.yml).
A push to another branch alone does not trigger the current workflow. In the PR's
Checks tab or repository Actions tab, confirm `test-and-build` passes dependency
installation, migrations/schema verification, the full suite without database-test
skips, test type-checking, and the build. After merging, check the run on `main` too.
Also confirm the `frontend` job passes unit tests, the type-checked build, Chromium
installation, and the Compose/Playwright suite. Failure screenshots and traces
are uploaded as artifacts. Local success does not establish that a GitHub-hosted
run passed; inspect its logs.

For migration subprocess failures, diagnostics report a sanitized exit status
and SQLSTATE. Exit 2 indicates a connection failure; the deliberate rollback test
requires exit 3 and SQLSTATE `42P07` (duplicate table). Connection URLs are passed
to `psql --dbname`; do not put the full URL in `PGDATABASE` or override arguments
in a wrapper. No raw connection diagnostics or credentials should be published.

## Browser end-to-end tests

From `apps/web`, with Docker running and Node.js 24 available:

```bash
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

On Linux, `npx playwright install --with-deps chromium` also installs required
system libraries (CI uses this command). Browser installation downloads test
binaries; no public HTTP services are contacted by the tests themselves.

`test:e2e` builds and starts the normal Compose stack with `compose.e2e.yaml`
under a randomly named `endpoint-watch-e2e-*` project. It uses random loopback
ports, a random temporary database password, and a new project-scoped volume.
It does not load your root `.env`. The test override excludes the scheduled worker;
normal development worker behavior is unchanged. Fixed SQL fixtures replace only
this disposable test database's monitors/results, so results do not depend on
worker timing, live services, or previous development data. Never apply
`apps/web/e2e/fixtures.sql` to a development database: it truncates both tables.

Playwright runs Chromium against the built Nginx frontend and real Express/API
repositories backed by PostgreSQL. Tests verify same-origin requests, dashboard
outcomes, monitor selection, keyboard focus, persisted history fields, and empty
history. There are no mocked API responses in this suite. Browser contexts are
isolated per test; fixtures are read-only during tests. Vitest covers polling,
partial failures, stale-data behavior, and recovery deterministically with fake
timers. Existing backend integration tests cover scheduler writes and SQL failures;
the browser suite intentionally does not run the worker.

The runner removes its own containers, network, and test volume in cleanup,
including on test failures. It prints its unique project name; if forcibly killed
or Docker becomes unavailable, remove only that printed project's resources.
Do not run `down --volumes` against your normal development project as test cleanup.

Reports are written to `apps/web/playwright-report` and failure traces/screenshots
to `apps/web/test-results`; both are Git-ignored. From `apps/web`, inspect a report
with `npx playwright show-report`. A failing run is not retried automatically.
The runner supplies `PLAYWRIGHT_BASE_URL` to Playwright; invoke `npm run test:e2e`
rather than starting tests against a shared development database.

The frontend CI job runs these commands on a GitHub-hosted Linux runner with
Docker. It does not deploy, publish images, or release the application.

## Dashboard request deadlines and recovery

Frontend API reads have a centralized 10-second deadline
(`API_REQUEST_TIMEOUT_MS` in `apps/web/src/api/monitors.ts`), including reading
the response body. Timeout errors use `ApiTimeoutError`; HTTP failures retain
their HTTP status. This deadline is separate from the worker's endpoint-check
timeout. Polling retries about 15 seconds after a failed request settles, retains
previously loaded data, and displays stale-data warnings. Selection changes and
unmounts cancel obsolete requests without presenting cancellation as a failure.

Vitest covers stalled headers and body reads, initial/background timeout recovery,
retained history and selection, overlap protection, cancellation, and late results.
Run `npm test` and `npm run build` from `apps/web`.

For manual verification against your local Compose environment:

1. Run `docker compose up -d --build web` from the repository root, hard-refresh
   the dashboard tab, and select a monitor to load its history.
2. Run `docker compose pause api`. Click **Refresh**; within approximately
   10 seconds, expect refresh-failure/stale-data warnings while the previous
   monitor list and history remain visible. The Refresh button becomes available
   again. Pausing simulates an unresponsive API; it does not reset the database.
3. Run `docker compose unpause api` to restore the API. Click **Refresh** or wait
   for automatic retries. Expect warnings to clear after successful reads, the
   selected monitor to remain open, and successful-update timestamps to advance.

Always unpause the API after this check. Offline or connection-refused errors may
fail immediately; these exercise failure recovery rather than the full deadline.

## Response-time chart verification

Rebuild the frontend with `docker compose up -d --build web`, hard-refresh the
browser, and select a monitor. The detail view charts its already-loaded recent
history in chronological order while retaining the newest-first table. The
horizontal axis uses local check-start times; the vertical axis uses milliseconds
until HTTP response headers. Healthy responses use circles and HTTP errors use
diamonds. Timeout and connection-failure durations are excluded and counted in
the explanatory text; their full records remain in the table. A history containing
only these failures keeps the chart visible with an explanatory message and an
outcome strip. The strip shares the time axis with the latency plot and shows
every check: circles for healthy responses, diamonds for HTTP errors, triangles
for timeouts, and crosses for connection failures. Outcome markers have no
millisecond value. Thin lines join consecutive HTTP responses and break at
timeouts or connection failures.

Check the healthy, HTTP-error, and delayed development monitors. Resize the
browser to a narrow viewport and confirm the chart stays readable, scrolling
horizontally when necessary. A single HTTP result should show one point; empty
history should show an explanatory message. Vitest covers these data cases,
ordering, irregular timestamp spacing, tied timestamps, zero durations, marker
shapes, and chart integration with the detail table.

## Dashboard usability checks

After rebuilding the web service, hard-refresh the browser and check desktop and
narrow layouts (for example, 320 and 375 pixels wide). Monitor names should wrap
without truncation or page-wide horizontal scrolling. The chart and history table
retain their own keyboard-accessible horizontal scroll regions.

Select **View history** with the mouse or keyboard. The selected card should have
a highlighted border and a visible **Selected** label. The detail heading receives
focus and scrolls into view without animation. Routine automatic/manual refreshes
must leave focus and scroll position alone. **Close history** returns focus to the
selected card's button.

Each card shows its latest known outcome and a separate compact freshness label.
**About freshness** expands the unchanged interval/grace explanation. Overdue and
failed-refresh warnings remain visible without expanding help, and disabled
monitors remain distinct from unhealthy monitors. Independent update timestamps
remain available for the monitor list, latest checks, and selected history.
