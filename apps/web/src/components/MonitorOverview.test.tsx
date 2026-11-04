import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MonitorOverview } from './MonitorOverview';
import type { Monitor, CheckHistoryEntry } from '../api/monitors';

const monitor = (id: string, enabled = true): Monitor => ({ id, name: `Service ${id}`, enabled, intervalSeconds: 60, createdAt: '2026-11-04T12:00:00Z' });
const check = (outcome: CheckHistoryEntry['outcome']): CheckHistoryEntry => ({ id: '10', monitorId: '1', outcome, checkedAt: '2026-11-04T12:00:00Z', responseTimeMs: 12.5, statusCode: outcome === 'healthy' ? 200 : null, error: null });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function summaryCount(label: string): string | null {
  const region = screen.getByRole('region', { name: 'Monitoring summary' });
  return within(region).getByText(label, { selector: 'dt' }).nextElementSibling!.textContent;
}
it.each([
  ['healthy', 'Healthy'], ['http_error', 'HTTP error'], ['timeout', 'Timeout'], ['connection_error', 'Connection error'],
] as const)('shows %s with response time and timestamp', async (outcome, label) => {
  const client = vi.fn().mockResolvedValue(Response.json({ data: [check(outcome)] }));
  vi.stubGlobal('fetch', client);
  render(<MonitorOverview monitors={[monitor('1')]} />);
  const card = screen.getByRole('article', { name: 'Service 1' });
  expect(await within(card).findByText(label)).toBeTruthy();
  expect(within(card).getByText('Enabled')).toBeTruthy();
  expect(within(card).getByText('12.5 ms')).toBeTruthy();
  expect(card.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-04T12:00:00Z');
  expect(summaryCount(label)).toBe('1');
  expect(summaryCount('Configured monitors')).toBe('1');
  expect(client).toHaveBeenCalledWith('/api/monitors/1/checks?limit=1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
});
it('distinguishes no recorded checks from failed retrieval', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) =>
    url.includes('/1/') ? Response.json({ data: [] }) : new Response('', { status: 500 })));
  render(<MonitorOverview monitors={[monitor('1'), monitor('2')]} />);
  expect(await within(screen.getByRole('article', { name: 'Service 1' })).findByText('No recorded checks')).toBeTruthy();
  expect(await within(screen.getByRole('article', { name: 'Service 2' })).findByText('Latest check unavailable')).toBeTruthy();
  expect(summaryCount('No recorded checks')).toBe('1');
  expect(summaryCount('Latest check unavailable')).toBe('1');
  expect(screen.getByRole('article', { name: 'Service 1' }).querySelector('time')).toBeNull();
});
it('keeps disabled configuration separate from retained unhealthy results', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: [check('http_error')] })));
  render(<MonitorOverview monitors={[monitor('1', false)]} />);
  const card = screen.getByRole('article', { name: 'Service 1' });
  expect(await within(card).findByText('HTTP error')).toBeTruthy();
  expect(within(card).getByText('Disabled — scheduled checks paused')).toBeTruthy();
  expect(summaryCount('Disabled monitors')).toBe('1');
  expect(summaryCount('HTTP error')).toBe('1');
});
it('renders completed cards independently of slow or failing history requests', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/1/')) return Promise.resolve(Response.json({ data: [check('healthy')] }));
    if (url.includes('/2/')) return Promise.reject(new TypeError('Network unavailable'));
    return new Promise(() => {});
  }));
  render(<MonitorOverview monitors={[monitor('1'), monitor('2'), monitor('3')]} />);
  expect(await within(screen.getByRole('article', { name: 'Service 1' })).findByText('Healthy')).toBeTruthy();
  await waitFor(() => expect(summaryCount('Latest check unavailable')).toBe('1'));
  expect(within(screen.getByRole('article', { name: 'Service 3' })).getByText('Loading latest check')).toBeTruthy();
  expect(summaryCount('Healthy')).toBe('1');
  expect(summaryCount('Loading latest check')).toBe('1');
});
it('aborts outstanding history requests on unmount', () => {
  const client = vi.fn().mockImplementation((_url, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  vi.stubGlobal('fetch', client);
  const { unmount } = render(<MonitorOverview monitors={[monitor('1'), monitor('2')]} />);
  unmount();
  expect(client.mock.calls).toHaveLength(2);
  for (const call of client.mock.calls) expect(call[1].signal.aborted).toBe(true);
});
