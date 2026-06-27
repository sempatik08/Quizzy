'use client';

import { BookOpen, Dumbbell, Scroll, Music, Film, Sword, Gamepad2, Cpu, Feather, Calculator, Globe } from 'lucide-react';
import type { Category, TeamColor } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface CategoryPickerProps {
  winnerTeam: TeamColor;
  isCaptain: boolean;
  onPick: (category: Category) => void;
  usedCategories?: Category[];
}

export function CategoryPicker({ winnerTeam, isCaptain, onPick, usedCategories = [] }: CategoryPickerProps) {
  const { t } = useLanguage();

  const CATEGORIES: { key: Category; label: string; icon: React.ReactNode; description: string }[] = [
    { key: 'general',    label: t.generalCulture, icon: <BookOpen size={20} />,    description: t.generalDesc },
    { key: 'sports',     label: t.sports,          icon: <Dumbbell size={20} />,   description: t.sportsDesc },
    { key: 'history',    label: t.history,         icon: <Scroll size={20} />,     description: t.historyDesc },
    { key: 'music',      label: t.music,           icon: <Music size={20} />,      description: t.musicDesc },
    { key: 'cinema',     label: t.cinema,          icon: <Film size={20} />,       description: t.cinemaDesc },
    { key: 'anime',      label: t.anime,           icon: <Sword size={20} />,      description: t.animeDesc },
    { key: 'games',      label: t.games,           icon: <Gamepad2 size={20} />,   description: t.gamesDesc },
    { key: 'technology', label: t.technology,      icon: <Cpu size={20} />,        description: t.technologyDesc },
    { key: 'literature', label: t.literature,      icon: <Feather size={20} />,    description: t.literatureDesc },
    { key: 'math',       label: t.math,            icon: <Calculator size={20} />, description: t.mathDesc },
    { key: 'geography',  label: t.geography,       icon: <Globe size={20} />,      description: t.geographyDesc },
  ];

  const accent      = winnerTeam === 'blue' ? 'text-blue-soft'   : 'text-red-soft';
  const teamLabel   = winnerTeam === 'blue' ? t.blueTeam         : t.redTeam;
  const hoverBorder = winnerTeam === 'blue' ? 'hover:border-blue-soft' : 'hover:border-red-soft';
  const hoverBg     = winnerTeam === 'blue' ? 'hover:bg-blue-pale'     : 'hover:bg-red-pale';

  return (
    <div className="animate-slide-up">
      <div className="text-center mb-5">
        <p className="text-sm text-quizzy-muted uppercase tracking-widest font-semibold mb-1">
          {t.categorySelection}
        </p>
        {isCaptain ? (
          <p className={`font-bold text-base ${accent}`}>{t.pickCategory}</p>
        ) : (
          <p className="text-quizzy-muted text-sm">
            {t.waitingCaptain}{' '}
            <span className={`font-semibold ${accent}`}>{teamLabel}</span>{' '}
            {t.captainToChoose}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CATEGORIES.map((cat) => {
          const isUsed     = usedCategories.includes(cat.key);
          const isDisabled = !isCaptain || isUsed;
          return (
            <button
              key={cat.key}
              onClick={() => !isDisabled && onPick(cat.key)}
              disabled={isDisabled}
              className={`relative flex flex-col items-start gap-2 p-3 rounded-xl border-2 border-quizzy-border bg-quizzy-card text-left transition-all shadow-card ${
                isUsed
                  ? 'cursor-not-allowed opacity-40 line-through'
                  : isCaptain
                  ? `cursor-pointer ${hoverBorder} ${hoverBg} hover:shadow-card-hover`
                  : 'cursor-not-allowed opacity-60'
              }`}
            >
              <span className={`${isUsed ? 'text-quizzy-muted' : accent}`}>{cat.icon}</span>
              <div>
                <p className="font-semibold text-xs text-quizzy-text leading-tight">{cat.label}</p>
                <p className="text-[10px] text-quizzy-muted mt-0.5 leading-tight">{cat.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
