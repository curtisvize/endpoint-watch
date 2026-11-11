# Endpoint Watch - Technical Architecture
**Version:** 0.2

**Status:** Implemented local/private MVP with Milestone 4 polish

## 1. Architecture Overview
Endpoint Watch is a lightweight API monitoring application built around a React frontend, Node.js backend, and PostgreSQL database.

The application follows a modular monolith architecture, with separate API and monitoring worker processes sharing application code and database access.

The architecture prioritizes simplicity, testability, local reproducibility, and clear separation of responsibilities.

This document describes the implemented system. Milestones 1–3 and the Milestone 4
UI/reliability/runtime improvements are implemented; portfolio screenshots are
pending. Future ideas and deployment limitations are separated below. See the
[API reference](api.md) for exact response contracts and [security maintenance](security.md)
for outstanding vulnerability findings.

## 2. Technology Stack
| Layer | Technology |
| ----------- | ----------- |
| Frontend | React, TypeScript, Vite |
| Backend | Node.js 24 LTS, Express, TypeScript |
| Database | PostgreSQL |
| Database client | node-postgres (pg) |
| HTTP client | Node.js built-in `fetch` |
| Unit and integration testing | Vitest |
| End-to-end testing | Playwright |
| Containerization | Docker, Docker Compose |
| Continuous integration | GitHub Actions |

## 3. Application Components
### 3.1 React Frontend
The frontend provides a support-oriented monitoring dashboard.

Responsibilities:
- Display configured monitors and their latest known status.
- Show response times and recent check history.
- Provide navigation to individual monitor details.
- Consume monitoring data through the backend REST API.

The frontend does not execute scheduled health checks or connect directly to the database.

The overview loads one latest-history entry per monitor; a selected detail panel
loads up to 20 entries and retains the table alongside an SVG chart. The chart
orders points by check timestamp, joins consecutive HTTP responses, and breaks
lines at timeouts/connection failures. An outcome strip shows every recorded
check independently of measured response latency.

Each section polls about 15 seconds after requests settle, prevents overlapping
refreshes, retains old data on failure, and aborts obsolete requests on cleanup.
The API client has a 10-second deadline covering headers and body reads. Failed
refreshes show stale-data warnings separately from timestamp-based freshness.
Freshness becomes overdue after the monitor interval plus the greater of 30 seconds
or half the interval; a local timer updates it even when records do not change.
Disabled monitors show paused freshness. Overdue does not confirm endpoint failure.

### 3.2 Node.js REST API
The backend exposes read-only monitoring endpoints and a configured on-demand check.
It provides no monitor-management endpoints.

Responsibilities:
- Handle incoming HTTP requests.
- Validate inputs.
- Execute on-demand health checks.
- Retrieve monitoring history from PostgreSQL.
- Return structured JSON responses.
- Provide application health endpoints.

### 3.3 Monitoring Worker
The worker runs independently of incoming API requests.

Responsibilities:
- Identify enabled monitors.
- Execute scheduled HTTP checks.
- Measure response times.
- Categorize failures.
- Persist monitoring results.
- Continue processing when individual checks fail.

The worker and API share monitoring and database modules but execute as separate processes.

One process polls enabled monitors roughly once a second. A monotonic clock tracks
last-start times; checks become due after their configured start-to-start interval.
An in-flight map prevents overlap for the same monitor, while different monitors
can run concurrently. Checks are not queued up for missed intervals. Errors are
isolated and logged without raw diagnostics; subsequent polls continue.
SIGINT/SIGTERM stop scheduling, await in-flight work, and close the database pool.
There is no distributed lock or global concurrency limit; run one worker.

### 3.4 PostgreSQL Database
PostgreSQL stores monitor configuration and historical check results.

The initial data model consists of two tables:  

**monitors**
- id
- name
- url
- interval_seconds
- enabled
- created_at

**check_results**
- id
- monitor_id
- checked_at
- outcome
- status_code
- response_time_ms
- error_message

The `monitor_id` column references `monitors.id`.

The recent-history index uses monitor ID, descending check timestamp, and descending
ID for deterministic ties. Timestamps use PostgreSQL `timestamptz`. Plain SQL
migrations run transactionally with version tracking and an advisory lock; no ORM
is used. See the [database guide](../db/README.md) for the schema and migration commands.

### 3.5 Mock API
A separate mock HTTP service provides fixed `/health`, `/error`, and `/delay`
scenarios. Stopping/restarting the service demonstrates connection failure and
recovery. Automatic intermittent failures are not implemented.

The mock API is a development and testing dependency, not part of the production monitoring application.

## 4. Monitoring Workflow
For scheduled monitoring:

1. The worker retrieves enabled monitors.
2. It identifies monitors due for a check.
3. It sends HTTP requests with configured timeouts.
4. It measures request duration and categorizes outcomes.
5. It persists check results.
6. The REST API retrieves stored results for the dashboard.

For on-demand monitoring:

1. A client requests an immediate health check.
2. The API invokes the shared monitoring function.
3. The result is returned as JSON.
4. The result is not persisted and does not alter scheduled monitor history.

## 5. HTTP Check Behavior
The shared monitoring function accepts a trusted configured monitor target and returns a structured result.

Each result includes:

- Target identifier or name.
- Check timestamp.
- Outcome.
- HTTP status code, when available.
- Response time in milliseconds.
- Sanitized error information, when applicable.

Outcome categories:

- `healthy`: HTTP 2xx response.
- `http_error`: HTTP response outside the 2xx range.
- `timeout`: Request exceeded the configured timeout.
- `connection_error`: DNS, connection, or other network failure.

A failed check must not terminate the monitoring process.

## 6. API Design
The implemented API exposes:

### GET /health
Returns basic application health information.

### POST /api/checks/run
Executes an on-demand check against a predefined, allowlisted endpoint and returns the result.

### Read-only monitor endpoints

- `GET /api/monitors` — all configured monitors, including disabled monitors.
- `GET /api/monitors/:id` — one configured monitor.
- `GET /api/monitors/:id/checks` — newest-first history; validated limit 1–1000,
  default 20.

Read endpoints return `{ "data": ... }`. Invalid parameters, unknown monitors,
and unexpected errors return appropriate 400, 404, and generic 500 JSON responses.
Target URLs are omitted. Health and on-demand checks retain their original formats
and do not require a database. No create, update, or delete endpoints are implemented.
See [API reference](api.md) for fields and validation details.

## 7. Deployment and Local Development
Docker Compose provides the local development environment.

The local environment includes:
- Node.js API service.
- Monitoring worker service.
- PostgreSQL service.
- Mock API service for development.
- Built React frontend served by Nginx.
- One-shot SQL migration and development seed service.

The frontend can run through Vite for native development. Compose serves its built
assets through Nginx, which proxies browser `/api` requests to Express on the
internal network. Browser code uses relative URLs, not Docker service hostnames.
Web/API host ports bind to loopback; PostgreSQL and mock ports are not published.
A named volume preserves database history across normal shutdowns. PostgreSQL
readiness gates migrations; API/worker wait for migrations and mock readiness;
web waits for API health. Worker health checks indicate process liveness, not
proof of successful scheduled writes.

Application configuration uses environment variables. Secrets and local environment files are not committed to source control.

The environment requires no paid cloud infrastructure and is not a public-deployment template.

## 8. Testing Strategy
### Unit Tests
Test monitoring logic independently from the HTTP server and database.

Cover:
- Successful HTTP responses.
- Non-2xx responses.
- Request timeouts.
- Network failures.
- Response-time measurement.

### Integration Tests
Test API routes, validation, and response formats.

PostgreSQL integration tests exercise migrations, rollback, repository queries,
scheduled persistence, and API retrieval in isolated test data. Route tests also
use injected repositories and loopback HTTP servers, without public HTTP services.

### End-to-End Tests
Playwright tests dashboard loading, monitor selection, keyboard focus, and
persisted history using a disposable Compose database and fixed fixtures. Its
worker is disabled to avoid timing-dependent browser assertions. Vitest uses
mocked network responses and controllable clocks for polling, freshness, and charts.

### CI
GitHub Actions runs backend and frontend test/build jobs for pull requests and
pushes to `main`, selecting Node 24 through `.nvmrc`. Backend CI uses a PostgreSQL
service; frontend CI includes Compose/Playwright checks. No deployment job exists.
Local results and hosted-run verification are documented separately in
[testing](testing.md).

## 9. Security Considerations
- Monitor targets must be explicitly configured or allowlisted for the initial MVP.
- Arbitrary user-supplied URLs must not be accepted without appropriate SSRF protections.
- HTTP request must have timeouts.
- Diagnostic errors must not expose secrets.
- Public deployments must restrict administrative and on-demand monitoring functionality.
- The mock API must not expose unrestricted failure-control endpoints publicly.

## 10. Implementation Milestones
### Milestone 1 - Stateless Monitoring API (implemented)
Implement an on-demand HTTP check using Node.js, TypeScript, and Express.

Deliverables:
- Reusable HTTP checking function.
- Basic REST API.
- Structured check results.
- Unit and integration tests.
- Dockerized execution.

Database, scheduling, and frontend were excluded from this historical milestone.

### Milestone 2 - Persistent Scheduled Monitoring (implemented)
Introduce PostgreSQL and a separate worker process.

Deliverables:
- Database schema and migrations.
- Configured monitor storage.
- Scheduled health checks.
- Persistent check results.
- Historical results API.

### Milestone 3 - Support Dashboard (implemented)
Build the React frontend.

Deliverables:
- Monitor overview.
- Current endpoint status.
- Response time display.
- Recent check history.
- Simulated failure and recovery demonstration.

### Milestone 4 - Portfolio Readiness

Implemented: freshness indicators, bounded requests and recovery, SVG latency and
outcome history, selection/responsive polish, and Node 24/dependency maintenance.
Presentation documentation describes the completed system; screenshot assets are
still pending in [the screenshot directory](screenshots/README.md).

## 11. Future Architectural Considerations
Potential future improvements include:
- Incident detection and recovery tracking.
- Support and developer dashboard modes.
- Notifications and alerting.
- Configurable success criteria.
- Advanced HTTP request configuration.
- Authentication and authorization.
- Kubernetes deployment.

These are intentionally outside the implemented local MVP and are not delivery commitments.

## 12. Decisions, Tradeoffs, and Known Limitations

- **Single-worker scheduling:** in-process state keeps scheduling and overlap
  protection readable. Worker restarts reset this state; multiple processes would
  need coordination. There is no catch-up queue or global concurrency cap.
- **Separate check paths:** scheduled checks use database monitors and persist;
  on-demand checks use an environment target and remain stateless. They reuse the
  same HTTP checker without coupling request handling to the scheduling loop.
- **Local/private operation:** loopback bindings and a shared database owner simplify
  onboarding. HTTPS, access controls, restricted on-demand load, and separate
  application/migration database roles are prerequisites for public deployment.
- **Bounded view, unbounded storage:** the detail panel shows recent checks, but
  automatic retention, aggregates, and history pagination controls are absent.
- **Observation semantics:** checks measure time to headers, not response-body
  validity. Freshness relies on browser time and configured intervals; it does
  not establish worker health or infer incidents.
- **Outstanding security findings:** see [security maintenance](security.md) for
  base-image findings, applicability notes, and the dated scan/verification record.

## Milestone 1 Implementation Decisions (historical)

The following decisions record the initial stateless API scope. Deferrals here
applied to Milestone 1 only; the sections above describe the completed system.

### Scope
- Implement the Node.js/Express/TypeScript API.
- Implement a reusable HTTP checking function.
- Include unit tests for the checking function and integration tests for the API route.
- Provide a Dockerfile for local containerized execution.
- Defer Docker Compose, GitHub Actions, the mock API, database persistence, scheduling, and frontend development.
- Monitor configuration and management endpoints are excluded from this milestone.

### API Contract
`GET /health`
Returns HTTP 200 with basic application health information.

`POST /api/checks/run`
Executes an on-demand check against one predefined target.

No request body is required.

A completed check returns HTTP 200, even when the monitored endpoint is unhealthy.

Example check result:
```
{
  "target": "Example Service",
  "status": "healthy",
  "statusCode": 200,
  "responseTimeMs": 142,
  "checkedAt": "2026-10-15T19:00:00.000Z",
  "error": null
}
```

Possible status values:
- `healthy`
- `http_error`
- `timeout`
- `connection_error`

`statusCode` is null when no HTTP response is received.

`error` is null for completed HTTP responses and contains a sanitized message for network failures or timeouts.

Unexpected application errors return HTTP 500 with a generic JSON error response.

### Configuration
The monitored target is configured through environment variables.

Initial settings:
- Target display name.
- Target URL.
- Request timeout, defaulting to 5,000 milliseconds.

The URL must use the HTTP or HTTPS scheme.

Required configuration is validated at application startup. Invalid configuration prevents startup with a clear diagnostic message.

No user-supplied monitoring URLs are accepted through the API.

### HTTP Check Semantics
- `checkedAt` records the UTC time when the check begins.
- `responseTimeMs` measures elapsed time until response headers are received or the request fails.
- HTTP status codes 200–299 are considered healthy.
- Other HTTP responses are categorized as `http_error`.
- Redirects are not followed (`redirect: "manual"`).
- Requests use a configurable timeout.
- Response bodies are not required for health evaluation.

### Testing
Unit tests use an injected or mocked HTTP client and do not depend on external network services.

API integration tests verify route behavior and response structure without requiring public APIs.

Tests must cover successful responses, HTTP errors, timeouts, and connection failures.

### Deployment and Security
Milestone 1 is intended for local/private development only.

The API must not be publicly exposed without additional access controls and network security protections.

Only explicitly configured targets are checked.

### Dependencies
The technologies explicitly listed in the architecture are approved for installation, including required development tooling and TypeScript type definitions.

Additional libraries or frameworks require approval before installation.