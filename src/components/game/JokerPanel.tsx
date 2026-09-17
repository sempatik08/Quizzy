'use client';

import { Scissors, Clock } from 'lucide-react';
import type { JokerState, JokerType, TeamColor } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface JokerPanelProps {
  team: TeamColor;
  jokers: JokerState;
  /** False disables both buttons and explains why via `reason`. */
  usable: boolean;
  reason: string;
  onUse: (type: JokerType) => void;
}

/**
 * The two joker buttons, shown only to the captain of the team whose turn it is
 * (PBI 6).
 *
 * Teammates see their team's remaining jokers in the ScoreBoard instead of
 * buttons they cannot press — a disabled control with no explanation reads as a
 * bug, and the server would refuse the click anyway.
 */
export function JokerPanel({ team, jokers, usable, reason, onUse }: JokerPanelProps) {
  const { t } = useLanguage();
  const accent = team === 'blue' ? 'text-blue-soft' : 'text-red-soft';

  const options: Array<{
    type: JokerType;
    available: boolean;
    icon: React.ReactNode;
    label: string;
    hint: string;
    id: string;
  }> = [
    {
      type: 'fifty_fifty',
      available: jokers.fiftyFifty,
      icon: <Scissors size={15} />,
      label: t.jokerFiftyFifty,
      hint: t.jokerFiftyFiftyHint,
      id: 'joker-fifty-fifty',
    },
    {
      type: 'extra_time',
      available: jokers.extraTime,
      icon: <Clock size={15} />,
      label: t.jokerExtraTime,
      hint: t.jokerExtraTimeHint,
      id: 'joker-extra-time',
    },
  ];

  const anyLeft = options.some((o) => o.available);

  return (
    <div
      id="joker-panel"
      className="w-full bg-quizzy-card border border-quizzy-border rounded-2xl p-3.5 shadow-card"
    >
      <div className="flex items-baseline justify-between mb-2.5">
        <p className={`text-xs font-bold uppercase tracking-widest ${accent}`}>{t.jokers}</p>
        {!anyLeft && <p className="text-[11px] text-quizzy-muted">{t.jokerNoneLeft}</p>}
      </div>

      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o.type}
            id={o.id}
            type="button"
            onClick={() => onUse(o.type)}
            disabled={!o.available || !usable}
            title={o.available ? (usable ? o.hint : reason) : t.jokerUsed}
            className="flex-1 flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border border-quizzy-border bg-quizzy-bg text-quizzy-text hover:border-quizzy-muted hover:bg-quizzy-card disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
          >
            <span className="flex items-center gap-1.5 font-semibold text-sm">
              {o.icon}
              {o.label}
            </span>
            <span className="text-[11px] text-quizzy-muted leading-tight">
              {o.available ? o.hint : t.jokerUsed}
            </span>
          </button>
        ))}
      </div>

      {anyLeft && !usable && (
        <p className="text-[11px] text-quizzy-muted mt-2">{reason}</p>
      )}
    </div>
  );
}
