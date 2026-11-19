'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export type AppTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const THEME_KEY = 'my-timeline-theme';
const THEME_CHANGE_EVENT = 'my-timeline-theme-change';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): AppTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredOverride(): AppTheme | null {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function applyTheme(override: AppTheme | null) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) meta.content = override ?? 'light dark';
  const resolved = override ?? getSystemTheme();
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function subscribeToTheme(callback: () => void) {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const handleSystemChange = () => {
    // Only follow OS changes when no explicit user override is stored.
    if (!getStoredOverride()) {
      applyTheme(null);
    }
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) {
      applyTheme(getStoredOverride());
    }
  };

  window.addEventListener(THEME_CHANGE_EVENT, callback);
  window.addEventListener('storage', handleStorage);
  media?.addEventListener('change', handleSystemChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
    window.removeEventListener('storage', handleStorage);
    media?.removeEventListener('change', handleSystemChange);
  };
}

function getThemeSnapshot(): AppTheme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<AppTheme>(subscribeToTheme, getThemeSnapshot, () => 'light');

  const setTheme = useCallback((nextTheme: AppTheme) => {
    const matchesSystem = nextTheme === getSystemTheme();
    const override = matchesSystem ? null : nextTheme;
    applyTheme(override);
    try {
      if (override) {
        window.localStorage.setItem(THEME_KEY, override);
      } else {
        // Reverting to the current OS scheme clears the override so the site follows system again.
        window.localStorage.removeItem(THEME_KEY);
      }
    } catch {
      // Keep the theme for this session even if browser storage is unavailable.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [setTheme, theme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <div className="theme-root">{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
