# endpoint-watch
A lightweight API health monitoring and incident tracking application

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
API remains stateless at this step.

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
