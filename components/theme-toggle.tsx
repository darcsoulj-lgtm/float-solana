'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
type Theme = 'system' | 'light' | 'dark';
const themes = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;
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
  return (
    <ToggleGroup
      className="theme-choices"
      aria-label="Appearance"
      value={[theme]}
      onValueChange={(values) => {
        const next = values[0];
        if (next !== 'light' && next !== 'dark' && next !== 'system') return;
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem('hp-theme', next);
        } catch {
          /* Keep the preference in memory. */
        }
        setTheme(next);
        window.dispatchEvent(new Event('hp-theme'));
      }}
    >
      {themes.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={`${label} mode`}
          title={`${label} mode`}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
