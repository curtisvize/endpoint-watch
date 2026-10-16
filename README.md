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
