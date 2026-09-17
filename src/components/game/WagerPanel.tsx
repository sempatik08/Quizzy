'use client';

import { Coins, EyeOff } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface WagerPanelProps {
  /** Stakes the mode allows. */
  options: number[];
  /** True when this viewer is the captain who must choose. */
  canPlace: boolean;
  onPlace: (amount: number) => void;
}

/**
 * The blind stake step in Wager mode (PBI 9).
 *
 * The question genuinely is not on the client yet — the server blanks its text
 * and options in room state while the stake is outstanding — so this panel is
 * all there is to look at, and it says so rather than leaving a blank card
 * looking like a loading failure.
 */
export function WagerPanel({ options, canPlace, onPlace }: WagerPanelProps) {
  const { t } = useLanguage();

  return (
    <div
      id="wager-panel"
      className="w-full bg-quizzy-card border border-quizzy-border rounded-2xl p-5 shadow-card animate-pop-in"
    >
      <div className="flex items-center gap-2 mb-1">
        <Coins size={17} className="text-amber-500" />
        <p className="text-sm font-bold text-quizzy-text">
          {canPlace ? t.wagerTitle : t.wagerWaiting}
        </p>
      </div>
      <p className="text-xs text-quizzy-muted mb-4">
        {canPlace ? t.wagerHint : t.wagerCaptainOnly}
      </p>

      <div className="flex items-center gap-1.5 text-xs text-quizzy-muted mb-4 px-3 py-2 rounded-xl bg-quizzy-bg border border-quizzy-border">
        <EyeOff size={13} className="shrink-0" />
        {t.questionHidden}
      </div>

      {canPlace && (
        <div className="flex gap-2">
          {options.map((amount) => (
            <button
              key={amount}
              type="button"
              data-wager={amount}
              onClick={() => onPlace(amount)}
              className="flex-1 py-3 rounded-xl border border-quizzy-border bg-quizzy-bg font-bold text-quizzy-text hover:border-amber-400 hover:bg-amber-50 active:scale-95 transition-all"
            >
              {amount}
              <span className="block text-[10px] font-normal text-quizzy-muted">
                {t.pts}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
