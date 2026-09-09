'use client';

import type { TeamColor } from '@/types';
import { Zap, SkipForward } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface StealBannerProps {
  stealTeam: TeamColor;
  /** Charges the stealing team has left, including the one at stake. */
  chargesLeft: number;
  /** True when the viewer is on the stealing team. */
  isMyStealTurn: boolean;
  onPass: () => void;
  /** Disable the pass button once the answer is locked in. */
  passDisabled?: boolean;
}

export function StealBanner({
  stealTeam,
  chargesLeft,
  isMyStealTurn,
  onPass,
  passDisabled = false,
}: StealBannerProps) {
  const { t } = useLanguage();
  const isBlue = stealTeam === 'blue';
  const teamLabel = isBlue ? t.blueTeam : t.redTeam;

  const accentText = isBlue ? 'text-blue-soft' : 'text-red-soft';
  const accentFill = isBlue ? '#4D96FF' : '#FF6B6B';

  return (
    <div
      className={`w-full rounded-xl px-5 py-3 animate-slide-up ${
        isBlue ? 'bg-blue-pale border-2 border-blue-soft' : 'bg-red-pale border-2 border-red-soft'
      }`}
    >
      <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
        <Zap size={18} className={`${accentText} mt-0.5 shrink-0`} fill={accentFill} />

        <div className="min-w-0 flex-1">
          <p className={`font-bold text-sm ${accentText}`}>{t.stealOpportunity}</p>
          <p className="text-xs text-quizzy-muted">
            <span className={`font-semibold capitalize ${accentText}`}>{teamLabel}</span>{' '}
            {t.stealCanSteal} <span className="font-bold text-quizzy-text">{t.stealPts}</span>
          </p>
        </div>

        {/* Remaining charges */}
        <span
          className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${
            isBlue ? 'bg-blue-soft text-white' : 'bg-red-soft text-white'
          }`}
        >
          {chargesLeft} {t.stealLeft}
        </span>
      </div>

      {isMyStealTurn && (
        <div className="mt-3 pt-3 border-t border-quizzy-border/60 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-quizzy-muted flex-1 min-w-[12rem]">{t.stealPassHint}</p>
          <button
            onClick={onPass}
            disabled={passDisabled}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-quizzy-border bg-quizzy-card text-quizzy-text hover:bg-quizzy-bg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            <SkipForward size={13} />
            {t.stealPass}
          </button>
        </div>
      )}
    </div>
  );
}
