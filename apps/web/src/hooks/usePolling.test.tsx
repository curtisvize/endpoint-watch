import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePolling } from './usePolling';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-04T12:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
it('polls after 15 seconds and cancels the next timer on unmount', async () => {
  const load = vi.fn().mockResolvedValue({ data: 1 });
  const { result, unmount } = renderHook(() => usePolling(load));
  await flush();
  expect(result.current.data).toBe(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(14999); });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(load).toHaveBeenCalledTimes(2);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('prevents overlap for manual refreshes and slow requests', async () => {
  let finish!: (value: { data: number }) => void;
  const load = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { result, rerender } = renderHook(({ token }) => usePolling<number>(load, token), { initialProps: { token: 0 } });
  rerender({ token: 1 });
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ data: 1 }); });
  expect(result.current.refreshing).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(load).toHaveBeenCalledTimes(2);
});
it('retains data and successful timestamp through background failure, then recovers', async () => {
  const load = vi.fn().mockResolvedValueOnce({ data: 1 }).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: 2 });
  const { result } = renderHook(() => usePolling<number>(load));
  await flush();
  const updated = result.current.updatedAt;
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(result.current).toMatchObject({ data: 1, failed: true, refreshing: false, updatedAt: updated });
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(result.current).toMatchObject({ data: 2, failed: false });
  expect(result.current.updatedAt).not.toBe(updated);
});
it('keeps data while a manual background refresh is pending and aborts on unmount', async () => {
  let signal!: AbortSignal;
  const load = vi.fn().mockResolvedValueOnce({ data: 1 }).mockImplementation((value: AbortSignal) => {
    signal = value;
    return new Promise(() => {});
  });
  const { result, rerender, unmount } = renderHook(({ token }) => usePolling<number>(load, token), { initialProps: { token: 0 } });
  await flush();
  rerender({ token: 1 });
  expect(result.current).toMatchObject({ data: 1, refreshing: true });
  unmount();
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it('ignores obsolete results after changing loaders', async () => {
  let finish!: (value: { data: number }) => void;
  const old = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const next = vi.fn().mockResolvedValue({ data: 2 });
  const { result, rerender } = renderHook(({ loader }) => usePolling<number>(loader), { initialProps: { loader: old } });
  rerender({ loader: next });
  await flush();
  await act(async () => { finish({ data: 1 }); });
  expect(result.current.data).toBe(2);
});

it('retains snapshots while a changed loader refreshes configuration', async () => {
  const initial = vi.fn().mockResolvedValue({ data: 1 });
  const next = vi.fn().mockImplementation(() => new Promise(() => {}));
  const { result, rerender } = renderHook(({ loader }) => usePolling<number>(loader), { initialProps: { loader: initial } });
  await flush();
  rerender({ loader: next });
  expect(result.current).toMatchObject({ data: 1, refreshing: true });
});
