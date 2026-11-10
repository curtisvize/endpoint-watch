import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { CheckHistoryEntry } from '../api/monitors';
import { ResponseTimeChart } from './ResponseTimeChart';

afterEach(cleanup);
const check: CheckHistoryEntry = { id: '1', monitorId: '1', checkedAt: '2026-11-10T12:00:00Z', outcome: 'healthy', responseTimeMs: 12.5, statusCode: 200, error: null };

it('shows an empty message without empty axes', () => {
  render(<ResponseTimeChart checks={[]} />);
  expect(screen.getByText('No recorded checks to chart.')).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
});

it('renders a single response, named axes, and an accessible chart description', () => {
  render(<ResponseTimeChart checks={[check]} />);
  const chart = screen.getByRole('img', { name: /Response times for recent checks/ });
  expect(chart.querySelectorAll('.chart-healthy')).toHaveLength(1);
  expect(screen.getByText('Response headers (ms)')).toBeTruthy();
  expect(screen.getByText('Check start time (local)')).toBeTruthy();
  expect(chart.querySelector('circle title')?.textContent).toContain('Healthy, 12.5 ms');
});

it('uses different marker shapes for HTTP errors and excludes failed requests', () => {
  render(<ResponseTimeChart checks={[check,
    { ...check, id: '2', outcome: 'http_error', statusCode: 503 },
    { ...check, id: '3', outcome: 'timeout', responseTimeMs: 5000, statusCode: null },
    { ...check, id: '4', outcome: 'connection_error', statusCode: null },
  ]} />);
  const chart = screen.getByRole('img', { name: /Response times for recent checks/ });
  expect(chart.querySelectorAll('.chart-healthy')).toHaveLength(1);
  expect(chart.querySelectorAll('.chart-http-error')).toHaveLength(1);
  expect(chart.querySelector('.chart-http-error title')?.textContent).toContain('HTTP error');
  expect(screen.getByText(/2 timeout or connection-failure checks excluded/)).toBeTruthy();
  expect(chart.querySelectorAll('.chart-outcomes > g')).toHaveLength(4);
  for (const outcome of ['healthy', 'http_error', 'timeout', 'connection_error']) {
    expect(chart.querySelectorAll(`.chart-outcome-${outcome}`)).toHaveLength(1);
  }
});

it('explains exclusively failed history rather than plotting timeout durations', () => {
  render(<ResponseTimeChart checks={[{ ...check, outcome: 'timeout', statusCode: null, responseTimeMs: 5000 }]} />);
  expect(screen.getByText(/No HTTP responses recorded in this window/)).toBeTruthy();
  const chart = screen.getByRole('img', { name: /Response times for recent checks/ });
  expect(chart.querySelectorAll('.chart-outcome-timeout')).toHaveLength(1);
  expect(chart.querySelectorAll('.chart-healthy, .chart-http-error, polyline')).toHaveLength(0);
});

it('renders separate response lines around failures on the same time axis as outcome markers', () => {
  const checks: CheckHistoryEntry[] = ['healthy', 'http_error', 'timeout', 'healthy', 'healthy'].map((outcome, index) => ({
    ...check, id: String(index), outcome: outcome as CheckHistoryEntry['outcome'],
    checkedAt: new Date(Date.parse(check.checkedAt) + index * 10000).toISOString(),
  }));
  render(<ResponseTimeChart checks={checks.reverse()} />);
  const chart = screen.getByRole('img', { name: /Response times for recent checks/ });
  expect(chart.querySelectorAll('polyline')).toHaveLength(2);
  expect(chart.querySelectorAll('.chart-outcomes > g')).toHaveLength(5);
  expect(chart.querySelectorAll('polyline')[0].getAttribute('points')?.split(' ')).toHaveLength(2);
});

it('keeps a sequence of connection failures visible without latency points or lines', () => {
  render(<ResponseTimeChart checks={[{ ...check, outcome: 'connection_error' },
    { ...check, id: '2', checkedAt: '2026-11-10T12:01:00Z', outcome: 'connection_error' }]} />);
  const chart = screen.getByRole('img', { name: /Response times for recent checks/ });
  expect(chart.querySelectorAll('.chart-outcome-connection_error')).toHaveLength(2);
  expect(chart.querySelectorAll('.chart-healthy, .chart-http-error, polyline')).toHaveLength(0);
});
