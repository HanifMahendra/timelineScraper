'use client';

import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';

export type AppTheme = 'glass';

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const THEME_KEY = 'my-timeline-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_VALUE: ThemeContextValue = {
  theme: 'glass',
  setTheme: () => undefined,
  toggleTheme: () => undefined,
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.theme = 'glass';
    try {
      window.localStorage.setItem(THEME_KEY, 'glass');
    } catch {
      // The single active theme still works when browser storage is unavailable.
    }
  }, []);

  return (
    <ThemeContext.Provider value={THEME_VALUE}>
      <div className="theme-root">{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
