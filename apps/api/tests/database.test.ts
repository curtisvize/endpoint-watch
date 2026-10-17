import { expect, it, vi } from 'vitest';
import { createDatabasePool } from '../src/database/pool.js';
import { getRecentResultsForMonitor, type Database } from '../src/database/repository.js';

it('creates a lazy pool with bounded defaults and configurable overrides', async () => {
  const pool = createDatabasePool({ host: 'localhost', port: 5433, database: 'test', max: 2 });
  try {
    expect(pool.totalCount).toBe(0);
    expect(pool.options).toMatchObject({
      host: 'localhost', port: 5433, database: 'test', max: 2,
      connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    });
  } finally {
    await pool.end();
  }
});

it('handles idle connection errors without logging their sensitive details', async () => {
  const pool = createDatabasePool();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    pool.emit('error', new Error('secret connection details'));
    expect(log).toHaveBeenCalledExactlyOnceWith('An idle PostgreSQL connection failed');
  } finally {
    log.mockRestore();
    await pool.end();
  }
});

it.each([0, -1, 1.5, 1001, NaN, Infinity])('rejects invalid history limit %s before querying', async (limit) => {
  const db: Database = { query: vi.fn() };
  await expect(getRecentResultsForMonitor(db, '1', limit)).rejects.toThrow(RangeError);
  expect(db.query).not.toHaveBeenCalled();
});
