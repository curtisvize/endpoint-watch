import type { RefreshState } from '../hooks/usePolling';
import { localCheckTime } from './check-format';

export function RefreshNotice({ state, label, hasData }: { state: RefreshState; label: string; hasData: boolean }) {
  return <div className="refresh-notice" aria-live="polite">
    {state.refreshing && hasData && <p>Refreshing {label.toLowerCase()}… Previously loaded data remains visible.</p>}
    {state.failed && hasData && <p className="stale-warning">{label} refresh failed. Displayed data may be stale; automatic retries will continue.</p>}
    <p>{label} last successfully updated: {state.updatedAt ? <time dateTime={state.updatedAt}>{localCheckTime(state.updatedAt)}</time> : 'Not yet'}</p>
  </div>;
}
