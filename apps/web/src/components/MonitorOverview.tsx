import { useEffect, useState } from 'react';
import { getRecentChecks, type Monitor, type CheckHistoryEntry } from '../api/monitors';
import { MonitorDetail } from './MonitorDetail';
import { outcomeLabels, localCheckTime } from './check-format';

type Latest = { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'loaded'; check: CheckHistoryEntry | null };
const summaryLabels = {
  ...outcomeLabels, unchecked: 'No recorded checks', unavailable: 'Latest check unavailable', loading: 'Loading latest check',
};
type Category = keyof typeof summaryLabels;
function category(latest: Latest): Category {
  return latest.kind === 'loaded' ? latest.check?.outcome ?? 'unchecked' : latest.kind;
}

function MonitorCard({ monitor, latest, selected, onSelect }: { monitor: Monitor; latest: Latest; selected: boolean; onSelect: () => void }) {
  const check = latest.kind === 'loaded' ? latest.check : null;
  const label = summaryLabels[category(latest)];
  return (
    <article aria-labelledby={`monitor-${monitor.id}`} className="monitor-card">
      <h3 id={`monitor-${monitor.id}`}>{monitor.name}</h3>
      <button id={`select-monitor-${monitor.id}`} type="button" aria-pressed={selected} aria-controls={selected ? 'monitor-detail' : undefined} onClick={onSelect}>View history for {monitor.name}</button>
      <p className="monitor-configuration">{monitor.enabled ? 'Enabled' : 'Disabled — scheduled checks paused'}</p>
      <p>Configured interval: {monitor.intervalSeconds} seconds</p>
      <dl className="monitor-details">
        <div><dt>Latest recorded outcome</dt><dd><span className={`outcome outcome-${category(latest)}`}>{label}</span></dd></div>
        <div><dt>Response time</dt><dd>{check ? `${check.responseTimeMs.toFixed(1)} ms` : 'Not available'}</dd></div>
        <div><dt>Last checked (local time)</dt><dd>{check ? <time dateTime={check.checkedAt}>{localCheckTime(check.checkedAt)}</time> : 'Not available'}</dd></div>
      </dl>
      {latest.kind === 'unavailable' && <p className="placeholder-note">Could not retrieve history. Reload the page to try again.</p>}
    </article>
  );
}

export function MonitorOverview({ monitors }: { monitors: Monitor[] }) {
  const [selected, setSelected] = useState<Monitor | null>(null);
  const [history, setHistory] = useState<Record<string, Latest>>({});
  useEffect(() => {
    const controller = new AbortController();
    setHistory({});
    for (const monitor of monitors) {
      void getRecentChecks(monitor.id, 1, controller.signal).then(
        (checks) => {
          if (!controller.signal.aborted) setHistory((previous) => ({
            ...previous, [monitor.id]: { kind: 'loaded', check: checks[0] ?? null },
          }));
        },
        () => {
          if (!controller.signal.aborted) setHistory((previous) => ({ ...previous, [monitor.id]: { kind: 'unavailable' } }));
        },
      );
    }
    return () => controller.abort();
  }, [monitors]);

  const counts: Record<Category, number> = {
    healthy: 0, http_error: 0, timeout: 0, connection_error: 0, unchecked: 0, unavailable: 0, loading: 0,
  };
  for (const monitor of monitors) counts[category(history[monitor.id] ?? { kind: 'loading' })]++;
  return (
    <>
      <section aria-labelledby="summary-heading" className="overview-summary">
        <h3 id="summary-heading">Monitoring summary</h3>
        <p>Latest recorded outcomes include disabled monitors; they do not indicate that checks are currently running.</p>
        <dl className="summary-counts" aria-live="polite">
          <div><dt>Configured monitors</dt><dd>{monitors.length}</dd></div>
          <div><dt>Disabled monitors</dt><dd>{monitors.filter((monitor) => !monitor.enabled).length}</dd></div>
          {(Object.keys(summaryLabels) as Category[]).map((key) => (
            <div key={key}><dt>{summaryLabels[key]}</dt><dd>{counts[key]}</dd></div>
          ))}
        </dl>
      </section>
      <ul className="monitor-grid">
        {monitors.map((monitor) => <li key={monitor.id}>
          <MonitorCard monitor={monitor} latest={history[monitor.id] ?? { kind: 'loading' }} selected={selected?.id === monitor.id} onSelect={() => setSelected(monitor)} />
        </li>)}
      </ul>
      {selected && <MonitorDetail key={selected.id} monitor={selected} onClose={() => {
        document.getElementById(`select-monitor-${selected.id}`)?.focus();
        setSelected(null);
      }} />}
    </>
  );
}
