import { useEffect, useRef, useState } from 'react';

export interface RefreshState {
  refreshing: boolean;
  failed: boolean;
  updatedAt: string | null;
}
export interface PollResult<T> { data: T; failed?: boolean }

export function usePolling<T>(
  load: (signal: AbortSignal, previous: T | undefined, publish: (data: T) => void) => Promise<PollResult<T>>,
  refreshKey = 0,
) {
  const [data, setData] = useState<T>();
  const [state, setState] = useState<RefreshState>({ refreshing: true, failed: false, updatedAt: null });
  const retained = useRef<T | undefined>(undefined);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let previous = retained.current;
    setState((value) => ({ ...value, refreshing: true }));
    async function run() {
      if (running || controller.signal.aborted) return;
      running = true;
      clearTimeout(timer);
      setState((value) => ({ ...value, refreshing: true }));
      try {
        const result = await load(controller.signal, previous, (partial) => {
          if (!controller.signal.aborted) { retained.current = partial; setData(partial); }
        });
        if (controller.signal.aborted) return;
        previous = result.data;
        retained.current = result.data;
        setData(result.data);
        setState((value) => ({ refreshing: false, failed: result.failed ?? false,
          updatedAt: result.failed ? value.updatedAt : new Date().toISOString() }));
      } catch {
        if (!controller.signal.aborted) setState((value) => ({ ...value, refreshing: false, failed: true }));
      } finally {
        running = false;
        if (!controller.signal.aborted) timer = setTimeout(() => { void run(); }, 15000);
      }
    }
    refresh.current = () => { void run(); };
    void run();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [load]);
  const previousKey = useRef(refreshKey);
  useEffect(() => {
    if (previousKey.current !== refreshKey) {
      previousKey.current = refreshKey;
      refresh.current();
    }
  }, [refreshKey]);
  return { data, ...state };
}
