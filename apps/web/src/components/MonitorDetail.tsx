import { useEffect, useRef, useState } from 'react';
import { getRecentChecks, type Monitor, type CheckHistoryEntry } from '../api/monitors';
import { localCheckTime, outcomeLabels } from './check-format';

type HistoryState = { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; checks: CheckHistoryEntry[] };
export function MonitorDetail({ monitor, onClose }: { monitor: Monitor; onClose: () => void }) {
  const [state, setState] = useState<HistoryState>({ kind: 'loading' });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const controller = new AbortController();
    void getRecentChecks(monitor.id, 20, controller.signal).then(
      (checks) => { if (!controller.signal.aborted) setState({ kind: 'loaded', checks }); },
      () => { if (!controller.signal.aborted) setState({ kind: 'error' }); },
    );
    return () => controller.abort();
  }, [monitor.id]);
  const latest = state.kind === 'loaded' ? state.checks[0] : undefined;
  return (
    <section id="monitor-detail" className="monitor-detail" aria-labelledby="detail-heading">
      <h3 id="detail-heading" tabIndex={-1} ref={heading}>{monitor.name} — recent history</h3>
      <button type="button" onClick={onClose}>Close history</button>
      <p>{monitor.enabled ? 'Enabled' : 'Disabled — scheduled checks paused'}</p>
      <p>Latest recorded outcome: {latest ? outcomeLabels[latest.outcome] : state.kind === 'loading' ? 'Loading…' : state.kind === 'error' ? 'Unavailable' : 'No recorded checks'}</p>
      {state.kind === 'loading' && <p role="status">Loading recent checks…</p>}
      {state.kind === 'error' && <p role="alert">Unable to load history. Close and reopen this panel to try again.</p>}
      {state.kind === 'loaded' && (state.checks.length === 0 ? <p>No recorded checks for this monitor.</p> : (
        <>
          <p>The latest {state.checks.length} recorded checks, newest first. Times are in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
          <div className="history-scroll" role="region" aria-label="Check history table" tabIndex={0}>
            <table>
              <caption>Recent checks for {monitor.name}</caption>
              <thead><tr><th scope="col">Checked at (local time)</th><th scope="col">Outcome</th><th scope="col">HTTP status</th><th scope="col">Response time</th><th scope="col">Error</th></tr></thead>
              <tbody>{state.checks.map((check) => <tr key={check.id}>
                <td><time dateTime={check.checkedAt}>{localCheckTime(check.checkedAt)}</time></td>
                <td>{outcomeLabels[check.outcome]}</td>
                <td>{check.statusCode ?? 'Not available'}</td>
                <td>{check.responseTimeMs.toFixed(1)} ms</td>
                <td>{check.error ?? 'None'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </>
      ))}
    </section>
  );
}
