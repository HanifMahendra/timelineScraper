'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

export default function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const nextThemeLabel = theme === 'light' ? 'gelap' : 'terang';

  return (
    <button
      type="button"
      className={`ghost-action theme-toggle${compact ? ' theme-toggle-compact' : ''}`}
      onClick={toggleTheme}
      aria-label={`Gunakan tema ${nextThemeLabel}`}
      title={`Gunakan tema ${nextThemeLabel}`}
    >
      {theme === 'light' ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
      {!compact && <span>{theme === 'light' ? 'Gelap' : 'Terang'}</span>}
    </button>
  );
}
