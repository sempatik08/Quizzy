'use client';

import type { TeamColor } from '@/types';
import { Zap } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface StealBannerProps {
  stealTeam: TeamColor;
}

export function StealBanner({ stealTeam }: StealBannerProps) {
  const { t } = useLanguage();
  const isBlue = stealTeam === 'blue';
  const teamLabel = isBlue ? t.blueTeam : t.redTeam;

  return (
    <div
      className={`w-full rounded-xl px-5 py-3 flex items-center gap-3 animate-slide-up ${
        isBlue ? 'bg-blue-pale border-2 border-blue-soft' : 'bg-red-pale border-2 border-red-soft'
      }`}
    >
      <Zap
        size={18}
        className={isBlue ? 'text-blue-soft' : 'text-red-soft'}
        fill={isBlue ? '#4D96FF' : '#FF6B6B'}
      />
      <div>
        <p className={`font-bold text-sm ${isBlue ? 'text-blue-soft' : 'text-red-soft'}`}>
          {t.stealOpportunity}
        </p>
        <p className="text-xs text-quizzy-muted">
          <span className={`font-semibold capitalize ${isBlue ? 'text-blue-soft' : 'text-red-soft'}`}>
            {teamLabel}
          </span>{' '}
          {t.stealCanSteal}{' '}
          <span className="font-bold text-quizzy-text">{t.stealPts}</span>
        </p>
      </div>
    </div>
  );
}
