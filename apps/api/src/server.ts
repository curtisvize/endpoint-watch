import { createApp } from './app.js';
import { loadMonitorTarget } from './config.js';
import { createDatabasePool } from './database/pool.js';
import { listMonitors, getMonitorById, getRecentResultsForMonitor } from './database/repository.js';

const port = 3000;
const host = process.env.HOST ?? '127.0.0.1';
const target = loadMonitorTarget();
const pool = createDatabasePool({ statement_timeout: 5000 });
const app = createApp(target, undefined, {
  listMonitors: () => listMonitors(pool),
  getMonitorById: (id) => getMonitorById(pool, id),
  getRecentResultsForMonitor: (id, limit) => getRecentResultsForMonitor(pool, id, limit),
});

const server = app.listen(port, host, () => {
  console.log(`Endpoint Watch API listening on http://${host}:${port}`);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    void pool.end().catch(() => {
      console.error('Unable to close PostgreSQL pool');
      process.exitCode = 1;
    });
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
