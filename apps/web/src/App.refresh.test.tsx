import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { API_REQUEST_TIMEOUT_MS } from './api/monitors';
const monitor = { id: '1', name: 'Billing API', intervalSeconds: 60, enabled: true, createdAt: '2026-11-04T12:00:00Z' };
const row = { id: '1', monitorId: '1', outcome: 'healthy', statusCode: 200, responseTimeMs: 12.5, error: null, checkedAt: monitor.createdAt };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(monitor.createdAt)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
it('preserves selected history and old results through outage and recovers automatically', async () => {
  let offline = false;
  const client = vi.fn().mockImplementation(async (path: string) => {
    if (offline) throw new TypeError('offline');
    return Response.json({ data: path === '/api/monitors' ? [monitor] : [row] });
  });
  vi.stubGlobal('fetch', client);
  render(<App />);
  await flush();
  fireEvent.click(screen.getByRole('button', { name: 'View history for Billing API' }));
  await flush();
  const panel = screen.getByRole('region', { name: 'Billing API — recent history' });
  expect(within(panel).getByRole('table')).toBeTruthy();
  offline = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(within(panel).getByRole('table')).toBeTruthy();
  expect(screen.getByText('Latest check refresh failed. This result may be stale.')).toBeTruthy();
  expect(screen.getByText(/Monitor list refresh failed/)).toBeTruthy();
  offline = false;
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(screen.getByRole('region', { name: 'Billing API — recent history' })).toBe(panel);
  expect(screen.queryByText(/Monitor list refresh failed/)).toBeNull();
  expect(screen.queryByText('Latest check refresh failed. This result may be stale.')).toBeNull();
  expect(client.mock.calls.filter(([path]) => path === '/api/monitors')).toHaveLength(3);
});
it('manual refresh updates all sections without closing the selected panel', async () => {
  const client = vi.fn().mockImplementation(async (path: string) => Response.json({ data: path === '/api/monitors' ? [monitor] : [row] }));
  vi.stubGlobal('fetch', client);
  render(<App />);
  await flush();
  fireEvent.click(screen.getByRole('button', { name: 'View history for Billing API' }));
  await flush();
  client.mockClear();
  fireEvent.click(screen.getByRole('button', { name: /^Refresh$/ }));
  await flush();
  expect(client.mock.calls.map(([path]) => path).sort()).toEqual([
    '/api/monitors', '/api/monitors/1/checks?limit=1', '/api/monitors/1/checks?limit=20',
  ]);
  expect(screen.getByRole('region', { name: 'Billing API — recent history' })).toBeTruthy();
});

it('recovers from an initially stalled request without overlapping manual refreshes', async () => {
  let finish!: (value: Response) => void;
  const client = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
    .mockImplementation(async (path: string) => Response.json({ data: path === '/api/monitors' ? [monitor] : [row] }));
  vi.stubGlobal('fetch', client);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /^Refresh$/ }));
  expect(client).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS); });
  expect(screen.getByRole('alert').textContent).toContain('Unable to load monitors');
  expect((screen.getByRole('button', { name: /^Refresh$/ }) as HTMLButtonElement).disabled).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(screen.getByRole('article', { name: 'Billing API' })).toBeTruthy();
  // An obsolete request completing after recovery must not replace current data.
  await act(async () => { finish(Response.json({ data: [] })); });
  expect(screen.getByRole('article', { name: 'Billing API' })).toBeTruthy();
});

it('retains overview and selected history through stalled refreshes, then retries successfully', async () => {
  let stalled = false;
  const signals: AbortSignal[] = [];
  const client = vi.fn().mockImplementation((path: string, options: RequestInit) => {
    if (stalled) {
      signals.push(options.signal!);
      return new Promise(() => {});
    }
    return Promise.resolve(Response.json({ data: path === '/api/monitors' ? [monitor] : [row] }));
  });
  vi.stubGlobal('fetch', client);
  const { unmount } = render(<App />);
  await flush();
  fireEvent.click(screen.getByRole('button', { name: 'View history for Billing API' }));
  await flush();
  const panel = screen.getByRole('region', { name: 'Billing API — recent history' });
  stalled = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(screen.getByText(/Refreshing monitor list/)).toBeTruthy();
  expect(within(panel).getByRole('table')).toBeTruthy();
  const pendingCount = client.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS - 1); });
  expect(client).toHaveBeenCalledTimes(pendingCount);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(signals).toHaveLength(3);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(screen.getByText(/Monitor list refresh failed. Displayed data may be stale/)).toBeTruthy();
  expect(screen.getByText(/History refresh failed. Displayed data may be stale/)).toBeTruthy();
  expect(screen.getByText('Latest check refresh failed. This result may be stale.')).toBeTruthy();
  expect(within(panel).getByRole('table')).toBeTruthy();
  stalled = false;
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(screen.queryByText(/Monitor list refresh failed/)).toBeNull();
  expect(screen.queryByText(/History refresh failed/)).toBeNull();
  expect(screen.getByRole('region', { name: 'Billing API — recent history' })).toBe(panel);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
