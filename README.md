# Endpoint Watch

Endpoint Watch monitors configured HTTP endpoints, records availability and
response times in PostgreSQL, and exposes an API for recent monitoring history.
A separate worker performs scheduled checks. The local environment includes a
mock API for healthy, HTTP-error, and timeout scenarios. The React dashboard
shows monitor outcomes and recent history with automatic refresh. Incident
detection is not implemented.

## Prerequisites

- Docker with Docker Compose and a running Docker engine.
- A browser, `curl`, and a POSIX-compatible shell for the smoke test.
- No host Node.js or PostgreSQL installation is required for Compose.

## Docker Compose quick start

Run from the repository root. Create `.env` only if it does not already exist:

```bash
if [ ! -e .env ]; then cp .env.example .env; fi
```

Edit `.env` and set `POSTGRES_PASSWORD` to a local development password. Keep it
uncommitted. Preserve existing credentials when reusing an existing database volume.
Then start the environment:

```bash
docker compose up -d --build --wait
```

Open **http://127.0.0.1:8080** (or the `WEB_PORT` set in `.env`).

Expected: PostgreSQL, mock API, API, worker, and web become healthy; `migrate` completes
with exit code 0. This verifies startup dependencies, schema initialization,
and basic readiness. Frontend and API ports are published only on the host's
loopback interface; the browser uses the frontend origin for `/api` requests.

## Five-minute manual smoke test

Run after the quick start; initial image downloads/builds may take longer than
five minutes. These steps assume default ports (`WEB_PORT=8080`, `API_PORT=3000`),
6000ms mock delay, 5000ms request timeout, and enabled seeded 10-second monitors.
A reused database may contain additional monitors or changed settings.

1. **Confirm startup:** run `docker compose ps -a`. Expect five healthy running
   services and `migrate` exited with code 0. This proves startup readiness;
   worker health alone indicates liveness, not successful persistence.

2. **Open the dashboard:** visit `http://127.0.0.1:8080`. Expect Endpoint Watch,
   three seeded monitors, and summary counts. After worker checks finish, expect
   Healthy, HTTP error, and Timeout. This exercises the built frontend, Nginx's
   same-origin proxy, Express, and stored monitoring data. A new database may
   briefly show no recorded checks before the worker's first results arrive.

3. **View history:** Tab to “View history for Mock healthy” and press Enter.
   Expect focus on the detail heading and recent rows showing local timestamps,
   outcomes, HTTP status codes, response times, and errors. Close history and
   expect focus to return to the selected button. This checks keyboard navigation
   and retrieval of persisted history.

4. **Check refresh and worker progress:** keep the panel open for a worker interval
   and a dashboard refresh cycle (about 30 seconds), or use Refresh. Expect newer
   check timestamps/IDs and advancing successful-update times while selection
   remains intact. This verifies recurring worker writes and frontend polling.
   `docker compose logs --tail=30 worker` shows failures; successful checks are
   not logged. See [troubleshooting](docs/troubleshooting.md) if history stays stale.

5. **Verify API health and an on-demand check:**

   ```bash
   curl -i http://127.0.0.1:3000/health
   curl -i -X POST http://127.0.0.1:8080/api/checks/run
   curl -i http://127.0.0.1:8080/api/monitors
   ```

   Expect HTTP 200 for all three. Health returns `{"status":"ok"}`; the check
   reports `status: "healthy"` and `statusCode: 200`; the list has a `data` array.
   These verify Express health and browser-origin API forwarding. The on-demand
   check is not persisted. For a direct history check, enter a returned monitor ID:

   ```bash
   read -r MONITOR_ID
   curl -i "http://127.0.0.1:8080/api/monitors/$MONITOR_ID/checks?limit=5"
   ```

   Expect HTTP 200 and newest-first history for that monitor. IDs are not assumed
   to start at 1. PostgreSQL and mock API ports are not exposed to the host.

6. **Shut down safely:**

   ```bash
   docker compose down
   docker compose ps -a
   ```

   Expect no remaining service containers. The named PostgreSQL volume is retained,
   preserving history for the next start. Database deletion is a separate
   [destructive reset](docs/development.md#destructive-database-reset).

## Detailed documentation

- [Development](docs/development.md): Node, Docker, Compose, worker operation, rebuilds, and shutdown/reset.
- [API reference](docs/api.md): response formats, validation, and error behavior.
- [Database](db/README.md): PostgreSQL setup, schema, migrations, and repository types.
- [Testing and CI](docs/testing.md): local checks, PostgreSQL integration tests, and GitHub Actions verification.
- [Security maintenance](docs/security.md): supported runtime, audit results, and remaining container findings.
- [Troubleshooting](docs/troubleshooting.md): startup failures, credentials, ports, and missing history.
- [Product specification](SPEC.md) and [architecture](docs/architecture.md): requirements and design.

The smoke test is a developer verification procedure. Documentation/link checks
alone do not establish that your local environment or GitHub Actions run passed.
