# Endpoint Watch - Product Specification
**Version:** 0.2

**Status:** MVP complete for local/private use; Milestone 4 polish implemented

## 1. Overview
Endpoint Watch is a lightweight API health monitoring application designed for SaaS technical support and engineering teams.

The application periodically checks HTTP endpoints, records their availability and response times, and provides a dashboard for quickly identifying service disruptions and investigating failures.

The project is intended to demonstrate practical application development, API integration, automated testing, containerization, and operational troubleshooting.

### Implementation status

Milestones 1–3 are implemented: configured HTTP checks, PostgreSQL persistence,
a standalone scheduled worker, read-only monitoring APIs, and the React dashboard.
Milestone 4 adds result freshness, bounded dashboard requests and recovery,
response-time charts with outcome markers, responsive/keyboard usability polish,
and Node 24/dependency maintenance. Portfolio screenshots remain pending.

The application is a local/private MVP, not a production monitoring service.
Known limitations are listed below; current vulnerability findings and verification
scope are recorded in [security maintenance](docs/security.md).

## 2. Problem Statement
Technical support engineers often need to determine whether a reported customer issue is related to an unavailable or degraded backend service.

Without centralized monitoring, investigating these issues may require manually testing endpoints, inspecting logs, or consulting multiple tools.

Endpoint Watch provides a centralized view of endpoint availability, historical performance, and failure information to support initial troubleshooting.

## 3. Target Users
### Primary: SaaS Technical Support Engineer
Needs to:
- Quickly identify unhealthy or degraded endpoints.
- Determine when a failure occurred and whether the service has recovered.
- Review recent check results and response times.
- Access useful diagnostic information when investigating incidents.

### Secondary: Software Developer / Implementation Engineer
Needs to:
- Inspect HTTP response codes and error details.
- Configure endpoints for monitoring.
- Investigate intermittent failures and performance issues.
- Validate expected endpoint behavior.

## 4. Core Requirements (MVP)
### 4.1 Endpoint Configuration
The application shall:
- Maintain a list of HTTP endpoints to monitor.
- Store a display name and URL for each endpoint.
- Support HTTP GET requests initially.
- Allow endpoints to be enabled or disabled.
- Use a configurable monitoring interval, with a default of 60 seconds.

Configured monitors are stored in PostgreSQL and initially seeded with SQL.
Enable/disable and interval changes require database updates; there is no
monitor-management API or UI. The schema defaults to 60 seconds; local demo
seeds use 10 seconds.

### 4.2 Health Checks
The application shall:
- Send HTTP requests to configured endpoints.
- Record the HTTP status code when a response is received.
- Measure elapsed request time in milliseconds.
- Record the timestamp of each check.
- Apply a configurable request timeout.
- Distinguish successful responses, HTTP errors, timeouts, and connection failures.

For the MVP, HTTP 2xx status codes are considered successful. Other responses are considered failed checks.

### 4.3 Monitoring History
The application shall:
- Persist check results in a database.
- Associate each result with its monitored endpoint.
- Retrieve recent results for an endpoint.
- Display the most recent check result and timestamp.

### 4.4 Support Dashboard
The dashboard shall:
- Display all configured monitored endpoints.
- Show the latest known status of each endpoint.
- Display the last check time and response time.
- Allow users to inspect recent check history.
- Clearly distinguish healthy, unhealthy, and not-yet-checked endpoints.

### 4.5 Failure Simulation
The development environment shall include a mock HTTP API capable of simulating:
- Successful responses.
- HTTP 500 errors.
- Delayed responses.
- Connection failures when the mock service is stopped.

The mock API is intended for development and testing, not as a production monitoring target.
Stopping/restarting it demonstrates connection failure and recovery. An automatic
intermittent-failure endpoint is a future idea, not implemented behavior.

## 5. User Interface
The dashboard prioritizes support workflows and clear presentation of the latest
known outcomes. It includes monitor selection, recent history, response-time
lines, a separate check-outcome strip, and keyboard-accessible detail navigation.
Timeout/connection-failure durations are excluded from latency measurements.
Freshness is calculated separately from outcome; overdue is not a failure verdict.
Polling retains displayed data on failed refreshes and retries after bounded
requests. Times are displayed in the user's local timezone.

A future developer-focused view may expose additional technical details, including response metadata and diagnostic information.

The local/private implementation has no user accounts or role-based access control.

## 6. Non-Functional Requirements
### Reliability
- A failed endpoint check must not terminate the monitoring worker.
- Errors must be recorded with enough information to distinguish common failure types.
- Monitoring must continue when individual endpoints are unavailable.

### Security
- The MVP monitors only explicitly configured or allowlisted endpoints.
- Request timeouts must prevent indefinitely hanging checks.
- The application must not expose secrets or sensitive configuration in API responses or logs.
- A public deployment must not allow unrestricted requests to arbitrary URLs.

### Maintainability
- Application code should be modular and documented.
- Business logic should be testable independently of the user interface.
- Configuration should be separated from application code.

### Testing
- Automated tests shall cover successful checks, HTTP errors, timeouts, and connection failures.
- API behavior shall be covered by integration tests.
- Core dashboard workflows shall be covered by end-to-end tests.

### Development Environment
- The application must run locally without paid cloud services.
- Docker Compose provides a reproducible local environment.
- GitHub Actions runs automated checks on pull requests and pushes to `main`.

## 7. Initial Vertical Slice (Milestone 1)
This completed historical milestone established the stateless API. Its scope
exclusions below applied to Milestone 1 only; later milestones added the database,
scheduling, and frontend.

### Scope
1. Create a Node.js/TypeScript API application.
2. Implement a reusable HTTP checking function.
3. Configure one predefined monitoring target.
4. Expose an endpoint that triggers a check and returns its result.
5. Handle successful responses, HTTP errors, timeouts, and connection failures.
6. Write automated tests for the checking function.
7. Run the application locally in Docker.

### Acceptance Criteria
- A developer can start the API using documented commands.
- A request to the monitoring API triggers an HTTP check.
- The result includes a timestamp, outcome, HTTP status code when available, and response time.
- Network failures and timeouts return structured error results rather than crashing the application.
- Automated tests pass.
- The application runs successfully inside a Docker container.

Database persistence, scheduling, and the frontend dashboard are explicitly excluded from this milestone.

## 8. Future Enhancements (Out of MVP Scope)
Potential enhancements include:
- Support and developer dashboard modes.
- Incident detection and recovery timelines.
- Email or webhook notifications.
- Configurable HTTP methods, headers, and expected responses.
- Authentication and user roles.
- Advanced response validation.
- Aggregated metrics and advanced analytics beyond the implemented recent response-time chart.
- Monitor-management UI/API and automatic intermittent-failure scenarios.
- Kubernetes deployment.
- Multi-tenant monitoring.

These are uncommitted future ideas, not implemented capabilities or a delivery schedule.

## 9. MVP Completion Criteria
The following criteria describe the implemented MVP:
- Configured HTTP endpoints are checked automatically on a schedule.
- Results are persisted and available through an API.
- A dashboard displays endpoint status and recent check history.
- Simulated failures and recoveries can be observed.
- Core functionality is covered by automated tests.
- The application can be started locally using documented Docker Compose commands.
- The repository includes setup instructions and a basic architecture overview.

## 10. Known Limitations

- One worker process; overlap protection is in memory, with no distributed locking
  or global concurrency limit. Restarting the worker resets its scheduling state.
- No automatic retention, pagination UI, uptime aggregation, alerts, or incident detection.
- On-demand checks use an environment-configured target and do not persist;
  scheduled checks use database monitors and populate history.
- Checks evaluate HTTP status and time to headers, not response bodies or custom assertions.
- Freshness uses the browser clock and configured interval; it does not independently
  prove worker liveness or endpoint failure.
- Compose is for local/private use, with a shared database owner account and no
  authentication or HTTPS configuration. Outstanding container findings remain;
  see [security maintenance](docs/security.md).
