# Endpoint Watch - Technical Architecture
**Version:** 0.1  
**Status:** Proposed

## 1. Architecture Overview
Endpoint Watch is a lightweight API monitoring application built around a React frontend, Node.js backend, and PostgreSQL database.

The application follows a modular monolith architecture, with separate API and monitoring worker processes sharing application code and database access.

The architecture prioritizes simplicity, testability, local reproducibility, and clear separation of responsibilities.

## 2. Technology Stack
| Layer | Technology |
| ----------- | ----------- |
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
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

### 3.2 Node.js REST API
The backend exposes HTTP endpoints for retrieving monitoring information and managing monitor configuration.

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

Indexes will support efficient retrieval of recent results by monitor and timestamp.

### 3.5 Mock API
A separate mock HTTP service will provide predictable test scenarios, including successful responses, HTTP errors, delays, and intermittent failures.

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
4. Persistence of on-demand results will be determined during implementation.

## 5. HTTP Check Behavior
The shared monitoring function will accept a predefined monitor target and return a structured result.

Each result includes:

- Target identifier or name.
- Check timestamp.
- Outcome.
- HTTP status code, when available.
- Response time in milliseconds.
- Sanitized error information, when applicable.

Initial outcome categories:

- `healthy`: HTTP 2xx response.
- `http_error`: HTTP response outside the 2xx range.
- `timeout`: Request exceeded the configured timeout.
- `connection_error`: DNS, connection, or other network failure.

A failed check must not terminate the monitoring process.

## 6. API Design
The initial API will expose:

### GET /health
Returns basic application health information.

### POST /api/checks/run
Executes an on-demand check against a predefined, allowlisted endpoint and returns the result.

Future endpoints may include:

- `GET /api/monitors` - List configured monitors.
- `GET /api/monitors/:id` - Retrieve monitor details.
- `GET /api/monitors/:id/checks` - Retrieve historical check results.
- `POST /api/monitors` - Create a monitor.
- `PATCH /api/monitors/:id` - Update monitor configuration.

API responses will use JSON. Error responses will follow a consistent structure.

## 7. Deployment and Local Development
Docker Compose will provide the local development environment.

The complete MVP will include:
- Node.js API service
- Monitoring worker service.
- PostgreSQL service.
- Mock API service for development.

The React frontend may run through Vite during development and be containerized for deployment.

Application configuration will use environment variables. Secrets and local environment files will not be committed to source control

The initial development environment must not require paid cloud infrastructure.

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

Database integration tests wil be added when persistence is implemented.

### End-to-End Tests
Playwright will test primary dashboard workflows after the frontend is implemented.

### CI
GitHub Actions will execute automated test and build checks for pull requests.

## 9. Security Considerations
- Monitor targets must be explicitly configured or allowlisted for the initial MVP.
- Arbitrary user-supplied URLs must not be accepted without appropriate SSRF protections.
- HTTP request must have timeouts.
- Diagnostic errors must not expose secrets.
- Public deployments must restrict administrative and on-demand monitoring functionality.
- The mock API must not expose unrestricted failure-control endpoints publicly.

## 10. Implementation Milestones
### Milestone 1 - Stateless Monitoring API
Implement an on-demand HTTP check using Node.js, TypeScript, and Express.

Deliverables:
- Reusable HTTP checking function.
- Basic REST API.
- Structured check results.
- Unit and integration tests.
- Dockerized execution.

No database, scheduling, or frontend is required.

### Milestone 2 - Persistent Scheduled Monitoring
Introduce PostgreSQL and a separate worker process.

Deliverables:
- Database schema and migrations.
- Configured monitor storage.
- Scheduled health checks.
- Persistent check results.
- Historical results API.

### Milestone 3 - Support Dashboard
Build the React frontend.

Deliverables:
- Monitor overview.
- Current endpoint status.
- Response time display.
- Recent check history.
- Simulated failure and recovery demonstration.

## 11. Future Architectural Considerations
Potential future improvements include:
- Incident detection and recovery tracking.
- Support and developer dashboard modes.
- Notifications and alerting.
- Configurable success criteria.
- Advanced HTTP request configuration.
- Authentication and authorization.
- Kubernetes deployment.

These are intentionally deferred until the core monitoring application is functional.

## 12. Open Questions
- How should the worker schedule checks without overlapping executions?
- How long should historical results be retained?
- Should on-demand checks be persisted?
- What level of concurrency should the monitoring worker support?
- How should endpoint degradation be distinguished from outright failure?


## Milestone 1 Implementation Decisions
The following decisions clarify the initial stateless monitoring API implementation.

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