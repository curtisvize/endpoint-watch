# Endpoint Watch - Agent Instructions

## Project Overview
Endpoint Watch is a lightweight HTTP API monitoring application intended for SaaS technical support and engineering teams.

The application performs endpoint health checks, records response times and failures, and provides monitoring history for troubleshooting.

Before making architectural or implementation decisions, review:

- `SPEC.md` - Product requirements and milestone scope.
- `docs/architecture.md` - Technical architecture and component responsibilities.

These documents are the project's source of truth. If a requested change conflicts with them, explain the conflict before proceeding.

## Technology Stack
- **Language:** TypeScript  
- **Backend:** Node.js and Express  
- **Frontend:** React and Vite (later milestone)  
- **Database:** PostgreSQL using pg (later milestone)  
- **HTTP client:** Node.js built-in fetch  
- **Testing:** Vitest and Playwright  
- **Containerization:** Docker and Docker Compose  
- **CI:** GitHub Actions  

Do not introduce alternative frameworks, ORMs, or additional dependencies without explaining the reason and obtaining approval.

## Development Principles
1. Prefer simple, readable, maintainable solutions over unnecessary abstractions.
2. Follow the existing project structure and conventions.
3. Keep business logic separate from HTTP routing and infrastructure concerns.
4. Use TypeScript types explicitly where they improve clarity and correctness.
5. Avoid any unless there is a documented reason.
6. Handle expected errors explicitly and return consistent, structured results.
7. Do not expose secrets or sensitive configuration in logs or API responses.
8. Avoid premature optimization and unnecessary infrastructure complexity.

## Scope and Change Management
- Work only on the requested task.
- Follow the current implementation milestone defined in SPEC.md.
- Do not implement future milestone features unless explicitly requested.
- Do not refactor unrelated code.
- Do not introduce new dependencies without approval.
- Do not modify architecture or specification documents without discussing the changes.
- Ask for clarification when requirements are ambiguous or a decision would significantly affect the architecture.

Prefer small, reviewable changes over large implementations spanning multiple features.

## Testing Requirements
- Write automated tests for new business logic.
- Use Vitest for unit and integration tests.
- Prefer deterministic tests that do not depend on external services.
- Use dependency injection or mocks when testing HTTP requests.
- Cover successful responses, HTTP errors, timeouts, and connection failures where applicable.
- Add regression tests when fixing defects.
- Run relevant tests after making changes.

Do not remove, disable, or weaken existing tests merely to make a change pass.

## Code Quality
- Use consistent naming conventions.
- Keep functions focused on a single responsibility.
- Avoid duplicating business logic.
- Prefer straightforward control flow over clever or difficult-to-read implementations.
- Document non-obvious decisions, but avoid excessive comments explaining self-evident code.
- Preserve useful error information while avoiding exposure of sensitive details.

## Security
- Do not implement unrestricted requests to arbitrary user-provided URLs.
- Use explicitly configured or allowlisted monitoring targets.
- Apply request timeouts.
- Do not commit credentials, API keys, or .env files containing secrets.
- Do not introduce publicly accessible administrative functionality without approval.

## Agent Workflow
For each implementation task:

1. Review the relevant requirements and existing code.
2. Briefly describe the proposed approach before making substantial changes.
3. Identify any assumptions or architectural decisions requiring approval.
4. Implement the smallest change that satisfies the requirements.
5. Add or update relevant tests.
6. Run applicable tests and report the results.
7. Summarize the files changed and any remaining limitations.

Do not claim that tests have passed unless they were actually executed successfully.

## Human Review
The project owner is responsible for architectural decisions, reviewing changes, and approving new dependencies.

AI-generated code should remain understandable, maintainable, and explainable by the project owner.

When introducing an unfamiliar pattern or significant design decision, explain the tradeoffs rather than silently adopting it.