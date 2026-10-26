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

  function migrate() {
    // Optional executable override allows use of a local Docker psql wrapper.
    const result = spawnSync(process.env.TEST_PSQL_BIN ?? 'psql', ['-X', '-f', migrationFile], {
      env: { ...process.env, PGDATABASE: connectionString, PGOPTIONS: `-c search_path=${schema},public` },
      encoding: 'utf8', timeout: 15000,
    });
    if (result.error) throw new Error('Cannot run psql; install the PostgreSQL client or set TEST_PSQL_BIN');
    return result;
  }

  it('creates the schema and index, records the version, and safely skips applied migrations', async () => {
    expect(migrate().status).toBe(0);
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO ${schema}.monitors (name, url) VALUES ('Preserved', 'https://example.test') RETURNING id`,
    );
    expect(migrate().status).toBe(0);
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
    expect(migrate().status).not.toBe(0);
    const tables = await pool.query('SELECT tablename FROM pg_tables WHERE schemaname = $1', [schema]);
    expect(tables.rows).toEqual([{ tablename: 'check_results' }]);
  });
});
