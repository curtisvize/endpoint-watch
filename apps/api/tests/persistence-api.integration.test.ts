import { once } from 'node:events';
import type { Server } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import type { Pool, PoolClient } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMockApp } from '../src/mock/app.js';
import { createDatabasePool } from '../src/database/pool.js';
import { getMonitorById, getRecentResultsForMonitor, insertCheckResult, listEnabledMonitors, listMonitors } from '../src/database/repository.js';
import { checkEndpoint } from '../src/monitoring/check-endpoint.js';
import { startMonitoringWorker } from '../src/worker/scheduler.js';
import type { MonitorRecord } from '../src/database/records.js';

const connectionString = process.env.TEST_DATABASE_URL;
describe.skipIf(!connectionString)('Worker persistence and API with PostgreSQL', () => {
  let pool: Pool;
  let client: PoolClient | undefined;
  let api: Server | undefined;
  let mock: Server | undefined;
  let worker: ReturnType<typeof startMonitoringWorker> | undefined;
  let releaseDelay: (() => void) | undefined;
  let mockUrl: string;
  let apiUrl: string;

  beforeAll(() => { pool = createDatabasePool({ connectionString, max: 1 }); });
  beforeEach(async () => {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('LOCK TABLE monitors, check_results IN EXCLUSIVE MODE');
    await client.query('UPDATE monitors SET enabled = false');
    mock = createMockApp(6000, () => new Promise<void>((resolve) => { releaseDelay = resolve; }))
      .listen(0, '127.0.0.1');
    await once(mock, 'listening');
    mockUrl = url(mock);
    const db = client;
    api = createApp({ name: 'Local mock', url: `${mockUrl}/health`, timeoutMs: 500 }, undefined, {
      listMonitors: () => listMonitors(db),
      getMonitorById: (id) => getMonitorById(db, id),
      getRecentResultsForMonitor: (id, limit) => getRecentResultsForMonitor(db, id, limit),
    }).listen(0, '127.0.0.1');
    await once(api, 'listening');
    apiUrl = url(api);
  });
  afterEach(async () => {
    await worker?.stop(); worker = undefined;
    releaseDelay?.(); releaseDelay = undefined;
    await close(api); api = undefined;
    await close(mock); mock = undefined;
    if (client) {
      try { await client.query('ROLLBACK'); } finally { client.release(); client = undefined; }
    }
  });
  afterAll(async () => { await pool?.end(); });

  function url(server: Server): string {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    return `http://127.0.0.1:${address.port}`;
  }
  async function close(server: Server | undefined) {
    if (!server?.listening) return;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  it.each([
    ['/health', 'healthy', 200, null],
    ['/error', 'http_error', 500, null],
    ['/delay', 'timeout', null, 'Request timed out'],
  ] as const)('persists worker results for %s and returns them through real repository-backed routes', async (path, outcome, statusCode, error) => {
    const db = client!;
    const seeded = await db.query<MonitorRecord>(
      'INSERT INTO monitors (name, url, interval_seconds) VALUES ($1, $2, $3) RETURNING *',
      ['Integration monitor', `${mockUrl}${path}`, 60],
    );
    const monitor = seeded.rows[0];
    let saved!: () => void;
    let failed!: (error: Error) => void;
    const finished = new Promise<void>((resolve, reject) => { saved = resolve; failed = reject; });
    worker = startMonitoringWorker({
      listMonitors: () => listEnabledMonitors(db), check: checkEndpoint,
      timeoutMs: path === '/delay' ? 50 : 1000,
      save: async (input) => { await insertCheckResult(db, input); saved(); },
      reportError: () => failed(new Error('Worker failed during integration test')),
    });
    await finished;
    await worker.stop();
    const list = await fetch(`${apiUrl}/api/monitors`);
    expect(list.status).toBe(200);
    expect((await list.json()).data).toContainEqual(expect.objectContaining({ id: monitor.id }));
    const detail = await fetch(`${apiUrl}/api/monitors/${monitor.id}`);
    expect(detail.status).toBe(200);
    expect((await detail.json()).data.id).toBe(monitor.id);
    const response = await fetch(`${apiUrl}/api/monitors/${monitor.id}/checks?limit=1`);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([expect.objectContaining({
      monitorId: monitor.id, outcome, statusCode, error,
      id: expect.any(String), checkedAt: expect.any(String), responseTimeMs: expect.any(Number),
    })]);
    const before = await db.query('SELECT count(*) FROM check_results');
    const onDemand = await fetch(`${apiUrl}/api/checks/run`, { method: 'POST' });
    expect(onDemand.status).toBe(200);
    expect((await onDemand.json()).status).toBe('healthy');
    expect((await db.query('SELECT count(*) FROM check_results')).rows).toEqual(before.rows);
  });

  it('returns generic API errors for unavailable PostgreSQL connections while health remains available', async () => {
    // Occupy an ephemeral port and reject connections, avoiding assumptions about unused ports.
    const unavailable = createTcpServer((socket) => socket.destroy()).listen(0, '127.0.0.1');
    await once(unavailable, 'listening');
    const address = unavailable.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const badPool = createDatabasePool({ host: '127.0.0.1', port: address.port,
      user: 'test', database: 'test', connectionTimeoutMillis: 500 });
    let failingApi: Server | undefined;
    try {
      failingApi = createApp({ name: 'Local', url: `${mockUrl}/health`, timeoutMs: 500 }, undefined, {
        listMonitors: () => listMonitors(badPool),
        getMonitorById: (id) => getMonitorById(badPool, id),
        getRecentResultsForMonitor: (id, limit) => getRecentResultsForMonitor(badPool, id, limit),
      }).listen(0, '127.0.0.1');
      await once(failingApi, 'listening');
      for (const path of ['/api/monitors', '/api/monitors/1', '/api/monitors/1/checks']) {
        const response = await fetch(url(failingApi) + path);
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Internal server error' });
      }
      const health = await fetch(url(failingApi) + '/health');
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: 'ok' });
    } finally {
      await close(failingApi);
      await badPool.end();
      await new Promise<void>((resolve, reject) => unavailable.close((error) => error ? reject(error) : resolve()));
    }
  });
});
