import type { CheckHistoryEntry } from '../api/monitors';

export function responseTimeHistory(checks: CheckHistoryEntry[]) {
  const ordered = [...checks].sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt));
  const start = ordered.length ? Date.parse(ordered[0].checkedAt) : 0;
  const end = ordered.length ? Date.parse(ordered[ordered.length - 1].checkedAt) : start;
  const responses = ordered.filter((check) => check.outcome === 'healthy' || check.outcome === 'http_error');
  const maximumMs = Math.max(1, Math.ceil(Math.max(0, ...responses.map((check) => check.responseTimeMs))));
  const outcomes = ordered.map((check) => ({
    check, x: end === start ? 0.5 : (Date.parse(check.checkedAt) - start) / (end - start),
  }));
  const points = outcomes.filter(({ check }) => check.outcome === 'healthy' || check.outcome === 'http_error')
    .map((point) => ({ ...point, y: point.check.responseTimeMs / maximumMs }));
  const byId = new Map(points.map((point) => [point.check.id, point]));
  const segments: (typeof points)[] = [];
  let segment: typeof points = [];
  for (const check of ordered) {
    const point = byId.get(check.id);
    if (point) segment.push(point);
    else {
      if (segment.length > 1) segments.push(segment);
      segment = [];
    }
  }
  if (segment.length > 1) segments.push(segment);
  return {
    start, end, maximumMs, excludedCount: ordered.length - responses.length,
    points, segments, outcomes,
  };
}
