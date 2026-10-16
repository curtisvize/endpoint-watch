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
