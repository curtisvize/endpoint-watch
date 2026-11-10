import { expect, it } from 'vitest';
import type { CheckHistoryEntry } from '../api/monitors';
import { responseTimeHistory } from './response-time-history';

function check(id: string, seconds: number, outcome: CheckHistoryEntry['outcome'] = 'healthy', responseTimeMs = 10): CheckHistoryEntry {
  return { id, monitorId: '1', checkedAt: new Date(Date.UTC(2026, 10, 10, 12, 0, seconds)).toISOString(), outcome,
    responseTimeMs, statusCode: outcome === 'healthy' ? 200 : outcome === 'http_error' ? 503 : null, error: null };
}

it('sorts chronologically without mutating API order and spaces irregular timestamps proportionally', () => {
  const checks = [check('3', 40), check('2', 10, 'http_error', 20), check('1', 0)];
  const history = responseTimeHistory(checks);
  expect(history.points.map(({ check }) => check.id)).toEqual(['1', '2', '3']);
  expect(history.points.map(({ x }) => x)).toEqual([0, 0.25, 1]);
  expect(history.points.map(({ y }) => y)).toEqual([0.5, 1, 0.5]);
  expect(checks.map(({ id }) => id)).toEqual(['3', '2', '1']);
});

it('excludes timeout and connection durations from latency and its vertical scale, retaining their time range', () => {
  const history = responseTimeHistory([check('1', 0, 'timeout', 5000), check('2', 10, 'healthy', 12.5), check('3', 40, 'connection_error', 2000)]);
  expect(history.excludedCount).toBe(2);
  expect(history.maximumMs).toBe(13);
  expect(history.points).toHaveLength(1);
  expect(history.points[0].x).toBe(0.25);
  expect(history.points[0].check.id).toBe('2');
});

it('handles empty and exclusively failed histories', () => {
  expect(responseTimeHistory([])).toMatchObject({ points: [], excludedCount: 0, maximumMs: 1 });
  expect(responseTimeHistory([check('1', 0, 'timeout')])).toMatchObject({ points: [], excludedCount: 1 });
});

it('centers a single timestamp and handles tied timestamps and zero durations without division by zero', () => {
  expect(responseTimeHistory([check('1', 0, 'healthy', 0)]).points[0]).toMatchObject({ x: 0.5, y: 0 });
  const history = responseTimeHistory([check('1', 0), check('2', 0, 'http_error')]);
  expect(history.points.map(({ x, y }) => [x, y])).toEqual([[0.5, 1], [0.5, 1]]);
});

it('connects consecutive HTTP responses and breaks lines at each kind of failed request', () => {
  const history = responseTimeHistory([
    check('8', 50, 'http_error'), check('7', 40), check('6', 35, 'connection_error'),
    check('5', 30), check('4', 25, 'timeout'), check('3', 20, 'timeout'),
    check('2', 10, 'http_error'), check('1', 0),
  ]);
  expect(history.segments.map((segment) => segment.map(({ check }) => check.id)))
    .toEqual([['1', '2'], ['7', '8']]);
  expect(history.points.map(({ check }) => check.id)).toEqual(['1', '2', '5', '7', '8']);
  expect(history.outcomes.map(({ check }) => check.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  expect(history.outcomes[2].x).toBe(0.4);
});
