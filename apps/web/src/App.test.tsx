import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('renders the heading and loading state', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: 'Endpoint Watch' })).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('Loading monitors…');
});
it('renders monitor names, intervals, and disabled configuration', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (path: string) => Response.json({ data: path.includes('/checks') ? [] : [
    { id: '9007199254740993', name: 'Billing API', intervalSeconds: 60, enabled: true, createdAt: '2026-11-04T12:00:00Z' },
    { id: '2', name: 'Search API', intervalSeconds: 30, enabled: false, createdAt: '2026-11-04T12:00:00Z' },
  ] })));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Billing API' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Search API' })).toBeTruthy();
  expect(screen.getByText('Configured interval: 60 seconds')).toBeTruthy();
  expect(screen.getByText('Disabled — scheduled checks paused')).toBeTruthy();
  await waitFor(() => expect(screen.queryAllByText('Loading latest check')).toHaveLength(1));
});
it('renders an empty state', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: [] })));
  render(<App />);
  expect(await screen.findByText('No monitors are configured yet.')).toBeTruthy();
});
it.each(['http', 'network'])('renders an error for %s failure', async (failure) => {
  const client = vi.fn();
  if (failure === 'http') client.mockResolvedValue(new Response('Internal server error', { status: 500 }));
  else client.mockRejectedValue(new TypeError('Network unavailable'));
  vi.stubGlobal('fetch', client);
  render(<App />);
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load monitors');
});
it('aborts its request on unmount', () => {
  const client = vi.fn().mockImplementation((_path, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  vi.stubGlobal('fetch', client);
  const { unmount } = render(<App />);
  unmount();
  expect(client.mock.calls[0][1].signal.aborted).toBe(true);
});
