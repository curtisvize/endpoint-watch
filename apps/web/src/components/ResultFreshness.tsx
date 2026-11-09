import { useEffect, useState } from 'react';
import type { Monitor } from '../api/monitors';

export function freshnessGraceSeconds(intervalSeconds: number): number {
  // Allow check duration, dashboard polling, and scheduling delays before warning.
  return Math.max(30, intervalSeconds / 2);
}

export function ResultFreshness({ monitor, checkedAt }: { monitor: Monitor; checkedAt: string | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!monitor.enabled || checkedAt === null) return;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [monitor.enabled, checkedAt]);

  const grace = freshnessGraceSeconds(monitor.intervalSeconds);
  const overdue = checkedAt !== null && Date.now() - Date.parse(checkedAt) > (monitor.intervalSeconds + grace) * 1000;
  return (
    <p className={monitor.enabled && overdue ? 'stale-warning' : 'result-freshness'} aria-live="polite">
      {!monitor.enabled ? 'Freshness: Paused — disabled monitors are not expected to receive checks.' :
        checkedAt === null ? 'Freshness: Not available — no recorded checks.' :
        overdue ? 'Freshness: Overdue — no recent result. This does not confirm endpoint failure.' :
        'Freshness: Current — the latest known result is within the expected check window.'}
      {monitor.enabled && checkedAt !== null && ` Expected within ${monitor.intervalSeconds} seconds plus ${grace} seconds of grace from check start.`}
    </p>
  );
}
