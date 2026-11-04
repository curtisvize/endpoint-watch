import { useEffect, useState } from 'react';
import { listMonitors, type Monitor } from './api/monitors';

type MonitorState = { kind: 'loading' } | { kind: 'loaded'; monitors: Monitor[] } | { kind: 'error' };

export function App() {
  const [state, setState] = useState<MonitorState>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    void listMonitors(controller.signal).then(
      (monitors) => { if (!controller.signal.aborted) setState({ kind: 'loaded', monitors }); },
      () => { if (!controller.signal.aborted) setState({ kind: 'error' }); },
    );
    return () => controller.abort();
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="eyebrow">API monitoring</p>
        <h1>Endpoint Watch</h1>
        <p>A clear view of your services, all in one place.</p>
      </header>
      <main>
        <section className="placeholder" aria-labelledby="monitors-heading">
          <h2 id="monitors-heading">Configured monitors</h2>
          {state.kind === 'loading' && <p role="status">Loading monitors…</p>}
          {state.kind === 'error' && <p role="alert">Unable to load monitors. Check that the API is running, then reload the page.</p>}
          {state.kind === 'loaded' && (state.monitors.length === 0 ? (
            <p>No monitors are configured yet.</p>
          ) : (
            <ul className="monitor-list">
              {state.monitors.map((monitor) => (
                <li key={monitor.id}>
                  <h3>{monitor.name}</h3>
                  <p>Configured interval: {monitor.intervalSeconds} seconds</p>
                  {!monitor.enabled && <p className="placeholder-note">Monitoring disabled</p>}
                </li>
              ))}
            </ul>
          ))}
        </section>
      </main>
    </div>
  );
}
