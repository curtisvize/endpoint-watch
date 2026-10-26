import type { Pool } from 'pg';
import type { MonitorRecord, CheckResultRecord, NewCheckResult } from './records.js';

// PoolClient also satisfies this interface, allowing transactional callers.
export type Database = Pick<Pool, 'query'>;

const monitorColumns = 'id, name, url, interval_seconds, enabled, created_at';
const resultColumns = 'id, monitor_id, checked_at, outcome, status_code, response_time_ms, error_message';

export async function listMonitors(db: Database): Promise<MonitorRecord[]> {
  const result = await db.query<MonitorRecord>(`SELECT ${monitorColumns} FROM monitors ORDER BY id`);
  return result.rows;
}

export async function listEnabledMonitors(db: Database): Promise<MonitorRecord[]> {
  const result = await db.query<MonitorRecord>(
    `SELECT ${monitorColumns} FROM monitors WHERE enabled = true ORDER BY id`,
  );
  return result.rows;
}

export async function getMonitorById(db: Database, id: string): Promise<MonitorRecord | null> {
  const result = await db.query<MonitorRecord>(
    `SELECT ${monitorColumns} FROM monitors WHERE id = $1`, [id],
  );
  return result.rows[0] ?? null;
}

export async function insertCheckResult(db: Database, input: NewCheckResult): Promise<CheckResultRecord> {
  const result = await db.query<CheckResultRecord>(
    `INSERT INTO check_results
      (monitor_id, checked_at, outcome, status_code, response_time_ms, error_message)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${resultColumns}`,
    [input.monitor_id, input.checked_at, input.outcome, input.status_code, input.response_time_ms, input.error_message],
  );
  return result.rows[0];
}

export async function getRecentResultsForMonitor(
  db: Database,
  monitorId: string,
  limit = 20,
): Promise<CheckResultRecord[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError('Recent-results limit must be an integer between 1 and 1000');
  }
  const result = await db.query<CheckResultRecord>(
    `SELECT ${resultColumns} FROM check_results
     WHERE monitor_id = $1 ORDER BY checked_at DESC, id DESC LIMIT $2`,
    [monitorId, limit],
  );
  return result.rows;
}
