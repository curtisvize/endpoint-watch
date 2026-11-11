import { useEffect, useState } from 'react';
import { applyAppearance, DARK_MEDIA_QUERY, isAppearance, readAppearance, saveAppearance } from '../theme';

export function ThemeSelector() {
  const [preference, setPreference] = useState(readAppearance);
  useEffect(() => {
    const media = window.matchMedia?.(DARK_MEDIA_QUERY);
    const update = () => applyAppearance(preference, media?.matches ?? false);
    update();
    if (preference !== 'system') return;
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, [preference]);

  return <label className="theme-selector">
    Appearance
    <span className="theme-select-control">
      <select value={preference} onChange={(event) => {
        const next = event.target.value;
        if (!isAppearance(next)) return;
        saveAppearance(next);
        setPreference(next);
      }}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </span>
  </label>;
}
