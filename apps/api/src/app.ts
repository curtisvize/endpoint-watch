import express from 'express';
import { checkEndpoint, type MonitorTarget, type CheckResult } from './monitoring/check-endpoint.js';
import { monitorRoutes, type MonitorReadRepository } from './routes/monitors.js';

export function createApp(
  target: MonitorTarget,
  checker: (target: MonitorTarget) => Promise<CheckResult> = checkEndpoint,
  readRepository?: MonitorReadRepository,
) {
  const app = express();
  app.use('/api/monitors', monitorRoutes(readRepository));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.post('/api/checks/run', async (_request, response) => {
    try {
      const result = await checker(target);
      response.status(200).json(result);
    } catch {
      response.status(500).json({ error: 'Internal server error' });
    }
  });

  return app;
}
