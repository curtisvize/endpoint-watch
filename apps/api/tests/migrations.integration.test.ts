import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabasePool } from '../src/database/pool.js';

const connectionString = process.env.TEST_DATABASE_URL;
const migrationFile = fileURLToPath(new URL('../../../db/migrate.sql', import.meta.url));

describe.skipIf(!connectionString)('SQL migration execution against PostgreSQL', () => {
  let pool: Pool;
  let schema: string;
  beforeAll(() => { pool = createDatabasePool({ connectionString }); });
  beforeEach(async () => {
    schema = `migration_test_${randomUUID().replaceAll('-', '')}`;
    await pool.query(`CREATE SCHEMA ${schema}`);
  });
  afterEach(async () => { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); });
  afterAll(async () => { await pool?.end(); });

  function migrate(databaseUrl = connectionString!) {
    // Optional executable override allows use of a local Docker psql wrapper.
    const result = spawnSync(process.env.TEST_PSQL_BIN ?? 'psql', [
      '-X', '--dbname', databaseUrl, '-v', 'VERBOSITY=sqlstate', '-f', migrationFile,
    ], {
      env: { ...process.env, PGOPTIONS: `-c search_path=${schema},public` },
      encoding: 'utf8', timeout: 15000,
    });
    if (result.error) throw new Error('Unable to execute psql: check client installation and the 15-second timeout');
    // Never expose raw stderr or spawn arguments: either may contain connection credentials.
    const sqlState = result.stderr.match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/)?.[1];
    const diagnostic = `psql exit status: ${result.status ?? 'none'}; SQLSTATE: ${sqlState ?? 'unavailable'}`;
    return { status: result.status, sqlState, diagnostic };
  }

  it('creates the schema and index, records the version, and safely skips applied migrations', async () => {
    const initial = migrate();
    expect(initial.status, initial.diagnostic).toBe(0);
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO ${schema}.monitors (name, url) VALUES ('Preserved', 'https://example.test') RETURNING id`,
    );
    const repeated = migrate();
    expect(repeated.status, repeated.diagnostic).toBe(0);
    expect((await pool.query(`SELECT * FROM ${schema}.schema_migrations`)).rows).toHaveLength(1);
    expect((await pool.query(`SELECT id FROM ${schema}.monitors`)).rows).toEqual(inserted.rows);
    const index = await pool.query('SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = $2',
      [schema, 'check_results_recent_by_monitor']);
    expect(index.rows).toHaveLength(1);
    const columns = await pool.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns WHERE table_schema = $1
       AND column_name IN ('checked_at', 'created_at')`, [schema],
    );
    expect(columns.rows.map((row) => row.data_type)).toEqual(['timestamp with time zone', 'timestamp with time zone']);
  });

  it('rolls back created tables and migration tracking when a migration fails', async () => {
    // Force failure after monitors has been created, without changing migration files.
    await pool.query(`CREATE TABLE ${schema}.check_results (id integer)`);
    const failed = migrate();
    expect(failed.status, failed.diagnostic).toBe(3);
    expect(failed.sqlState, failed.diagnostic).toBe('42P07');
    const tables = await pool.query('SELECT tablename FROM pg_tables WHERE schemaname = $1', [schema]);
    expect(tables.rows).toEqual([{ tablename: 'check_results' }]);
  });

  it('distinguishes connection failures from SQL failures without exposing the connection URL', () => {
    const unavailable = new URL(connectionString!);
    unavailable.pathname = `/missing_${randomUUID().replaceAll('-', '')}`;
    const failed = migrate(unavailable.toString());
    expect(failed.status, failed.diagnostic).toBe(2);
    expect(failed.diagnostic).not.toContain(unavailable.toString());
    expect(failed.diagnostic).not.toContain(unavailable.pathname.slice(1));
    expect(failed.diagnostic).toMatch(/^psql exit status: 2; SQLSTATE: (unavailable|[0-9A-Z]{5})$/);
  });
});
