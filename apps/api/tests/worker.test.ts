import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MonitorRecord } from '../src/database/records.js';
import type { CheckResult } from '../src/monitoring/check-endpoint.js';
import { startMonitoringWorker, type WorkerDependencies } from '../src/worker/scheduler.js';
import { installShutdownHandlers } from '../src/worker/shutdown.js';

const monitor = (id: string, interval_seconds = 2): MonitorRecord => ({
  id, name: `Service ${id}`, url: `https://service-${id}.test`, interval_seconds,
  enabled: true, created_at: new Date(0),
});
const result: CheckResult = {
  target: 'Service', status: 'healthy', statusCode: 200, responseTimeMs: 12.5,
  checkedAt: '2026-10-16T17:00:00Z', error: null,
};
function setup(monitors = [monitor('1')]) {
  return {
    listMonitors: vi.fn<WorkerDependencies['listMonitors']>().mockResolvedValue(monitors),
    check: vi.fn<WorkerDependencies['check']>().mockResolvedValue(result),
    save: vi.fn<WorkerDependencies['save']>().mockResolvedValue(undefined),
    reportError: vi.fn(), now: () => Date.now(),
  };
}
let worker: ReturnType<typeof startMonitoringWorker> | undefined;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(async () => { await worker?.stop(); worker = undefined; vi.useRealTimers(); });
const flush = () => vi.advanceTimersByTimeAsync(0);

it('checks immediately, persists the result mapping, and respects individual intervals', async () => {
  const deps = setup([monitor('1', 2), monitor('2', 3)]);
  worker = startMonitoringWorker(deps);
  await flush();
  expect(deps.check).toHaveBeenCalledTimes(2);
  expect(deps.check).toHaveBeenCalledWith({ name: 'Service 1', url: 'https://service-1.test', timeoutMs: 5000 });
  expect(deps.save).toHaveBeenCalledWith({
    monitor_id: '1', checked_at: new Date(result.checkedAt), outcome: 'healthy',
    status_code: 200, response_time_ms: 12.5, error_message: null,
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(deps.check).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(deps.check).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1000);
  expect(deps.check).toHaveBeenCalledTimes(4);
});

it('prevents overlap through persistence while other monitors continue', async () => {
  const deps = setup([monitor('1', 1), monitor('2', 1)]);
  let release!: () => void;
  deps.save.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
  worker = startMonitoringWorker(deps);
  await flush();
  await vi.advanceTimersByTimeAsync(3000);
  expect(deps.check.mock.calls.filter(([target]) => target.name === 'Service 1')).toHaveLength(1);
  expect(deps.check.mock.calls.filter(([target]) => target.name === 'Service 2')).toHaveLength(4);
  release();
  await vi.advanceTimersByTimeAsync(1000);
  expect(deps.check.mock.calls.filter(([target]) => target.name === 'Service 1')).toHaveLength(2);
});

it.each(['http_error', 'timeout', 'connection_error'] as const)('persists completed %s checks', async (status) => {
  const deps = setup();
  deps.check.mockResolvedValue({ ...result, status, statusCode: status === 'http_error' ? 503 : null,
    error: status === 'http_error' ? null : 'Sanitized failure' });
  worker = startMonitoringWorker(deps);
  await flush();
  expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ outcome: status }));
});

it('isolates thrown checks and insert failures and continues on later polls', async () => {
  const deps = setup([monitor('1', 1), monitor('2', 1), monitor('3', 1)]);
  deps.check.mockRejectedValueOnce(new Error('secret'));
  deps.save.mockRejectedValueOnce(new Error('secret SQL'));
  worker = startMonitoringWorker(deps);
  await flush();
  expect(deps.check).toHaveBeenCalledTimes(3);
  expect(deps.save).toHaveBeenCalledTimes(2);
  expect(deps.reportError).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(deps.check).toHaveBeenCalledTimes(6);
  expect(deps.save).toHaveBeenCalledTimes(5);
});

it('retries database reads and refreshes enabled monitors and intervals', async () => {
  const deps = setup();
  deps.listMonitors.mockRejectedValueOnce(new Error('database down'));
  worker = startMonitoringWorker(deps);
  await flush();
  expect(deps.check).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(deps.check).toHaveBeenCalledTimes(1);
  deps.listMonitors.mockResolvedValue([monitor('2', 1)]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(deps.check).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Service 2' }));
  deps.listMonitors.mockResolvedValue([monitor('2', 3)]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(deps.check).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(deps.check).toHaveBeenCalledTimes(3);
});

it('stops scheduling and waits for an active check and its insert', async () => {
  const deps = setup();
  let finishCheck!: (value: CheckResult) => void;
  let finishInsert!: () => void;
  deps.check.mockImplementation(() => new Promise((resolve) => { finishCheck = resolve; }));
  deps.save.mockImplementation(() => new Promise<void>((resolve) => { finishInsert = resolve; }));
  worker = startMonitoringWorker(deps);
  await flush();
  const stopped = vi.fn();
  const stopping = worker.stop().then(stopped);
  await vi.advanceTimersByTimeAsync(5000);
  expect(stopped).not.toHaveBeenCalled();
  finishCheck(result);
  await flush();
  expect(stopped).not.toHaveBeenCalled();
  finishInsert();
  await stopping;
  expect(deps.check).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('does not launch checks when shutdown occurs during a monitor refresh', async () => {
  const deps = setup();
  let finish!: (rows: MonitorRecord[]) => void;
  deps.listMonitors.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  worker = startMonitoringWorker(deps);
  const stopping = worker.stop();
  finish([monitor('1')]);
  await stopping;
  expect(deps.check).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['SIGINT', 'SIGTERM'])('handles %s once and closes the pool after draining', async (signal) => {
  const signals = new EventEmitter();
  let drain!: () => void;
  const stop = vi.fn(() => new Promise<void>((resolve) => { drain = resolve; }));
  const close = vi.fn().mockResolvedValue(undefined);
  const shutdown = installShutdownHandlers({ stop }, close, signals);
  signals.emit(signal);
  signals.emit(signal);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  drain();
  await shutdown();
  expect(close).toHaveBeenCalledTimes(1);
  expect(signals.listenerCount('SIGINT')).toBe(0);
  expect(signals.listenerCount('SIGTERM')).toBe(0);
});
