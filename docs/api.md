# API reference

The default local address is `http://127.0.0.1:3000`. These endpoints are for
local/private use. See [development setup](development.md) for configuration.

## Application health

`GET /health` returns HTTP 200 and `{"status":"ok"}`. It proves the Express
process can serve requests; it does not check PostgreSQL or worker progress.
Compose's API health check instead requests `/api/monitors`, exercising a database read.

## On-demand check

`POST /api/checks/run` requires no body and checks only the target supplied through
`MONITOR_NAME` and `MONITOR_URL`. Body/query URLs cannot select another target.
Compose configures the mock's healthy endpoint. The result is not persisted.

A completed check returns HTTP 200, including HTTP errors, network failures,
and timeouts. Example result:

```json
{
  "target": "Mock healthy",
  "status": "healthy",
  "statusCode": 200,
  "responseTimeMs": 12.5,
  "checkedAt": "2026-10-27T12:00:00.000Z",
  "error": null
}
```

`status` is `healthy` (2xx), `http_error` (other HTTP status), `timeout`, or
`connection_error`. `statusCode` is null when no HTTP response is received.
`error` is null for completed HTTP responses; otherwise it is a sanitized
message. `checkedAt` is the UTC check-start time. `responseTimeMs` measures time
until headers or request failure; response bodies are not evaluated. Redirects
are not followed. Unexpected application errors return HTTP 500 with
`{"error":"Internal server error"}`.

## Read-only monitoring API

The API uses standard PostgreSQL connection environment settings as described in
[database access configuration](../db/README.md). Migrate the database before using
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
