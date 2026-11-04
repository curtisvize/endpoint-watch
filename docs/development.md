# Development guide

All Docker/Compose commands below run from the repository root. Native npm
commands run from `apps/api` unless the frontend section specifies `apps/web`.
See the [quick start and smoke test](../README.md)
for the shortest path, [API reference](api.md) for responses, and
[troubleshooting](troubleshooting.md) for failures.

## Run the frontend locally

The React/Vite/TypeScript frontend is in `apps/web`, with its own package
and lockfile. Use Node.js 24 to match the project's development environment.
From `apps/web`:

```bash
npm ci
npm run dev
```

Open the local URL Vite prints (normally `http://127.0.0.1:5173`). Expect an
Endpoint Watch heading and configured monitors loaded from the backend. Start
the backend first from the repository root with `docker compose up -d --build --wait`
(after configuring `.env` as described below), or use a locally configured Express
API with a migrated PostgreSQL database.

Browser code requests relative `/api` URLs. Vite's development proxy forwards
them to `http://127.0.0.1:3000`, preserving the path. If the API uses another local
port, start Vite from `apps/web` with the corresponding target, for example:

```bash
API_PROXY_TARGET=http://127.0.0.1:3001 npm run dev
```

This setting is read by Vite's server configuration, not embedded as a backend
hostname in browser code. The root Compose `.env` is not automatically loaded by
this command; supply the override in the shell. The proxy applies only to Vite
development, not production build output. In Compose, the `web` service serves
built assets using Nginx and forwards `/api/` to Express internally. Only `/api`
is proxied; `/health` remains an API-only endpoint.

Manual verification:

1. With the backend running, open Vite's printed URL. Expect a brief loading
   message, followed by monitor cards and a summary. Each card shows the name,
   enabled/disabled configuration, latest recorded outcome, response time in
   milliseconds, and last checked time in your browser's local timezone. A fresh
   Compose database includes Mock healthy, Mock HTTP error, and Mock delayed.
   After the worker has run, expect Healthy, HTTP error, and Timeout respectively
   with default mock settings. The summary should count each once. This checks
   the overview loading persisted results through the development proxy.
2. In browser developer tools, inspect the Network panel: `/api/monitors` should
   return HTTP 200 with a `data` array from the frontend's origin. Expect one
   `/api/monitors/<id>/checks?limit=1` request per listed monitor. There should
   be no browser request to a Docker service name. React Strict Mode may abort
   its first development request and start another; that is expected.
3. Resize the browser to a narrow mobile width (about 320px), then a desktop
   width. Expect text to wrap and the content to fit without horizontal scrolling.
   This checks the basic responsive shell styling.
4. To check failure handling with Compose, run `docker compose stop api` from
   the repository root while keeping the page open. Within a polling cycle, expect
   stale-data warnings while existing cards/history remain visible. Restore with
   `docker compose up -d --wait api`; wait for the next cycle or use Refresh and
   expect the warnings to clear. For a fresh page load during the outage, expect
   an initial loading error, not an empty list. An API response with
   `data: []` instead shows “No monitors are configured yet”; this state is
   covered by the mocked-response tests without deleting development data.
5. To inspect partial failures without changing database data, use browser
   developer tools' request blocking (if available) to block one monitor's
   `/api/monitors/<id>/checks?limit=1` URL and reload. Expect that card to show
   “Latest check unavailable,” with the other cards still populated. The summary
   counts an initially unavailable result separately from unhealthy or unchecked.
   If the block is added after results have loaded, the next failed refresh keeps
   the prior outcome and labels it stale. Remove the block and wait for recovery. A monitor with empty history instead shows “No recorded
   checks.” Existing disabled monitors show “Disabled — scheduled checks paused”
   separately from any retained outcome. These cases are also covered by tests.
6. Wait approximately 15 seconds after the previous request cycle completes.
   Expect new `/api` requests, advancing successful update timestamps, and newer
   results where the worker has written checks. Press Refresh to update sooner;
   the list's button is disabled while its request runs. Background refreshes keep
   cards visible and do not move focus. Each section shows its last fully
   successful update time; failures retain that time and mark old data stale.
   Disabled monitors' retained checks may be older even after a successful read.
7. Tab to a monitor's “View history” button and activate it with Enter or Space.
   Expect focus on the detail heading below the overview, showing the monitor's
   name, enabled configuration, latest recorded outcome, and up to 20 checks,
   newest first. Inspect the Network panel for `/api/monitors/<id>/checks?limit=20`.
   Each row shows the local timestamp, outcome, HTTP code (or “Not available”),
   response time, and the backend's sanitized error text (or “None”). The local
   timezone is identified above the table; API timestamps remain UTC instants.
8. Select another monitor and confirm its history replaces the previous panel.
   On mobile, the table can scroll horizontally; its scroll region is keyboard
   focusable. Activate “Close history” and expect focus to return to the monitor's
   button. Empty history shows “No recorded checks”; block only the `limit=20`
   request in DevTools and reopen to verify the detail error message while the
   overview remains available. If history was already loaded, it remains visible
   with a stale-data warning. Remove the block to allow automatic recovery. These cases are also
   covered by component tests; they require no database deletions.
9. Stop Vite with Ctrl+C. Use `docker compose down` from the repository root
   when finished with the backend; this preserves database history.

From `apps/web`, run the rendering test and production build:

```bash
npm test
npm run build
```

Tests use mocked fetch responses with Vitest, React Testing Library, and jsdom
to check loading, monitor lists, empty/error states, and unmount cancellation.
Client tests cover list/detail/history contracts, HTTP/network errors, invalid
response envelopes, and bounded history limits. IDs remain strings and timestamps
remain ISO strings. The list, overview latest checks, and selected history each
poll approximately 15 seconds after their previous cycle finishes. Manual Refresh
triggers those loaders too; an in-flight loader ignores duplicate triggers. Latest
checks update independently within each overview cycle. Summary outcome counts include disabled monitors'
latest recorded checks; the disabled count is a separate configuration count.
Loading, unavailable, and unchecked histories are separate summary categories.
Selection loads and polls the latest 20 checks for that monitor. Closing or
switching selection cancels outstanding detail requests, and closing restores
focus to the overview button. Stored sanitized errors render as plain text.
There is no routing, pagination, filtering, or charting. Overview and detail
snapshots may differ when the worker records a check between requests. Last
successful update times describe API retrieval, not the time the monitor was
checked. They are shown separately for the list, latest checks, and history so
partial successes do not imply the whole dashboard was updated. During a failed
routine refresh, prior data and successful timestamps remain visible with stale
warnings. Timers and requests are cleaned up on unmount or selection changes.
There is no request timeout in the browser client: a still-pending cycle waits
rather than launching overlapping requests. New selections replace old detail
requests, while the selected ID is retained through ordinary monitor-list reloads.
The build type-checks source, tests, and configuration
before writing production assets to `apps/web/dist`. These checks do not verify
visual layout in a real browser. Compose also serves the built frontend without
Vite, at `http://127.0.0.1:8080` by default. CI runs frontend unit tests, the build,
and Playwright against the built Compose frontend; see [testing](testing.md#browser-end-to-end-tests).

## Docker Compose development environment

From the repository root, copy `.env.example` to `.env` only if it does not
already exist, and set
`POSTGRES_PASSWORD` to a local development password. `.env` is ignored by Git.
Requires Docker with the Compose plugin.

```bash
if [ ! -e .env ]; then cp .env.example .env; fi
# Edit .env and set POSTGRES_PASSWORD before continuing.
docker compose up -d --build --wait
docker compose ps -a
docker compose logs -f api worker
```

Compose starts PostgreSQL, a one-shot migration service, a mock API, the Express
API, a separate monitoring worker, and the built React frontend (`web`). PostgreSQL health gates migrations;
successful migrations and mock API health gate API/worker startup. Migration
failure prevents dependent services from starting. The API health check exercises
the database-backed monitor list; the worker check verifies process liveness,
not successful polling or persistence. Check advancing history for worker progress
and logs for failures; successful checks are not logged.

The migration job applies the existing tracked SQL migrations when it runs during
`up` and
idempotently adds three development monitors if their name/URL pair is absent.
These poll every 10 seconds: mock healthy (`/health`), HTTP 500 (`/error`), and
delayed (`/delay`). Existing monitor settings are not reset. The mock delay
defaults to 6000ms, exceeding the worker's default 5000ms timeout. Override
`MOCK_DELAY_MS` or `MONITOR_TIMEOUT_MS` in `.env` as needed.

The frontend is published at `http://127.0.0.1:8080` (`WEB_PORT`), and Express
at `http://127.0.0.1:3000` (`API_PORT`), both on the loopback interface.
PostgreSQL and the mock API have no host port mappings. Containers
use service DNS names `postgres` and `mock-api`, rather than host `localhost`.
The mock has no configuration/control routes and is for development only.
The API, worker, and mock share the compiled Node image with different commands.
The frontend has its own multi-stage Dockerfile: Node builds the assets, then
Nginx serves only `dist` and a small configuration file. Node dependencies and
source/test files are excluded from the runtime image. Nginx listens on container
port 8080 and forwards `/api/` with the original path/query to `api:3000` using
Docker DNS. Browser code keeps relative URLs and needs no Docker hostname or CORS
setting. The proxy re-resolves API addresses when containers are recreated.
The web service waits for API readiness; its `/healthz` check tests Nginx liveness.
It is not a database health check. Use the dashboard/API to verify full routing.

For a changed frontend, run `docker compose up -d --build --wait` to rebuild and
serve it. `API_PROXY_TARGET` affects native Vite development only; it does not
configure Nginx or the built browser bundle.

```bash
curl http://127.0.0.1:3000/health
curl -X POST http://127.0.0.1:3000/api/checks/run
curl http://127.0.0.1:3000/api/monitors
# Enter an ID from the monitor list when prompted; allow at least 10 seconds for history.
read -r MONITOR_ID
curl "http://127.0.0.1:3000/api/monitors/$MONITOR_ID/checks?limit=5"
```

The on-demand route checks mock health without persisting; the worker writes
scheduled results. To inspect SQL directly without a host PostgreSQL client:

```bash
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

### Normal shutdown and rebuild

These commands preserve database data:

```bash
docker compose stop                 # Stop containers; retain database data.
docker compose up -d --build --wait # Start again and rebuild changed code.
docker compose down                # Remove containers/network; retain named volume.
```

### Destructive database reset

Only run this when you intend to delete all data in this Compose project's database:

```bash
docker compose down --volumes
docker compose up -d --build --wait
```

Expected: the named volume is deleted, then recreated with a fresh schema and
three development monitors. All prior check history is lost.

PostgreSQL data lives in the project-scoped `postgres-data` named volume.
Reset deletes all monitoring history. Database user/password/name settings apply
when initializing an empty volume; changing `.env` does not change existing
database credentials. Keep the original settings or reset the development data.
For new SQL migrations while running, stop API/worker, run the migration job,
then start again:

```bash
docker compose stop api worker
docker compose run --rm migrate
docker compose up -d --wait
```

Secrets are provided at runtime and are not built into images. This Compose file
is for local development; its database owner account is shared by migrations and
application services. It does not configure production database roles or hosting.

## Run the API locally

Use Node.js 24 to match the image and CI; `package.json` declares a minimum of
Node.js 20.19. From `apps/api`:

```bash
npm ci
MONITOR_NAME='Example Service' MONITOR_URL='https://example.com' npm run dev
```

`MONITOR_NAME` and `MONITOR_URL` are required. The URL must use HTTP or HTTPS.
`MONITOR_TIMEOUT_MS` is optional and defaults to `5000`; when provided, it must
be an integer from `1` to `2147483647`. Invalid configuration prevents startup.

The API listens on `127.0.0.1:3000` for local/private development.

```bash
curl http://127.0.0.1:3000/health
curl -X POST http://127.0.0.1:3000/api/checks/run
```

The check route needs no request body and always uses the configured target.
Completed checks return HTTP 200, including unhealthy results. Unexpected
application failures return a generic HTTP 500 JSON error.

Run `npm test` for tests and `npm run build` to compile. After building, use
`npm start` with the same environment variables to run the compiled server.

The example above uses a public URL as an explicitly configured manual target;
automated tests use no public HTTP services. To check the API itself instead,
set `MONITOR_NAME='API health'` and `MONITOR_URL='http://127.0.0.1:3000/health'`.
The read-only monitoring routes also need a migrated PostgreSQL database and
standard `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, and credential settings;
see [database configuration](../db/README.md). Native npm commands do not load the
root `.env` automatically. Compose loads it for interpolation; for native runs,
supply the variables in the shell. Compose's database has no host port mapping,
so native Node processes cannot access it through `localhost:5432` as configured.

## Run the API in Docker

From the repository root, with Docker running:

```bash
docker build -t endpoint-watch-api apps/api
docker run --rm --name endpoint-watch-api \
  -p 127.0.0.1:3000:3000 \
  -e MONITOR_NAME='API health' \
  -e MONITOR_URL='http://127.0.0.1:3000/health' \
  -e MONITOR_TIMEOUT_MS=5000 \
  endpoint-watch-api
```

The image uses Node.js 24 LTS, builds TypeScript in a separate stage, and runs
compiled JavaScript as a non-root user with only production dependencies.
Source files, tests, local dependencies, and environment files are excluded
from the runtime image.

Supply monitor settings at runtime using `-e` as above or `--env-file` with a
local, uncommitted environment file. The example monitors the API's own health
endpoint, so it requires no external service. Inside a container, `127.0.0.1`
refers to the container itself; use a URL reachable from the container for
other monitoring targets.

The image sets `HOST=0.0.0.0` for container networking; local execution defaults
to `HOST=127.0.0.1`. The published port above is restricted to the host's loopback
interface for local/private use.

In another terminal, verify both routes:

```bash
curl -i http://127.0.0.1:3000/health
curl -i -X POST http://127.0.0.1:3000/api/checks/run
```

Both should return HTTP 200. Health returns `{"status":"ok"}` and the check
returns a structured result with `status: "healthy"` and `statusCode: 200`.
Stop the container with `docker stop endpoint-watch-api`.

This standalone example verifies only application health and an on-demand check.
Database-backed routes require additional PostgreSQL connection settings at
runtime and a migrated database reachable from the container. Use Compose for
the complete local environment; it supplies those settings and networking.

## Scheduled monitoring worker

Apply the [database migrations](../db/README.md) and configure trusted monitor rows
in PostgreSQL before starting the worker. From `apps/api`, run it as a separate
process using standard PostgreSQL connection environment settings:

```bash
npm run build
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGDATABASE=endpoint_watch npm run start:worker
```

Use a local password file or `PGPASSWORD` when required; do not commit credentials.
For development, `npm run dev:worker` runs the TypeScript entry point with reloads.
`MONITOR_TIMEOUT_MS` optionally configures the HTTP timeout (default `5000`, a
positive integer no greater than `2147483647`). The worker does not use
`MONITOR_NAME` or `MONITOR_URL`; it loads enabled database monitors. SQL statements
have a five-second timeout, in addition to the pool's connection-acquisition timeout.

The worker loads monitors immediately and polls again one second after each load.
Newly observed monitors are checked immediately. Later checks become due after
`interval_seconds` since the previous start, measured with a monotonic clock.
Actual starts may be delayed by polling, database latency, or an unfinished check.
Missed intervals are skipped rather than queued. Enabled-state and interval
changes take effect on subsequent successful loads. Already running checks finish
and persist even if a monitor is disabled during execution.

An in-flight entry covers both the HTTP check and its result insert, preventing
overlap for a monitor in this process. Other monitors run independently. This
initial design assumes a small configured monitor list and has no global HTTP
concurrency cap. Run only one worker: schedules are in memory, restart triggers
fresh checks, and multiple workers would duplicate monitoring.

Unhealthy check outcomes are persisted normally. Unexpected check, insert, and
monitor-loading failures produce generic diagnostics; subsequent scheduling
continues. Failed inserts are not retried or buffered, so results can be lost
during database outages.

Ctrl+C (`SIGINT`) or `SIGTERM` stops new scheduling, waits for the current database
load and in-flight checks/inserts, and closes the pool. Shutdown does not cancel
active checks and has no forced deadline; allow time for configured timeouts and
database work to finish. The API remains a separate process and its on-demand
endpoint behavior is unchanged.

Compose gives Node services a 30-second shutdown grace period before Docker can
force termination. The default five-second check timeout fits within that period;
very long custom timeouts may prevent a full drain before Docker stops the worker.

`npm test` includes deterministic worker tests using injected dependencies and
fake timers, without requiring PostgreSQL or external HTTP services.
