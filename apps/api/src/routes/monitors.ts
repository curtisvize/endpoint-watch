import { Router } from 'express';
import type { MonitorRecord, CheckResultRecord } from '../database/records.js';

export interface MonitorReadRepository {
  listMonitors(): Promise<MonitorRecord[]>;
  getMonitorById(id: string): Promise<MonitorRecord | null>;
  getRecentResultsForMonitor(id: string, limit: number): Promise<CheckResultRecord[]>;
}

function validId(id: string): boolean {
  return /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
}

function monitorResponse(row: MonitorRecord) {
  return {
    id: row.id, name: row.name, intervalSeconds: row.interval_seconds,
    enabled: row.enabled, createdAt: row.created_at.toISOString(),
  };
}

export function monitorRoutes(repository?: MonitorReadRepository): Router {
  const router = Router();
  function reads(): MonitorReadRepository {
    if (!repository) throw new Error('Monitor repository is not configured');
    return repository;
  }

  router.get('/', async (_request, response) => {
    try {
      response.json({ data: (await reads().listMonitors()).map(monitorResponse) });
    } catch {
      response.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/:id', async (request, response) => {
    const id = request.params.id;
    if (!validId(id)) {
      response.status(400).json({ error: 'Monitor ID must be a positive PostgreSQL bigint' });
      return;
    }
    try {
      const monitor = await reads().getMonitorById(id);
      if (!monitor) {
        response.status(404).json({ error: 'Monitor not found' });
        return;
      }
      response.json({ data: monitorResponse(monitor) });
    } catch {
      response.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/:id/checks', async (request, response) => {
    const id = request.params.id;
    if (!validId(id)) {
      response.status(400).json({ error: 'Monitor ID must be a positive PostgreSQL bigint' });
      return;
    }
    const rawLimit = request.query.limit;
    const limit = rawLimit === undefined ? 20 :
      typeof rawLimit === 'string' && /^[1-9]\d{0,3}$/.test(rawLimit) ? Number(rawLimit) : NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      response.status(400).json({ error: 'Limit must be an integer between 1 and 1000' });
      return;
    }
    try {
      if (!await reads().getMonitorById(id)) {
        response.status(404).json({ error: 'Monitor not found' });
        return;
      }
      const rows = await reads().getRecentResultsForMonitor(id, limit);
      response.json({ data: rows.map((row) => ({
        id: row.id, monitorId: row.monitor_id, checkedAt: row.checked_at.toISOString(),
        outcome: row.outcome, statusCode: row.status_code,
        responseTimeMs: row.response_time_ms, error: row.error_message,
      })) });
    } catch {
      response.status(500).json({ error: 'Internal server error' });
    }
  });
  return router;
}
