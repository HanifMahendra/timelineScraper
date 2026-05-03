'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export type AppTheme = 'anime' | 'cyberpunk';

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const THEME_KEY = 'my-timeline-theme';
const THEME_EVENT = 'my-timeline-theme-change';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function getStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'anime';
  return window.localStorage.getItem(THEME_KEY) === 'cyberpunk' ? 'cyberpunk' : 'anime';
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(THEME_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(THEME_EVENT, callback);
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<AppTheme>(subscribeToTheme, getStoredTheme, () => 'anime');

  const setTheme = useCallback((nextTheme: AppTheme) => {
    window.localStorage.setItem(THEME_KEY, nextTheme);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    return {
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === 'anime' ? 'cyberpunk' : 'anime'),
    };
  }, [setTheme, theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
