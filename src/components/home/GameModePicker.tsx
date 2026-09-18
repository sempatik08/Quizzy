'use client';

import { Timer, Zap, HeartCrack, Coins } from 'lucide-react';
import type { GameModeKey } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { MODE_WIN_THRESHOLD } from '@/lib/gameModes';

interface GameModePickerProps {
  value: GameModeKey;
  onChange: (mode: GameModeKey) => void;
}

/**
 * Mode selection at room creation (PBI 9).
 *
 * Every option states its actual numbers rather than a vibe, because the mode
 * changes the clock and the target score and a player who picks blind will be
 * surprised mid-match. Survival also states its player requirement up front —
 * the server refuses to start a 1v1 Survival match, and discovering that at the
 * Lock Teams button would be worse than reading it here.
 */
export function GameModePicker({ value, onChange }: GameModePickerProps) {
  const { t } = useLanguage();

  const modes: Array<{
    key: GameModeKey;
    icon: React.ReactNode;
    label: string;
    desc: string;
    note?: string;
  }> = [
    {
      key: 'classic',
      icon: <Zap size={14} />,
      label: t.modeClassic,
      desc: t.modeClassicDesc.replace('{n}', String(MODE_WIN_THRESHOLD.classic)),
    },
    {
      key: 'fast',
      icon: <Timer size={14} />,
      label: t.modeFast,
      desc: t.modeFastDesc.replace('{n}', String(MODE_WIN_THRESHOLD.fast)),
    },
    {
      key: 'survival',
      icon: <HeartCrack size={14} />,
      label: t.modeSurvival,
      desc: t.modeSurvivalDesc,
      note: t.modeSurvivalNeeds,
    },
    { key: 'wager', icon: <Coins size={14} />, label: t.modeWager, desc: t.modeWagerDesc },
  ];

  return (
    <fieldset>
      <legend className="block text-sm font-semibold text-quizzy-text mb-1.5">
        {t.gameMode}
      </legend>
      <div id="game-mode-picker" className="grid grid-cols-2 gap-2">
        {modes.map((m) => {
          const selected = value === m.key;
          return (
            <button
              key={m.key}
              type="button"
              data-mode={m.key}
              aria-pressed={selected}
              onClick={() => onChange(m.key)}
              // Hover must move the BACKGROUND, not just the border: a border-only
              // change is easy to miss on a card-sized target, and the selected
              // option needs feedback too or it reads as already disabled.
              className={`text-left px-3 py-2.5 rounded-xl border transition-colors ${
                selected
                  ? 'border-blue-soft bg-blue-pale hover:bg-blue-light'
                  : 'border-quizzy-border bg-quizzy-card hover:border-quizzy-muted hover:bg-quizzy-bg'
              }`}
            >
              <span
                className={`flex items-center gap-1.5 text-sm font-semibold ${
                  selected ? 'text-blue-soft' : 'text-quizzy-text'
                }`}
              >
                {m.icon}
                {m.label}
              </span>
              <span className="block text-[11px] text-quizzy-muted leading-tight mt-0.5">
                {m.desc}
              </span>
              {m.note && (
                <span className="block text-[10px] text-quizzy-muted leading-tight mt-0.5 italic">
                  {m.note}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
