import html from '../../index.html?raw';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeSelector } from './ThemeSelector';
import { APPEARANCE_STORAGE_KEY, DARK_MEDIA_QUERY } from '../theme';

beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; });
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  localStorage.clear(); delete document.documentElement.dataset.theme;
});

function systemAppearance(dark = false) {
  let matches = dark;
  const listeners = new Set<() => void>();
  const media = {
    get matches() { return matches; },
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  return { media, listeners, change(value: boolean) {
    matches = value;
    act(() => { for (const listener of listeners) listener(); });
  } };
}

it.each([false, true])('defaults to System with dark=%s and follows system changes', (dark) => {
  const system = systemAppearance(dark);
  render(<ThemeSelector />);
  expect((screen.getByRole('combobox', { name: 'Appearance' }) as HTMLSelectElement).value).toBe('system');
  expect(document.documentElement.dataset.theme).toBe(dark ? 'dark' : 'light');
  expect(window.matchMedia).toHaveBeenCalledWith(DARK_MEDIA_QUERY);
  system.change(!dark);
  expect(document.documentElement.dataset.theme).toBe(dark ? 'light' : 'dark');
});

it.each(['light', 'dark'])('persists explicit %s, survives remount, and ignores system changes', (preference) => {
  const system = systemAppearance();
  const first = render(<ThemeSelector />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Appearance' }), { target: { value: preference } });
  expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe(preference);
  expect(document.documentElement.dataset.theme).toBe(preference);
  system.change(true);
  system.change(false);
  expect(document.documentElement.dataset.theme).toBe(preference);
  first.unmount();
  render(<ThemeSelector />);
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe(preference);
  expect(document.documentElement.dataset.theme).toBe(preference);
});

it('switches back to System and cleans up change listeners', () => {
  const system = systemAppearance(true);
  localStorage.setItem(APPEARANCE_STORAGE_KEY, 'light');
  const { unmount } = render(<ThemeSelector />);
  expect(system.listeners.size).toBe(0);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'system' } });
  expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('system');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(system.listeners.size).toBe(1);
  unmount();
  expect(system.listeners.size).toBe(0);
  expect(system.media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
});

it.each(['invalid', 'DARK', '', '{"theme":"dark"}'])('falls back to System for invalid storage %s', (saved) => {
  systemAppearance(true);
  localStorage.setItem(APPEARANCE_STORAGE_KEY, saved);
  render(<ThemeSelector />);
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('system');
  expect(document.documentElement.dataset.theme).toBe('dark');
});

it('works for the current page when storage reads and writes fail', () => {
  systemAppearance(true);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  render(<ThemeSelector />);
  expect(document.documentElement.dataset.theme).toBe('dark');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'light' } });
  expect(document.documentElement.dataset.theme).toBe('light');
});

it.each([
  [null, true, 'dark'], ['light', true, 'light'], ['dark', false, 'dark'],
  ['invalid', false, 'light'], ['system', true, 'dark'],
] as const)('initial head script resolves saved=%s and system dark=%s before React mounts', (saved, dark, expected) => {
  systemAppearance(dark);
  if (saved !== null) localStorage.setItem(APPEARANCE_STORAGE_KEY, saved);
  const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  new Function('localStorage', 'window', 'document', bootstrap)(localStorage, window, document);
  expect(document.documentElement.dataset.theme).toBe(expected);
});

it('initial head script tolerates blocked storage and a missing media-query API', () => {
  vi.stubGlobal('matchMedia', undefined);
  const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const storage = { getItem() { throw new Error('Blocked'); } };
  new Function('localStorage', 'window', 'document', bootstrap)(storage, window, document);
  expect(document.documentElement.dataset.theme).toBe('light');
  render(<ThemeSelector />);
  expect(document.documentElement.dataset.theme).toBe('light');
});
