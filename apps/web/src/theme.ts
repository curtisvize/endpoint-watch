export type Appearance = 'system' | 'light' | 'dark';
export const APPEARANCE_STORAGE_KEY = 'endpoint-watch-appearance';
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function isAppearance(value: unknown): value is Appearance {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readAppearance(): Appearance {
  try {
    const saved = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return isAppearance(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function saveAppearance(preference: Appearance): void {
  try { window.localStorage.setItem(APPEARANCE_STORAGE_KEY, preference); } catch {
    // The current-page preference still works when storage is blocked or full.
  }
}

export function applyAppearance(preference: Appearance, systemDark: boolean): void {
  document.documentElement.dataset.theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}
