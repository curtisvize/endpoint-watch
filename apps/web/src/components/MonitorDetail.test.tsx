import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MonitorOverview } from './MonitorOverview';
import type { Monitor, CheckHistoryEntry } from '../api/monitors';
const monitors: Monitor[] = [
  { id: '1', name: 'Billing API', enabled: true, intervalSeconds: 60, createdAt: '2026-11-04T12:00:00Z' },
  { id: '2', name: 'Search API', enabled: false, intervalSeconds: 60, createdAt: '2026-11-04T12:00:00Z' },
];
const rows: CheckHistoryEntry[] = [
  { id: '10', monitorId: '1', checkedAt: '2026-11-04T12:00:00Z', outcome: 'http_error', statusCode: 503, responseTimeMs: 12.5, error: null },
  { id: '9', monitorId: '1', checkedAt: '2026-11-04T11:00:00Z', outcome: 'timeout', statusCode: null, responseTimeMs: 5000, error: 'Request timed out' },
  { id: '8', monitorId: '1', checkedAt: '2026-11-04T10:00:00Z', outcome: 'connection_error', statusCode: null, responseTimeMs: 1, error: '<b>Unable to connect</b>' },
];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function select(name = 'Billing API') { fireEvent.click(screen.getByRole('button', { name: `View history for ${name}` })); }
it('selects a monitor, focuses details, renders history in local time, and restores focus on close', async () => {
  const client = vi.fn().mockImplementation(async (url: string) => Response.json({ data: url.endsWith('limit=20') ? rows : [] }));
  vi.stubGlobal('fetch', client);
  render(<MonitorOverview monitors={monitors} />);
  expect(screen.queryByRole('region', { name: 'Billing API — recent history' })).toBeNull();
  select();
  const panel = screen.getByRole('region', { name: 'Billing API — recent history' });
  expect(document.activeElement).toBe(within(panel).getByRole('heading'));
  const table = await within(panel).findByRole('table', { name: 'Recent checks for Billing API' });
  expect(within(panel).getByText('Latest recorded outcome: HTTP error')).toBeTruthy();
  expect(within(table).getByText('503')).toBeTruthy();
  expect(within(table).getByText('12.5 ms')).toBeTruthy();
  expect(within(table).getByText('Request timed out')).toBeTruthy();
  expect(within(table).getByText('<b>Unable to connect</b>')).toBeTruthy();
  expect(table.querySelector('b')).toBeNull();
  expect(table.querySelector('time')?.textContent).toBe(new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'long' }).format(new Date(rows[0].checkedAt)));
  expect(table.querySelector('time')?.dateTime).toBe(rows[0].checkedAt);
  expect(within(table).getAllByRole('row')).toHaveLength(4);
  expect(client).toHaveBeenCalledWith('/api/monitors/1/checks?limit=20', expect.any(Object));
  fireEvent.click(within(panel).getByRole('button', { name: 'Close history' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View history for Billing API' }));
  expect(screen.queryByRole('region', { name: 'Billing API — recent history' })).toBeNull();
});
it.each(['empty', 'error'])('handles %s history for disabled monitors', async (state) => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) =>
    state === 'error' && url.endsWith('limit=20') ? new Response('', { status: 500 }) : Response.json({ data: [] })));
  render(<MonitorOverview monitors={monitors} />);
  select('Search API');
  const panel = screen.getByRole('region', { name: 'Search API — recent history' });
  expect(within(panel).getByText('Disabled — scheduled checks paused')).toBeTruthy();
  if (state === 'empty') expect(await within(panel).findByText('No recorded checks for this monitor.')).toBeTruthy();
  else expect((await within(panel).findByRole('alert')).textContent).toContain('Unable to load history');
});
it('shows loading and aborts the old request when selection changes, ignoring late results', async () => {
  let finish!: (response: Response) => void;
  let oldSignal: AbortSignal | undefined;
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, options: RequestInit) => {
    if (url === '/api/monitors/1/checks?limit=20') {
      oldSignal = options.signal ?? undefined;
      return new Promise<Response>((resolve) => { finish = resolve; });
    }
    return Promise.resolve(Response.json({ data: [] }));
  }));
  render(<MonitorOverview monitors={monitors} />);
  select();
  expect(screen.getByRole('status').textContent).toBe('Loading recent checks…');
  select('Search API');
  expect(oldSignal?.aborted).toBe(true);
  const panel = screen.getByRole('region', { name: 'Search API — recent history' });
  expect(await within(panel).findByText('No recorded checks for this monitor.')).toBeTruthy();
  await act(async () => { finish(Response.json({ data: rows })); });
  expect(within(panel).queryByRole('table')).toBeNull();
});
