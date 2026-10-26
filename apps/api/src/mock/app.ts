import express from 'express';
import { setTimeout as wait } from 'node:timers/promises';

export function createMockApp(delayMs: number, delay: (ms: number) => Promise<unknown> = wait) {
  const app = express();
  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  app.get('/error', (_request, response) => {
    response.status(500).json({ error: 'Simulated HTTP failure' });
  });
  app.get('/delay', async (_request, response) => {
    await delay(delayMs);
    response.json({ status: 'ok' });
  });
  return app;
}
