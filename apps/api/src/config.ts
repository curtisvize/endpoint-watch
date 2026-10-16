import type { MonitorTarget } from './monitoring/check-endpoint.js';

export function loadMonitorTarget(env: NodeJS.ProcessEnv = process.env): MonitorTarget {
  const name = env.MONITOR_NAME?.trim();
  if (!name) throw new Error('MONITOR_NAME is required');

  const url = env.MONITOR_URL?.trim();
  if (!url) throw new Error('MONITOR_URL is required');
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }
  } catch {
    throw new Error('MONITOR_URL must be a valid HTTP or HTTPS URL');
  }

  const timeoutMs = env.MONITOR_TIMEOUT_MS === undefined ? 5000 : Number(env.MONITOR_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new Error('MONITOR_TIMEOUT_MS must be an integer between 1 and 2147483647');
  }

  return { name, url, timeoutMs };
}
