'use client';

import { Sparkles, Zap } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={`theme-switcher ${compact ? 'theme-switcher-compact' : ''}`} aria-label="Pilih tema">
      <button
        type="button"
        aria-pressed={theme === 'anime'}
        onClick={() => setTheme('anime')}
        className="theme-switcher-button"
      >
        <Sparkles aria-hidden="true" size={compact ? 14 : 15} />
        {!compact && <span>Anime</span>}
      </button>
      <button
        type="button"
        aria-pressed={theme === 'cyberpunk'}
        onClick={() => setTheme('cyberpunk')}
        className="theme-switcher-button"
      >
        <Zap aria-hidden="true" size={compact ? 14 : 15} />
        {!compact && <span>Cyberpunk</span>}
      </button>
    </div>
  );
}
