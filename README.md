# endpoint-watch
A lightweight API health monitoring and incident tracking application

## Automated checks

From `apps/api`, run `npm ci`, `npm test`, `npm run typecheck:tests`, and
`npm run build`. Database integration tests require a dedicated PostgreSQL
database, the `psql` client, and `TEST_DATABASE_URL`; see the
[integration test instructions](db/README.md#postgresql-integration-tests).
`npm run test:integration` explicitly requires database configuration.

GitHub Actions runs on pull requests and pushes to `main`, using Node.js 24 and
a disposable PostgreSQL 17 service to apply migrations, verify the schema, run
all tests, type-check test code, and build. No deployment or release steps run.

## Docker Compose development environment

From the repository root, copy `.env.example` to `.env` and set
`POSTGRES_PASSWORD` to a local development password. `.env` is ignored by Git.
Requires Docker with the Compose plugin.

```bash
cp .env.example .env
# Edit .env and set POSTGRES_PASSWORD before continuing.
docker compose up -d --build --wait
docker compose ps -a
docker compose logs -f api worker
```

Compose starts PostgreSQL, a one-shot migration service, a mock API, the Express
API, and a separate monitoring worker. PostgreSQL health gates migrations;
successful migrations and mock API health gate API/worker startup. Migration
failure prevents dependent services from starting. The API health check exercises
the database-backed monitor list; the worker check verifies process liveness,
not successful polling or persistence. Check history and logs for worker progress.

The migration job runs the existing tracked SQL migrations on every `up` and
idempotently adds three development monitors if their name/URL pair is absent.
These poll every 10 seconds: mock healthy (`/health`), HTTP 500 (`/error`), and
delayed (`/delay`). Existing monitor settings are not reset. The mock delay
defaults to 6000ms, exceeding the worker's default 5000ms timeout. Override
`MOCK_DELAY_MS` or `MONITOR_TIMEOUT_MS` in `.env` as needed.

Only the Express API is published, at `http://127.0.0.1:3000` (override `API_PORT`
in `.env`). PostgreSQL and the mock API have no host port mappings. Containers
use service DNS names `postgres` and `mock-api`, rather than host `localhost`.
The mock has no configuration/control routes and is for development only.
The API, worker, and mock share the compiled Node image with different commands.

```bash
curl http://127.0.0.1:3000/health
curl -X POST http://127.0.0.1:3000/api/checks/run
curl http://127.0.0.1:3000/api/monitors
# Use an ID from the monitor list; allow at least 10 seconds for initial history.
curl 'http://127.0.0.1:3000/api/monitors/1/checks?limit=5'
```

The on-demand route checks mock health without persisting; the worker writes
scheduled results. To inspect SQL directly without a host PostgreSQL client:

```bash
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Stop, rebuild, or reset using:

```bash
docker compose stop                 # Stop containers; retain database data.
docker compose up -d --build --wait # Start again and rebuild changed code.
docker compose down                # Remove containers/network; retain named volume.
docker compose down --volumes       # Delete this project's database data as well.
docker compose up -d --build --wait # Recreate schema and development monitors.
```

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

Requires Node.js 20.19 or newer. From `apps/api`:

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

## Database schema (Milestone 2)

See [database migrations](db/README.md) for local PostgreSQL setup, migration
commands, schema choices, and SQL verification. Migrations run separately; the
API reads stored monitoring data; the worker writes scheduled results.

## Read-only monitoring API

The API uses standard PostgreSQL connection environment settings as described in
[database access configuration](db/README.md). Migrate the database before using
these endpoints. Continue supplying `MONITOR_NAME` and `MONITOR_URL` for the
existing on-demand check. In Docker, supply database settings at runtime with
`-e` or `--env-file`; `PGHOST` must be reachable from inside the container.

| Endpoint | HTTP 200 response |
| --- | --- |
| `GET /api/monitors` | `{ "data": [monitor, ...] }`, including disabled monitors |
| `GET /api/monitors/:id` | `{ "data": monitor }` |
| `GET /api/monitors/:id/checks?limit=20` | `{ "data": [check, ...] }`, newest first |

Monitor fields are `id`, `name`, `intervalSeconds`, `enabled`, and `createdAt`.
Target URLs are intentionally omitted to avoid exposing credentials or query
secrets. Check fields are `id`, `monitorId`, `checkedAt`, `outcome`, `statusCode`,
`responseTimeMs`, and `error`. IDs are strings and timestamps are ISO UTC strings.
Stored diagnostics must already be sanitized by the writer.

IDs must be canonical positive decimal PostgreSQL bigint values (at most
`9223372036854775807`). History limits must be positive decimal integers from
1 through 1000, defaulting to 20; empty, repeated, fractional, and out-of-range
limits return HTTP 400. History is ordered by `checkedAt` descending, then ID
descending when timestamps tie. An existing monitor without checks returns an
empty array. Unknown monitors return HTTP 404. Invalid IDs return HTTP 400 and
unexpected failures return HTTP 500. Errors use `{ "error": "message" }`, with
generic messages for server errors.

`GET /health` and `POST /api/checks/run` retain their original response formats
and do not require a database connection. No monitor write endpoints are exposed.

## Scheduled monitoring worker

Apply the [database migrations](db/README.md) and configure trusted monitor rows
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

`npm test` includes deterministic worker tests using injected dependencies and
fake timers, without requiring PostgreSQL or external HTTP services.
