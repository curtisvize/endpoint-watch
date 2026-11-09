import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, ApiTimeoutError, API_REQUEST_TIMEOUT_MS, getMonitor, getRecentChecks, listMonitors } from './monitors';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const monitor = { id: '9007199254740993', name: 'Service', intervalSeconds: 60, enabled: true, createdAt: '2026-11-04T12:00:00Z' };
it('lists monitors using a relative URL and forwards cancellation', async () => {
  const client = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [monitor] }));
  vi.stubGlobal('fetch', client);
  const controller = new AbortController();
  expect(await listMonitors(controller.signal)).toEqual([monitor]);
  expect(client).toHaveBeenCalledWith('/api/monitors', { method: 'GET', signal: expect.any(AbortSignal) });
});

it.each(['headers', 'body'])('bounds stalled %s even when cancellation is ignored', async (stage) => {
  vi.useFakeTimers();
  let requestSignal!: AbortSignal;
  vi.stubGlobal('fetch', vi.fn().mockImplementation((_path, options: RequestInit) => {
    requestSignal = options.signal!;
    if (stage === 'headers') return new Promise(() => {});
    const response = Response.json({ data: [] });
    vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}));
    return Promise.resolve(response);
  }));
  const request = listMonitors();
  const rejected = expect(request).rejects.toBeInstanceOf(ApiTimeoutError);
  await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);
  await rejected;
  expect(requestSignal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('forwards caller cancellation without reporting a timeout and removes listeners', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  let requestSignal!: AbortSignal;
  vi.stubGlobal('fetch', vi.fn().mockImplementation((_path, options: RequestInit) => {
    requestSignal = options.signal!;
    return new Promise(() => {});
  }));
  const request = listMonitors(controller.signal);
  const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await rejected;
  expect(requestSignal.aborted).toBe(true);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});

it('does not fetch when already cancelled, and clears deadlines after success', async () => {
  vi.useFakeTimers();
  const client = vi.fn().mockResolvedValue(Response.json({ data: [] }));
  vi.stubGlobal('fetch', client);
  const controller = new AbortController();
  controller.abort();
  await expect(listMonitors(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(client).not.toHaveBeenCalled();
  expect(await listMonitors()).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});
it('retrieves one monitor and encodes IDs', async () => {
  const client = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ data: monitor }));
  vi.stubGlobal('fetch', client);
  expect(await getMonitor(monitor.id)).toEqual(monitor);
  await getMonitor('1/path?query');
  expect(client).toHaveBeenLastCalledWith('/api/monitors/1%2Fpath%3Fquery', expect.any(Object));
});
it('retrieves history with default and explicit limits, preserving nulls', async () => {
  const rows = [{ id: '1', monitorId: '2', checkedAt: monitor.createdAt, outcome: 'timeout', statusCode: null, responseTimeMs: 5000, error: 'Request timed out' }];
  const client = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ data: rows }));
  vi.stubGlobal('fetch', client);
  expect(await getRecentChecks('2')).toEqual(rows);
  expect(client).toHaveBeenLastCalledWith('/api/monitors/2/checks?limit=20', expect.any(Object));
  await getRecentChecks('2', 1000);
  expect(client).toHaveBeenLastCalledWith('/api/monitors/2/checks?limit=1000', expect.any(Object));
});
it.each([0, -1, 1.5, 1001, NaN])('rejects invalid limit %s without fetching', async (limit) => {
  const client = vi.fn(); vi.stubGlobal('fetch', client);
  await expect(getRecentChecks('1', limit)).rejects.toThrow(RangeError);
  expect(client).not.toHaveBeenCalled();
});
it.each([400, 404, 500])('reports HTTP %s without exposing response details', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'private diagnostic' }, { status })));
  await expect(getMonitor('1')).rejects.toMatchObject({ status, message: `Monitoring API request failed (HTTP ${status}).` });
});
it('reports network failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('private details')));
  await expect(listMonitors()).rejects.toThrow('Unable to reach the monitoring API.');
});
it.each(['not JSON', '{}'])('reports invalid envelope %s', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
  await expect(listMonitors()).rejects.toBeInstanceOf(ApiError);
});
