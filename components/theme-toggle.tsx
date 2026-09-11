'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
type Theme = 'system' | 'light' | 'dark';
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const read = () => {
      const value = document.documentElement.dataset.theme;
      const current: Theme =
        value === 'light' || value === 'dark' ? value : 'system';
      setTheme(current);
      document.documentElement.classList.toggle(
        'dark',
        current === 'dark' || (current === 'system' && media.matches),
      );
    };
    read();
    window.addEventListener('hp-theme', read);
    media.addEventListener('change', read);
    return () => {
      window.removeEventListener('hp-theme', read);
      media.removeEventListener('change', read);
    };
  }, []);
  const next =
    theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      title={`Theme: ${theme}. Switch to ${next}`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem('hp-theme', next);
        } catch {
          /* Device preference can still change in memory. */
        }
        setTheme(next);
        window.dispatchEvent(new Event('hp-theme'));
      }}
    >
      {theme === 'dark' ? (
        <Moon size={17} />
      ) : theme === 'light' ? (
        <Sun size={17} />
      ) : (
        <Monitor size={17} />
      )}
      <span>{theme[0].toUpperCase() + theme.slice(1)}</span>
    </button>
  );
}
