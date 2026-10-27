# Troubleshooting

Run Compose commands from the repository root. Start with:

```bash
docker compose ps -a
docker compose logs --tail=50 postgres migrate api worker mock-api
```

These show service states and recent diagnostics. Logs may contain local
configuration details; review them before sharing. See the
[smoke test](../README.md#five-minute-manual-smoke-test) for expected normal behavior.

## Docker or Compose cannot start

Ensure the Docker engine is running. A missing daemon socket or permission error
means the CLI could not access the engine; it does not establish an application
failure. A missing `POSTGRES_PASSWORD` error means Compose could not resolve the
required environment value. Create `.env` from `.env.example` only if absent and
set a local password. Do not post the contents of `.env` or resolved Compose
configuration containing passwords.

If the API port is occupied, stop the other listener or change `API_PORT` in
`.env`, then run `docker compose up -d --build --wait`. Use that port in curl
commands. The default is 3000; the container still listens on port 3000.

## Migrations fail or API/worker do not start

```bash
docker compose logs --tail=50 migrate postgres
```

Expected: PostgreSQL is healthy and the migration service exits with code 0.
API/worker startup is blocked if migration completion or mock health fails.
Migrations are not run by the application process. Do not bypass a failed
migration dependency to hide a schema error. After resolving the cause, follow
[the migration restart procedure](development.md#docker-compose-development-environment).

The migration job also seeds development monitors. Repeated execution skips
applied migrations and inserts no duplicate name/URL pairs. It does not reset
existing monitor intervals or enabled settings. `docker compose restart` alone
is not a substitute for applying new SQL migrations.

## Password changes do not work with an existing volume

PostgreSQL's initial user, password, and database settings take effect on an
empty data volume. Editing `.env` does not update the stored credentials. Restore
the original settings or deliberately reset disposable development data using
the [destructive reset procedure](development.md#destructive-database-reset).
Normal `docker compose down` retains data; adding `--volumes` deletes it.

## Health succeeds but monitor/history requests fail

`GET /health` verifies Express only. `/api/monitors` additionally needs a database
connection and migrated schema. Native Node and standalone Docker examples need
PostgreSQL configuration to serve database-backed routes; Compose supplies it.
See [development setup](development.md) and [database connection settings](../db/README.md#typescript-access-layer).

Database and mock services are not published to the host. `postgres` and
`mock-api` are Compose DNS names usable by containers on that network. Inside a
container, `127.0.0.1` means that same container, not another service or your host.

## History is empty or stops advancing

An existing monitor without results returns HTTP 200 and `{"data":[]}`. A missing
monitor returns 404. Copy an actual ID from `/api/monitors`, not an assumed ID.
Allow at least one interval and request timeout for results to arrive. The seeded
interval is 10 seconds; existing rows may have different settings.

```bash
docker compose ps -a
docker compose logs --tail=50 worker
```

Worker health is a liveness check, not proof of persistence. Successful checks
produce no worker logs. Compare successive history responses for new IDs and
advancing timestamps. Database-load failures are retried; insert failures are
logged but results are not buffered or retried. Confirm monitors are enabled
and run only one worker.

To inspect the database without a host PostgreSQL client:

```bash
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

At the SQL prompt, a read-only inspection can use:

```sql
SELECT id, name, enabled, interval_seconds FROM monitors ORDER BY id;
SELECT monitor_id, outcome, checked_at FROM check_results
ORDER BY checked_at DESC, id DESC LIMIT 10;
```

Expected: enabled development monitors and recent result timestamps. This helps
distinguish absent worker writes from incorrect API IDs or empty history.

The delayed scenario produces `timeout` only when `MOCK_DELAY_MS` exceeds
`MONITOR_TIMEOUT_MS`. With defaults, the mock returns headers after 6000ms and
the checker aborts after 5000ms. An `http_error` or `timeout` result is expected
simulation behavior, not a worker crash.

## Tests skip PostgreSQL or migration tests cannot connect

Follow [Testing and CI](testing.md#postgresql-integration-tests) with a dedicated
migrated test database. `npm test` skips database suites when `TEST_DATABASE_URL`
is missing; `npm run test:integration` fails explicitly. Native tests need `psql`
and database privileges to create/drop temporary schemas. Compose's database
has no host port mapping and should not be reused by tests while a worker runs.

Migration diagnostics distinguish connection failures (exit 2) from SQL script
failures (exit 3). The rollback test deliberately requires SQLSTATE `42P07`.
Wrappers must pass through `--dbname` and `PGOPTIONS` unchanged. Do not put a full
connection URL in `PGDATABASE`. See [CI verification](testing.md#verify-github-actions)
for checking the hosted run; local success does not establish hosted success.
