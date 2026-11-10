import { useId } from 'react';
import type { CheckHistoryEntry } from '../api/monitors';
import { localCheckTime, outcomeLabels } from './check-format';
import { responseTimeHistory } from './response-time-history';

export function ResponseTimeChart({ checks }: { checks: CheckHistoryEntry[] }) {
  const id = useId();
  const history = responseTimeHistory(checks);
  const clockTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString();
  return (
    <figure className="response-time-chart">
      <figcaption>Response-time history</figcaption>
      <ul className="chart-legend" aria-label="Chart legend">
        <li><span className="legend-healthy" aria-hidden="true">●</span> Healthy</li>
        <li><span className="legend-error" aria-hidden="true">◆</span> HTTP error</li>
        <li><span className="legend-timeout" aria-hidden="true">▲</span> Timeout</li>
        <li><span className="legend-error" aria-hidden="true">×</span> Connection error</li>
      </ul>
      <p className="placeholder-note">Lines join consecutive HTTP responses; gaps indicate timeouts or connection failures.</p>
      {history.excludedCount > 0 && <p>{history.excludedCount} timeout or connection-failure checks excluded from latency measurements. See the history table for details.</p>}
      {checks.length === 0 ? <p>No recorded checks to chart.</p> : <>
          {history.points.length === 0 && <p>No HTTP responses recorded in this window. Check outcomes are shown below.</p>}
          <div className="chart-scroll" role="region" aria-label="Response-time chart" tabIndex={0}>
            <svg viewBox="0 0 480 300" role="img" aria-labelledby={`${id}-title ${id}-description`}>
              <title id={`${id}-title`}>Response times for recent checks</title>
              <desc id={`${id}-description`}>Chronological HTTP response times in milliseconds, with lines broken at timeouts and connection failures. The separate outcome strip shows every check: healthy circles, HTTP error diamonds, timeout triangles, and connection failure crosses. Exact timestamps and values are in the history table below.</desc>
              <text x="12" y="18">Response headers (ms)</text>
              {history.points.length > 0 && [0, 0.5, 1].map((ratio) => <g key={ratio}>
                <line className="chart-grid-line" x1="56" x2="460" y1={180 - ratio * 150} y2={180 - ratio * 150} />
                <text x="48" y={185 - ratio * 150} textAnchor="end">{Number((ratio * history.maximumMs).toFixed(1))}</text>
              </g>)}
              {history.points.length > 0 ? <line className="chart-axis" x1="56" x2="56" y1="30" y2="180" /> :
                <text x="258" y="100" textAnchor="middle">No HTTP response measurements</text>}
              {history.segments.map((segment) => <polyline key={segment[0].check.id} className="chart-response-line"
                points={segment.map(({ x, y }) => `${56 + x * 404},${180 - y * 150}`).join(' ')} />)}
              {history.points.map(({ check, x, y }) => {
                const cx = 56 + x * 404;
                const cy = 180 - y * 150;
                const description = `${localCheckTime(check.checkedAt)}: ${outcomeLabels[check.outcome]}, ${check.responseTimeMs.toFixed(1)} ms`;
                return check.outcome === 'healthy' ?
                  <circle key={check.id} className="chart-healthy" cx={cx} cy={cy} r="5"><title>{description}</title></circle> :
                  <path key={check.id} className="chart-http-error" d={`M ${cx} ${cy - 6} l 6 6 l -6 6 l -6 -6 Z`}><title>{description}</title></path>;
              })}
              <text x="12" y="210">Check outcomes (not latency)</text>
              <line className="chart-grid-line" x1="56" x2="460" y1="230" y2="230" />
              <g className="chart-outcomes">
                {history.outcomes.map(({ check, x }) => {
                  const cx = 56 + x * 404;
                  const description = `${localCheckTime(check.checkedAt)}: ${outcomeLabels[check.outcome]}`;
                  return <g key={check.id} className={`chart-outcome-${check.outcome}`}>
                    <title>{description}</title>
                    {check.outcome === 'healthy' ? <circle cx={cx} cy="230" r="5" /> :
                      check.outcome === 'http_error' ? <path d={`M ${cx} 224 l 6 6 l -6 6 l -6 -6 Z`} /> :
                      check.outcome === 'timeout' ? <path d={`M ${cx} 224 l 6 12 h -12 Z`} /> :
                      <path d={`M ${cx - 5} 225 l 10 10 m 0 -10 l -10 10`} />}
                  </g>;
                })}
              </g>
              {history.start === history.end ? <text x="258" y="265" textAnchor="middle">{clockTime(history.start)}</text> : <>
                <text x="56" y="265">{clockTime(history.start)}</text>
                <text x="460" y="265" textAnchor="end">{clockTime(history.end)}</text>
              </>}
              <text x="258" y="292" textAnchor="middle">Check start time (local)</text>
            </svg>
          </div>
          <p className="chart-range">{localCheckTime(new Date(history.start).toISOString())}{history.start !== history.end && ` — ${localCheckTime(new Date(history.end).toISOString())}`}. Latency measures time until response headers.</p>
        </>}
    </figure>
  );
}
