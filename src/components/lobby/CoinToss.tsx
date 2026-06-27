'use client';

import { useEffect, useState } from 'react';
import type { TeamColor } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface CoinTossProps {
  winner: TeamColor | null;
}

export function CoinToss({ winner }: CoinTossProps) {
  const { t } = useLanguage();
  const [flipping, setFlipping] = useState(true);

  useEffect(() => {
    const tm = setTimeout(() => setFlipping(false), 1800);
    return () => clearTimeout(tm);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-6 animate-fade-in">
      <p className="text-sm font-semibold text-quizzy-muted uppercase tracking-widest">{t.coinToss}</p>

      {/* Coin */}
      <div
        className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl font-extrabold shadow-lg transition-all duration-300 ${
          flipping
            ? 'animate-spin-slow'
            : winner === 'blue'
            ? 'bg-blue-soft text-white'
            : 'bg-red-soft text-white'
        }`}
        style={{ willChange: 'transform' }}
      >
        {flipping ? '🪙' : winner === 'blue' ? 'B' : 'R'}
      </div>

      {!flipping && winner && (
        <div className="text-center animate-slide-up">
          <p className="text-lg font-bold text-quizzy-text capitalize">
            <span className={winner === 'blue' ? 'text-blue-soft' : 'text-red-soft'}>
              {winner === 'blue' ? t.blueTeam : t.redTeam}
            </span>{' '}
            {t.winsTheToss}
          </p>
          <p className="text-sm text-quizzy-muted mt-1">{t.captainPicksCategory}</p>
        </div>
      )}
    </div>
  );
}
