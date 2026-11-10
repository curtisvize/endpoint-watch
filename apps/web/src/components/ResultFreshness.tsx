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
    <div className="freshness-group">
    <p className={monitor.enabled && overdue ? 'stale-warning' : 'result-freshness'} aria-live="polite">
      {!monitor.enabled ? 'Freshness: Paused' :
        checkedAt === null ? 'Freshness: Not available — no recorded checks.' :
        overdue ? 'Freshness: Overdue — no recent result. This does not confirm endpoint failure.' :
        'Freshness: Current'}
    </p>
    {monitor.enabled && checkedAt !== null && <details className="freshness-help">
      <summary>About freshness</summary>
      <p>Expected within {monitor.intervalSeconds} seconds plus {grace} seconds of grace from check start. Freshness describes result age, independently of the recorded outcome.</p>
    </details>}
    </div>
  );
}
