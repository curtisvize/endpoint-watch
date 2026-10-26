import type { Pool, PoolClient } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabasePool } from '../src/database/pool.js';
import { getMonitorById, getRecentResultsForMonitor, insertCheckResult, listEnabledMonitors, listMonitors } from '../src/database/repository.js';
import type { MonitorRecord, NewCheckResult } from '../src/database/records.js';

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(!connectionString)('PostgreSQL repositories (requires migrated TEST_DATABASE_URL)', () => {
  let pool: Pool;
  let client: PoolClient;
  let first: MonitorRecord;
  let second: MonitorRecord;

  beforeAll(() => {
    pool = createDatabasePool({ connectionString, max: 1 });
  });

  beforeEach(async () => {
    client = await pool.connect();
    await client.query('BEGIN');
    // Lock out concurrent writes for deterministic enabled-monitor assertions.
    await client.query('LOCK TABLE monitors, check_results IN EXCLUSIVE MODE');
    await client.query('UPDATE monitors SET enabled = false');
    const seeded = await client.query<MonitorRecord>(
      `INSERT INTO monitors (name, url, enabled) VALUES
       ($1, $2, true), ($3, $4, false) RETURNING *`,
      ["Service 'quoted'", 'https://one.test', 'Disabled Service', 'https://two.test'],
    );
    [first, second] = seeded.rows;
  });

  afterEach(async () => {
    if (client) {
      try { await client.query('ROLLBACK'); } finally { client.release(); }
    }
  });
  afterAll(async () => { await pool?.end(); });

  function input(overrides: Partial<NewCheckResult> = {}): NewCheckResult {
    return {
      monitor_id: first.id,
      checked_at: new Date('2026-10-16T17:00:00Z'),
      outcome: 'healthy', status_code: 200, response_time_ms: 12.5, error_message: null,
      ...overrides,
    };
  }

  it('lists enabled monitors and retrieves either enabled or disabled monitors by ID', async () => {
    expect(await listEnabledMonitors(client)).toEqual([first]);
    expect(await listMonitors(client)).toEqual(expect.arrayContaining([first, second]));
    expect(await getMonitorById(client, second.id)).toEqual(second);
    expect(typeof first.id).toBe('string');
    expect(first.created_at).toBeInstanceOf(Date);
    expect(await getMonitorById(client, '-1')).toBeNull();
    expect(await getRecentResultsForMonitor(client, '-1')).toEqual([]);
  });

  it('round-trips all four outcomes, fractional durations, nulls, and quoted diagnostics', async () => {
    const cases: NewCheckResult[] = [
      input(),
      input({ outcome: 'http_error', status_code: 503 }),
      input({ outcome: 'timeout', status_code: null, error_message: 'Request timed out' }),
      input({ outcome: 'connection_error', status_code: null, error_message: "Can't connect; 'quoted' diagnostic" }),
    ];
    for (const value of cases) {
      const saved = await insertCheckResult(client, value);
      expect(saved).toEqual({ ...value, id: expect.any(String) });
      expect(saved.checked_at).toBeInstanceOf(Date);
    }
    expect(await getRecentResultsForMonitor(client, first.id)).toHaveLength(4);
  });

  it('filters by monitor, sorts newest first with ID ties, and applies limits', async () => {
    const older = await insertCheckResult(client, input({ checked_at: new Date('2026-10-15T17:00:00Z') }));
    const newer = await insertCheckResult(client, input());
    const tied = await insertCheckResult(client, input());
    await insertCheckResult(client, input({ monitor_id: second.id }));
    expect((await getRecentResultsForMonitor(client, first.id)).map((row) => row.id))
      .toEqual([tied.id, newer.id, older.id]);
    expect(await getRecentResultsForMonitor(client, first.id, 1)).toEqual([tied]);
  });

  it('parameterizes monitor IDs rather than interpreting SQL fragments', async () => {
    await expect(getMonitorById(client, '1 OR 1=1')).rejects.toMatchObject({ code: '22P02' });
  });

  it('propagates foreign-key failures to the caller', async () => {
    await expect(insertCheckResult(client, input({ monitor_id: '-1' })))
      .rejects.toMatchObject({ code: '23503' });
  });

  it('propagates outcome constraint failures to the caller', async () => {
    await expect(insertCheckResult(client, input({ status_code: 500 })))
      .rejects.toMatchObject({ code: '23514' });
  });
});
