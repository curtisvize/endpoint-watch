import type { EventEmitter } from 'node:events';

export function installShutdownHandlers(
  worker: { stop: () => Promise<void> },
  closeDatabase: () => Promise<void>,
  signals: Pick<EventEmitter, 'on' | 'off'> = process,
  reportFailure: () => void = () => {
    console.error('Monitoring worker shutdown failed');
    process.exitCode = 1;
  },
) {
  let stopping: Promise<void> | undefined;
  function stop(): Promise<void> {
    if (!stopping) {
      stopping = (async () => {
        try {
          try { await worker.stop(); } finally { await closeDatabase(); }
        } catch {
          reportFailure();
        } finally {
          signals.off('SIGINT', onSignal);
          signals.off('SIGTERM', onSignal);
        }
      })();
    }
    return stopping;
  }
  function onSignal() { void stop(); }
  signals.on('SIGINT', onSignal);
  signals.on('SIGTERM', onSignal);
  return stop;
}
