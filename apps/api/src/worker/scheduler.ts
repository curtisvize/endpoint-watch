import type { MonitorRecord, NewCheckResult } from '../database/records.js';
import type { CheckResult, MonitorTarget } from '../monitoring/check-endpoint.js';

export interface WorkerDependencies {
  listMonitors: () => Promise<MonitorRecord[]>;
  check: (target: MonitorTarget) => Promise<CheckResult>;
  save: (result: NewCheckResult) => Promise<unknown>;
  reportError: (message: string) => void;
  now?: () => number;
  timeoutMs?: number;
}

export function startMonitoringWorker(deps: WorkerDependencies) {
  const now = deps.now ?? (() => performance.now());
  const lastStarted = new Map<string, number>();
  const active = new Map<string, Promise<void>>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let polling: Promise<void>;
  let stopping: Promise<void> | undefined;

  async function run(monitor: MonitorRecord): Promise<void> {
    try {
      const result = await deps.check({
        name: monitor.name, url: monitor.url, timeoutMs: deps.timeoutMs ?? 5000,
      });
      await deps.save({
        monitor_id: monitor.id,
        checked_at: new Date(result.checkedAt),
        outcome: result.status,
        status_code: result.statusCode,
        response_time_ms: result.responseTimeMs,
        error_message: result.error,
      });
    } catch {
      deps.reportError('A monitor check or result insert failed');
    } finally {
      active.delete(monitor.id);
    }
  }

  async function poll(): Promise<void> {
    try {
      const monitors = await deps.listMonitors();
      if (stopped) return;
      const enabledIds = new Set(monitors.map((monitor) => monitor.id));
      for (const id of lastStarted.keys()) {
        if (!enabledIds.has(id) && !active.has(id)) lastStarted.delete(id);
      }
      for (const monitor of monitors) {
        const previous = lastStarted.get(monitor.id);
        if (active.has(monitor.id) ||
          (previous !== undefined && now() - previous < monitor.interval_seconds * 1000)) continue;
        lastStarted.set(monitor.id, now());
        // Defer execution so the in-flight entry exists even if a dependency throws synchronously.
        active.set(monitor.id, Promise.resolve().then(() => run(monitor)));
      }
    } catch {
      deps.reportError('Unable to load enabled monitors; will retry');
    } finally {
      if (!stopped) {
        timer = setTimeout(() => { polling = poll(); }, 1000);
      }
    }
  }

  polling = poll();
  return {
    stop(): Promise<void> {
      if (!stopping) {
        stopped = true;
        clearTimeout(timer);
        stopping = (async () => {
          await polling;
          await Promise.all(active.values());
        })();
      }
      return stopping;
    },
  };
}
