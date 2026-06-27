'use client';

import { useLanguage } from '@/context/LanguageContext';
import { ThemeSwitcher } from './ThemeSwitcher';

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="fixed top-4 left-4 z-50 flex items-center gap-2">
      <ThemeSwitcher />

      <div className="flex items-center gap-0.5 bg-quizzy-card border border-quizzy-border rounded-xl shadow-sm p-1">
        <button
          onClick={() => setLanguage('en')}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            language === 'en'
              ? 'bg-quizzy-text text-quizzy-card'
              : 'text-quizzy-muted hover:bg-quizzy-border'
          }`}
          aria-label="Switch to English"
        >
          EN
        </button>
        <button
          onClick={() => setLanguage('tr')}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            language === 'tr'
              ? 'bg-quizzy-text text-quizzy-card'
              : 'text-quizzy-muted hover:bg-quizzy-border'
          }`}
          aria-label="Türkçeye geç"
        >
          TR
        </button>
      </div>
    </div>
  );
}
