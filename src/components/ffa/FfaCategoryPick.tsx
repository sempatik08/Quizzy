'use client';

import { useEffect, useState } from 'react';
import type { Category, Room } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { CategoryPicker } from '@/components/lobby/CategoryPicker';

interface FfaCategoryPickProps {
  room: Room;
  playerId: string;
  onPick: (category: Category) => void;
}

/**
 * Category choice in free-for-all (PBI 19). One named player picks; everyone
 * else sees who, and how long until the server picks at random instead.
 *
 * If the picker has dropped, the server accepts any connected player's pick,
 * so the buttons open up for everyone in that case too.
 */
export function FfaCategoryPick({ room, playerId, onPick }: FfaCategoryPickProps) {
  const { t } = useLanguage();
  const ffa = room.ffa;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(handle);
  }, []);

  if (!ffa) return null;

  const picker = ffa.picker ? room.players[ffa.picker] : null;
  const pickerGone = !picker || !picker.isConnected;
  const iAmPlaying = Boolean(ffa.players[playerId]);
  const canPick = iAmPlaying && (ffa.picker === playerId || pickerGone);
  const secondsLeft = ffa.pickDeadline ? Math.max(0, Math.ceil((ffa.pickDeadline - now) / 1000)) : null;
  const isFirstPick = ffa.questionNumber === 0;

  return (
    <div id="ffa-category-pick" className="bg-quizzy-card rounded-2xl shadow-card border border-quizzy-border p-6 animate-fade-in">
      {!isFirstPick && (
        <p className="text-center text-xs text-quizzy-muted mb-3">{t.ffaLastPlacePicks}</p>
      )}
      <CategoryPicker
        winnerTeam="blue"
        isCaptain={canPick}
        onPick={onPick}
        usedCategories={room.usedCategories ?? []}
        waitingText={t.ffaPicks.replace('{name}', picker?.name ?? '…')}
        pickText={t.ffaYouPick}
      />
      {secondsLeft !== null && (
        <p className="text-center text-xs text-quizzy-muted mt-4" aria-live="polite">
          {t.ffaPickAuto.replace('{s}', String(secondsLeft))}
        </p>
      )}
    </div>
  );
}
