import { createDatabasePool } from './database/pool.js';
import { insertCheckResult, listEnabledMonitors } from './database/repository.js';
import { checkEndpoint } from './monitoring/check-endpoint.js';
import { startMonitoringWorker } from './worker/scheduler.js';
import { installShutdownHandlers } from './worker/shutdown.js';

const timeoutMs = process.env.MONITOR_TIMEOUT_MS === undefined
  ? 5000 : Number(process.env.MONITOR_TIMEOUT_MS);
if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
  throw new Error('MONITOR_TIMEOUT_MS must be an integer between 1 and 2147483647');
}

// Bound SQL execution as well as pool acquisition during operation and shutdown.
const pool = createDatabasePool({ statement_timeout: 5000 });
const worker = startMonitoringWorker({
  listMonitors: () => listEnabledMonitors(pool),
  check: checkEndpoint,
  save: (result) => insertCheckResult(pool, result),
  reportError: (message) => console.error(message),
  timeoutMs,
});
installShutdownHandlers(worker, () => pool.end());
