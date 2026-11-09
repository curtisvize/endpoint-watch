import { useCallback, useState } from 'react';
import { getRecentChecks, type Monitor, type CheckHistoryEntry } from '../api/monitors';
import { MonitorDetail } from './MonitorDetail';
import { usePolling } from '../hooks/usePolling';
import { RefreshNotice } from './RefreshNotice';
import { outcomeLabels, localCheckTime } from './check-format';
import { ResultFreshness } from './ResultFreshness';

type Latest = { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'loaded'; check: CheckHistoryEntry | null; stale?: boolean };
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
      {latest.kind === 'loaded' && <ResultFreshness monitor={monitor} checkedAt={check?.checkedAt ?? null} />}
      {latest.kind === 'loaded' && latest.stale && <p className="stale-warning">Latest check refresh failed. This result may be stale.</p>}
      {latest.kind === 'unavailable' && <p className="placeholder-note">Could not retrieve history. Reload the page to try again.</p>}
    </article>
  );
}

export function MonitorOverview({ monitors, refreshKey = 0 }: { monitors: Monitor[]; refreshKey?: number }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = monitors.find((monitor) => monitor.id === selectedId);
  // Stable across routine list reloads; configuration changes still render immediately.
  const idsKey = JSON.stringify(monitors.map((monitor) => monitor.id));
  const load = useCallback(async (signal: AbortSignal, previous: Record<string, Latest> | undefined, publish: (data: Record<string, Latest>) => void) => {
    const ids: string[] = JSON.parse(idsKey);
    let failed = false;
    const current = { ...previous };
    const entries = await Promise.all(ids.map(async (id): Promise<[string, Latest]> => {
      try {
        const checks = await getRecentChecks(id, 1, signal);
        current[id] = { kind: 'loaded', check: checks[0] ?? null };
        publish({ ...current });
        return [id, { kind: 'loaded', check: checks[0] ?? null }];
      } catch {
        failed = true;
        const old = previous?.[id];
        const latest: Latest = old?.kind === 'loaded' ? { ...old, stale: true } : { kind: 'unavailable' };
        current[id] = latest;
        publish({ ...current });
        return [id, latest];
      }
    }));
    return { data: Object.fromEntries(entries), failed };
  }, [idsKey]);
  const polling = usePolling(load, refreshKey);
  const history = polling.data ?? {};

  const counts: Record<Category, number> = {
    healthy: 0, http_error: 0, timeout: 0, connection_error: 0, unchecked: 0, unavailable: 0, loading: 0,
  };
  for (const monitor of monitors) counts[category(history[monitor.id] ?? { kind: 'loading' })]++;
  return (
    <>
      <RefreshNotice state={polling} label="Latest checks" hasData={polling.data !== undefined} />
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
          <MonitorCard monitor={monitor} latest={history[monitor.id] ?? { kind: 'loading' }} selected={selectedId === monitor.id} onSelect={() => setSelectedId(monitor.id)} />
        </li>)}
      </ul>
      {selected && <MonitorDetail key={selected.id} monitor={selected} refreshKey={refreshKey} onClose={() => {
        document.getElementById(`select-monitor-${selected.id}`)?.focus();
        setSelectedId(null);
      }} />}
    </>
  );
}
