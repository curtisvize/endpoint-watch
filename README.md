# Endpoint Watch

Endpoint Watch monitors configured HTTP endpoints, records availability and
response times in PostgreSQL, and exposes an API for recent monitoring history.
A separate worker performs scheduled checks. The local environment includes a
mock API for healthy, HTTP-error, and timeout scenarios. A dashboard and incident
detection are not implemented yet.

## Prerequisites

- Docker with Docker Compose and a running Docker engine.
- `curl` and a POSIX-compatible shell for the smoke-test commands.
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

Expected: PostgreSQL, mock API, API, and worker become healthy; `migrate` completes
with exit code 0. This verifies startup dependencies, schema initialization,
and basic readiness. Only the API is published, on the host's loopback interface.

## Five-minute manual smoke test

Run after the quick start; first-time image downloads/builds may take longer
than five minutes. Commands assume the default `API_PORT=3000`, mock delay of
6000ms, and check timeout of 5000ms. Adjust the URL if your API port differs.
Existing monitor settings are preserved, so the expected scenarios assume the
three development monitors remain enabled with their seeded 10-second intervals.

1. **Confirm service startup.**

   ```bash
   docker compose ps -a
   API_BASE=http://127.0.0.1:3000
   ```

   Expect four healthy running services and `migrate` exited with code 0. This
   confirms the stack started; worker health indicates process liveness only.

2. **Check the API process.**

   ```bash
   curl -i "$API_BASE/health"
   ```

   Expect HTTP 200 and `{"status":"ok"}`. This proves Express responds, not that
   monitoring results are being stored.

3. **Trigger an on-demand check.**

   ```bash
   curl -i -X POST "$API_BASE/api/checks/run"
   ```

   Expect HTTP 200 with `status: "healthy"`, `statusCode: 200`, a timestamp, and
   response time. This proves the API can reach the configured mock target.
   This route does not persist results.

4. **List stored monitors and choose one.**

   ```bash
   curl -i "$API_BASE/api/monitors"
   read -r MONITOR_ID
   ```

   Expect HTTP 200 with a `data` array containing `Mock healthy`, `Mock HTTP error`,
   and `Mock delayed` on a fresh database. Additional monitors may exist on a reused
   volume. Enter the ID of `Mock healthy` at the `read` prompt. This verifies the
   API reads configured monitors from PostgreSQL; IDs are not assumed to start at 1.

5. **Retrieve persisted history.** Allow about 10 seconds after startup.

   ```bash
   curl -i "$API_BASE/api/monitors/$MONITOR_ID/checks?limit=5"
   ```

   Expect HTTP 200 and a nonempty `data` array, newest first, with `outcome: "healthy"`.
   This proves scheduled results were persisted and retrieved through the API.
   Repeating with the other returned monitor IDs should show `http_error` with
   `statusCode: 500`, and `timeout` with `statusCode: null`, respectively.

6. **Verify continuing worker progress.**

   ```bash
   sleep 12
   curl -i "$API_BASE/api/monitors/$MONITOR_ID/checks?limit=5"
   docker compose logs --tail=30 worker
   ```

   Expect a new result ID and later `checkedAt` than in step 5. This demonstrates
   recurring scheduling and writes, not just an initial check. The worker does
   not log successful checks; empty logs can be normal. If history does not
   advance, use the [troubleshooting guide](docs/troubleshooting.md).

7. **Shut down safely.**

   ```bash
   docker compose down
   docker compose ps -a
   ```

   Expect the project's containers to be removed, with no service rows remaining.
   The named PostgreSQL volume is retained, preserving monitoring history for the
   next start. Database deletion is a separate [destructive reset](docs/development.md#destructive-database-reset).

## Detailed documentation

- [Development](docs/development.md): Node, Docker, Compose, worker operation, rebuilds, and shutdown/reset.
- [API reference](docs/api.md): response formats, validation, and error behavior.
- [Database](db/README.md): PostgreSQL setup, schema, migrations, and repository types.
- [Testing and CI](docs/testing.md): local checks, PostgreSQL integration tests, and GitHub Actions verification.
- [Troubleshooting](docs/troubleshooting.md): startup failures, credentials, ports, and missing history.
- [Product specification](SPEC.md) and [architecture](docs/architecture.md): requirements and design.

The smoke test is a developer verification procedure. Documentation/link checks
alone do not establish that your local environment or GitHub Actions run passed.
