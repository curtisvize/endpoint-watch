import { Pool, type PoolConfig } from 'pg';

// Creation is explicit: importing this module does not open database connections.
export function createDatabasePool(config: PoolConfig = {}): Pool {
  const pool = new Pool({
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    ...config,
  });

  // Idle connection errors are emitted outside query promises. Avoid logging
  // raw errors, which can contain connection details or sensitive SQL values.
  pool.on('error', () => {
    console.error('An idle PostgreSQL connection failed');
  });

  return pool;
}
