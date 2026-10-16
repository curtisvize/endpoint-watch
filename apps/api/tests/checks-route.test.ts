import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { loadMonitorTarget } from '../src/config.js';
import { checkEndpoint, type MonitorTarget } from '../src/monitoring/check-endpoint.js';

const target = loadMonitorTarget({ MONITOR_NAME: 'Configured Service', MONITOR_URL: 'https://configured.test' });
let server: Server | undefined;

afterEach(async () => {
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
});

async function start(checker: (target: MonitorTarget) => ReturnType<typeof checkEndpoint>) {
  server = createApp(target, checker).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return `http://127.0.0.1:${address.port}`;
}

it.each([200, 500])('returns HTTP 200 for a target responding with %i', async (statusCode) => {
  const client = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: statusCode }));
  const base = await start((configured) => checkEndpoint(configured, client));
  const response = await fetch(`${base}/api/checks/run`, { method: 'POST' });

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(await response.json()).toEqual({
    target: target.name,
    status: statusCode === 200 ? 'healthy' : 'http_error',
    statusCode,
    responseTimeMs: expect.any(Number),
    checkedAt: expect.any(String),
    error: null,
  });
});

it('returns HTTP 200 with a structured connection failure', async () => {
  const client = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('secret diagnostic'));
  const base = await start((configured) => checkEndpoint(configured, client));
  const response = await fetch(`${base}/api/checks/run`, { method: 'POST' });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'connection_error', statusCode: null, error: 'Unable to connect to target' });
});

it('returns HTTP 200 for a timed-out check', async () => {
  const client = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  const base = await start((configured) => checkEndpoint({ ...configured, timeoutMs: 5 }, client));
  const response = await fetch(`${base}/api/checks/run`, { method: 'POST' });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'timeout', statusCode: null, error: 'Request timed out' });
});

it('uses only the configured target despite body and query URLs', async () => {
  const client = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
  const base = await start((configured) => checkEndpoint(configured, client));
  const response = await fetch(`${base}/api/checks/run?url=https://untrusted.test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://untrusted.test' }),
  });
  expect(response.status).toBe(200);
  await response.json();
  expect(client).toHaveBeenCalledTimes(1);
  expect(client.mock.calls[0][0]).toBe(target.url);
});

it('returns a generic JSON error for unexpected application failures', async () => {
  const base = await start(async () => { throw new Error('secret diagnostic'); });
  const response = await fetch(`${base}/api/checks/run`, { method: 'POST' });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'Internal server error' });
});

it('does not expose POST /api/checks', async () => {
  const checker = vi.fn<typeof checkEndpoint>();
  const base = await start(checker);
  const response = await fetch(`${base}/api/checks`, { method: 'POST' });
  expect(response.status).toBe(404);
  await response.text();
  expect(checker).not.toHaveBeenCalled();
});
