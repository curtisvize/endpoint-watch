import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { MonitorRecord, CheckResultRecord } from '../src/database/records.js';
import type { MonitorReadRepository } from '../src/routes/monitors.js';

const monitor: MonitorRecord = {
  id: '9007199254740993', name: 'Service', url: 'https://user:secret@example.test?token=secret',
  interval_seconds: 60, enabled: false, created_at: new Date('2026-10-26T12:00:00Z'),
};
const dto = { id: monitor.id, name: 'Service', intervalSeconds: 60, enabled: false, createdAt: '2026-10-26T12:00:00.000Z' };
let server: Server;
let base: string;
let repo: { [K in keyof MonitorReadRepository]: ReturnType<typeof vi.fn<MonitorReadRepository[K]>> };

beforeEach(async () => {
  repo = {
    listMonitors: vi.fn<MonitorReadRepository['listMonitors']>().mockResolvedValue([monitor]),
    getMonitorById: vi.fn<MonitorReadRepository['getMonitorById']>().mockResolvedValue(monitor),
    getRecentResultsForMonitor: vi.fn<MonitorReadRepository['getRecentResultsForMonitor']>().mockResolvedValue([]),
  };
  server = createApp({ name: 'On demand', url: 'https://example.test', timeoutMs: 5000 }, undefined, repo)
    .listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  base = `http://127.0.0.1:${address.port}/api/monitors`;
});
afterEach(async () => {
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

it('lists configured monitors including disabled monitors without exposing target URLs', async () => {
  const response = await fetch(base);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(await response.json()).toEqual({ data: [dto] });
});
it('returns an empty list when no monitors are configured', async () => {
  repo.listMonitors.mockResolvedValue([]);
  expect(await (await fetch(base)).json()).toEqual({ data: [] });
});
it('retrieves one monitor without losing bigint precision', async () => {
  const response = await fetch(`${base}/${monitor.id}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: dto });
  expect(repo.getMonitorById).toHaveBeenCalledWith(monitor.id);
});
it.each(['', '/checks'])('returns 404 for a missing monitor at /:id%s', async (suffix) => {
  repo.getMonitorById.mockResolvedValue(null);
  const response = await fetch(`${base}/1${suffix}`);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'Monitor not found' });
  expect(repo.getRecentResultsForMonitor).not.toHaveBeenCalled();
});
it.each(['0', '-1', '1.2', 'abc', '01', '9223372036854775808', '9999999999999999999999'])('rejects invalid ID %s', async (id) => {
  for (const suffix of ['', '/checks']) {
    const response = await fetch(`${base}/${id}${suffix}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  }
  expect(repo.getMonitorById).not.toHaveBeenCalled();
});
it.each(['', '0', '-1', '1.5', '1001', '1e2', 'abc', 'Infinity', '2&limit=3', '2%20'])('rejects invalid limit %s', async (limit) => {
  const response = await fetch(`${base}/1/checks?limit=${limit}`);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Limit must be an integer between 1 and 1000' });
  expect(repo.getMonitorById).not.toHaveBeenCalled();
  expect(repo.getRecentResultsForMonitor).not.toHaveBeenCalled();
});
it.each([undefined, 1, 1000])('uses default/bounded limit %s and returns empty history', async (limit) => {
  const response = await fetch(`${base}/1/checks${limit === undefined ? '' : `?limit=${limit}`}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: [] });
  expect(repo.getRecentResultsForMonitor).toHaveBeenCalledWith('1', limit ?? 20);
});
it('serializes history while preserving repository timestamp and ID ordering', async () => {
  const row: CheckResultRecord = {
    id: '3', monitor_id: monitor.id, checked_at: new Date('2026-10-26T12:00:00Z'),
    outcome: 'timeout', status_code: null, response_time_ms: 5000, error_message: 'Request timed out',
  };
  repo.getRecentResultsForMonitor.mockResolvedValue([row, { ...row, id: '2', checked_at: new Date('2026-10-25T12:00:00Z') }]);
  const response = await fetch(`${base}/${monitor.id}/checks`);
  expect(await response.json()).toEqual({ data: [
    { id: '3', monitorId: monitor.id, checkedAt: '2026-10-26T12:00:00.000Z', outcome: 'timeout', statusCode: null, responseTimeMs: 5000, error: 'Request timed out' },
    { id: '2', monitorId: monitor.id, checkedAt: '2026-10-25T12:00:00.000Z', outcome: 'timeout', statusCode: null, responseTimeMs: 5000, error: 'Request timed out' },
  ] });
});
it.each(['list', 'detail', 'history', 'history-lookup'])('sanitizes unexpected %s failures', async (operation) => {
  const error = new Error('password=secret SQL details');
  if (operation === 'list') repo.listMonitors.mockRejectedValue(error);
  else if (operation === 'history') repo.getRecentResultsForMonitor.mockRejectedValue(error);
  else repo.getMonitorById.mockRejectedValue(error);
  const path = operation === 'list' ? '' : operation === 'detail' ? '/1' : '/1/checks';
  const response = await fetch(`${base}${path}`);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'Internal server error' });
});
