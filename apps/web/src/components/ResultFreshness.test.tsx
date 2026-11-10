import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CheckHistoryEntry, Monitor } from '../api/monitors';
import { MonitorOverview } from './MonitorOverview';
import { freshnessGraceSeconds, ResultFreshness } from './ResultFreshness';

const monitor: Monitor = { id: '1', name: 'Billing API', enabled: true, intervalSeconds: 60, createdAt: '2026-11-04T12:00:00Z' };
const check: CheckHistoryEntry = { id: '1', monitorId: '1', checkedAt: monitor.createdAt, outcome: 'healthy', statusCode: 200, responseTimeMs: 12, error: null };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(check.checkedAt)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

it('uses a minimum grace for short intervals and proportional grace for longer ones', () => {
  expect(freshnessGraceSeconds(10)).toBe(30);
  expect(freshnessGraceSeconds(60)).toBe(30);
  expect(freshnessGraceSeconds(300)).toBe(150);
});

it('keeps the current label compact while making the threshold available in expandable help', () => {
  render(<ResultFreshness monitor={monitor} checkedAt={check.checkedAt} />);
  expect(screen.getByText('Freshness: Current')).toBeTruthy();
  const help = screen.getByText('About freshness').closest('details')!;
  expect(help.open).toBe(false);
  expect(help.textContent).toContain('60 seconds plus 30 seconds of grace');
});

it('keeps delayed results current between dashboard polls and becomes overdue when checks stop', async () => {
  const origin = Date.parse(check.checkedAt);
  // Start between worker completions so dashboard polling can retain a result
  // almost 30 seconds old: 10s interval + 5s completion + 15s polling.
  vi.setSystemTime(origin + 9000);
  let stoppedAt: number | undefined;
  const client = vi.fn().mockImplementation(async () => {
    const now = stoppedAt ?? Date.now();
    const latestStart = origin + Math.floor((now - origin - 5000) / 10000) * 10000;
    return Response.json({ data: [{ ...check, outcome: 'timeout', statusCode: null,
      responseTimeMs: 5000, error: 'Request timed out', checkedAt: new Date(latestStart).toISOString() }] });
  });
  vi.stubGlobal('fetch', client);
  render(<MonitorOverview monitors={[{ ...monitor, intervalSeconds: 10 }]} />);
  await advance(0);
  fireEvent.click(screen.getByRole('button', { name: 'View history for Billing API' }));
  await advance(0);
  for (let seconds = 0; seconds < 120; seconds++) {
    await advance(1000);
    expect(screen.getAllByText(/Freshness: Current/)).toHaveLength(2);
    expect(screen.queryByText(/Freshness: Overdue/)).toBeNull();
  }
  expect(client.mock.calls.length).toBeGreaterThan(10);
  expect(screen.getByText('Latest recorded outcome: Timeout')).toBeTruthy();
  stoppedAt = Date.now();
  await advance(45000);
  expect(screen.getAllByText(/Freshness: Overdue/)).toHaveLength(2);
  expect(screen.getByText('Latest recorded outcome: Timeout')).toBeTruthy();
});

it('becomes overdue only after the interval and grace, and cleans up its timer', async () => {
  const { unmount } = render(<ResultFreshness monitor={monitor} checkedAt={check.checkedAt} />);
  await advance(90000);
  expect(screen.getByText(/Freshness: Current/)).toBeTruthy();
  await advance(1000);
  expect(screen.getByText(/Freshness: Overdue/).textContent).toContain('does not confirm endpoint failure');
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps disabled monitors paused and no-history monitors without a freshness deadline', async () => {
  const { rerender } = render(<ResultFreshness monitor={{ ...monitor, enabled: false }} checkedAt={check.checkedAt} />);
  await advance(3600000);
  expect(screen.getByText(/Freshness: Paused/)).toBeTruthy();
  expect(vi.getTimerCount()).toBe(0);
  rerender(<ResultFreshness monitor={monitor} checkedAt={null} />);
  expect(screen.getByText(/Freshness: Not available — no recorded checks/)).toBeTruthy();
  expect(vi.getTimerCount()).toBe(0);
  rerender(<ResultFreshness monitor={monitor} checkedAt={check.checkedAt} />);
  expect(screen.getByText(/Freshness: Overdue/)).toBeTruthy();
});

it('recalculates when interval configuration or the latest timestamp changes', () => {
  vi.setSystemTime(new Date(Date.parse(check.checkedAt) + 100000));
  const { rerender } = render(<ResultFreshness monitor={monitor} checkedAt={check.checkedAt} />);
  expect(screen.getByText(/Freshness: Overdue/)).toBeTruthy();
  rerender(<ResultFreshness monitor={{ ...monitor, intervalSeconds: 300 }} checkedAt={check.checkedAt} />);
  expect(screen.getByText(/Freshness: Current/)).toBeTruthy();
  rerender(<ResultFreshness monitor={monitor} checkedAt={new Date().toISOString()} />);
  expect(screen.getByText(/Freshness: Current/)).toBeTruthy();
});

it.each(['healthy', 'http_error', 'timeout', 'connection_error'] as const)('preserves %s while overview and detail age despite successful refreshes', async (outcome) => {
  let latest = { ...check, outcome };
  const client = vi.fn().mockImplementation(async () => Response.json({ data: [latest] }));
  vi.stubGlobal('fetch', client);
  render(<MonitorOverview monitors={[monitor]} />);
  await advance(0);
  fireEvent.click(screen.getByRole('button', { name: 'View history for Billing API' }));
  await advance(0);
  const card = screen.getByRole('article', { name: 'Billing API' });
  const panel = screen.getByRole('region', { name: 'Billing API — recent history' });
  const originalOutcome = within(card).getByText('Latest recorded outcome').nextElementSibling!.textContent;
  for (const section of [card, panel]) expect(within(section).getByText(/Freshness: Current/)).toBeTruthy();
  await advance(91000);
  for (const section of [card, panel]) expect(within(section).getByText(/Freshness: Overdue/)).toBeTruthy();
  expect(client.mock.calls.length).toBeGreaterThan(4);
  expect(within(card).getByText('Latest recorded outcome').nextElementSibling!.textContent).toBe(originalOutcome);
  expect(within(panel).getByText(`Latest recorded outcome: ${originalOutcome}`)).toBeTruthy();
  latest = { ...latest, checkedAt: new Date().toISOString() };
  await advance(15000);
  for (const section of [card, panel]) expect(within(section).getByText(/Freshness: Current/)).toBeTruthy();
});

it('shows paused freshness in both views while retaining a disabled monitor’s unhealthy outcome', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({ data: [{ ...check, outcome: 'http_error' }] })));
  render(<MonitorOverview monitors={[{ ...monitor, enabled: false }]} />);
  await advance(0);
  fireEvent.click(screen.getByRole('button', { name: 'View history for Billing API' }));
  await advance(120000);
  expect(screen.getAllByText(/Freshness: Paused/)).toHaveLength(2);
  expect(screen.queryByText(/Freshness: Overdue/)).toBeNull();
  expect(screen.getByText('Latest recorded outcome: HTTP error')).toBeTruthy();
});
