'use client';

import { Sun, Moon, Eye, Monitor } from 'lucide-react';
import { useTheme, type Theme } from '@/context/ThemeContext';

const THEMES: { value: Theme; icon: React.ReactNode; label: string }[] = [
  { value: 'light',      icon: <Sun  size={13} />, label: 'Light'       },
  { value: 'dark',       icon: <Moon size={13} />, label: 'Dark'        },
  { value: 'colorblind', icon: <Eye  size={13} />, label: 'Color-blind' },
  { value: 'system',     icon: <Monitor size={13} />, label: 'System'   },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5 bg-quizzy-card border border-quizzy-border rounded-xl shadow-sm p-1">
      {THEMES.map(({ value, icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          aria-label={label}
          title={label}
          className={`p-1.5 rounded-lg transition-all ${
            theme === value
              ? 'bg-quizzy-text text-quizzy-card'
              : 'text-quizzy-muted hover:bg-quizzy-border'
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
