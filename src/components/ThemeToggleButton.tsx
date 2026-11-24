import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../state/ThemeContext';

export function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="pfl-focus-ring flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent transition-opacity hover:opacity-85"
      style={{ color: 'var(--ink-on-shell)' }}
    >
      {isDark ? <Sun size={20} strokeWidth={2.2} aria-hidden="true" /> : <Moon size={20} strokeWidth={2.2} aria-hidden="true" />}
    </button>
  );
}
