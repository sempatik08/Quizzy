'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { useSound } from '@/context/SoundContext';
import { useLanguage } from '@/context/LanguageContext';

/** Mute toggle, parked next to the theme and language switchers (PBI 15). */
export function SoundSwitcher() {
  const { enabled, toggle } = useSound();
  const { t } = useLanguage();

  return (
    <button
      id="sound-toggle"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? t.soundOn : t.soundOff}
      title={enabled ? t.soundOn : t.soundOff}
      className="flex items-center justify-center w-8 h-8 bg-quizzy-card border border-quizzy-border rounded-xl shadow-sm text-quizzy-muted hover:text-quizzy-text hover:bg-quizzy-border transition-colors"
    >
      {enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
    </button>
  );
}
