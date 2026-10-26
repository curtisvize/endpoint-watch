import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createMockApp } from '../src/mock/app.js';

let server: Server | undefined;
afterEach(async () => {
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  }
});

it('provides fixed healthy, HTTP-error, and delayed scenarios without target controls', async () => {
  const delay = vi.fn().mockResolvedValue(undefined);
  server = createMockApp(6000, delay).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  const base = `http://127.0.0.1:${address.port}`;
  const healthy = await fetch(`${base}/health`);
  expect(healthy.status).toBe(200);
  expect(await healthy.json()).toEqual({ status: 'ok' });
  const error = await fetch(`${base}/error`);
  expect(error.status).toBe(500);
  expect(await error.json()).toEqual({ error: 'Simulated HTTP failure' });
  const delayed = await fetch(`${base}/delay`);
  expect(delayed.status).toBe(200);
  expect(await delayed.json()).toEqual({ status: 'ok' });
  expect(delay).toHaveBeenCalledExactlyOnceWith(6000);
  const missing = await fetch(`${base}/configure`, { method: 'POST' });
  expect(missing.status).toBe(404);
  await missing.text();
});
