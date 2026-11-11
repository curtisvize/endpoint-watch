import { useCallback, useState } from 'react';
import { listMonitors } from './api/monitors';
import { MonitorOverview } from './components/MonitorOverview';
import { RefreshNotice } from './components/RefreshNotice';
import { usePolling } from './hooks/usePolling';
import { ThemeSelector } from './components/ThemeSelector';

export function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const load = useCallback(async (signal: AbortSignal) => ({ data: await listMonitors(signal) }), []);
  const polling = usePolling(load, refreshKey);
  const monitors = polling.data;
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-appearance"><ThemeSelector /></div>
        <p className="eyebrow">API monitoring</p>
        <h1>Endpoint Watch</h1>
        <p>A clear view of your services, all in one place.</p>
      </header>
      <main>
        <div className="dashboard-toolbar">
          <button type="button" disabled={polling.refreshing} onClick={() => setRefreshKey((value) => value + 1)}>Refresh</button>
          <p>Auto-refresh · about every 15 seconds</p>
        </div>
        <RefreshNotice state={polling} label="Monitor list" hasData={monitors !== undefined} />
        <section className="placeholder" aria-labelledby="monitors-heading">
          <h2 id="monitors-heading">Configured monitors</h2>
          {monitors === undefined && polling.refreshing && <p role="status">Loading monitors…</p>}
          {monitors === undefined && polling.failed && <p role="alert">Unable to load monitors. Check that the API is running; refresh or wait for an automatic retry.</p>}
          {monitors !== undefined && <>
            {monitors.length === 0 && <p>No monitors are configured yet.</p>}
            <MonitorOverview monitors={monitors} refreshKey={refreshKey} />
          </>}
        </section>
      </main>
    </div>
  );
}
