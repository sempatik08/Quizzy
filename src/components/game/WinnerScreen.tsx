'use client';

import { useRouter } from 'next/navigation';
import { Trophy } from 'lucide-react';
import type { Room } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface WinnerScreenProps {
  room: Room;
  playerId: string;
}

export function WinnerScreen({ room, playerId }: WinnerScreenProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const myTeam = room.players[playerId]?.team;

  const winner =
    room.teams.blue.score >= 100
      ? 'blue'
      : room.teams.red.score >= 100
      ? 'red'
      : null;

  if (!winner) return null;

  const isWinner = myTeam === winner;
  const isBlue   = winner === 'blue';

  const handleBackToHome = () => {
    sessionStorage.removeItem(`quizzy_player_${room.code}`);
    router.push('/');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-quizzy-card rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center animate-slide-up">
        {/* Trophy */}
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
            isBlue ? 'bg-blue-pale' : 'bg-red-pale'
          }`}
        >
          <Trophy size={36} className={isBlue ? 'text-blue-soft' : 'text-red-soft'} />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-extrabold text-quizzy-text mb-1">
          {isWinner ? t.youWon : t.gameOver}
        </h2>
        <p className={`font-bold text-lg capitalize mb-6 ${isBlue ? 'text-blue-soft' : 'text-red-soft'}`}>
          {isBlue ? t.blueTeam : t.redTeam} {t.teamWins}
        </p>

        {/* Scores */}
        <div className="flex justify-center gap-10 mb-6">
          {(['blue', 'red'] as const).map((team) => (
            <div key={team} className="text-center">
              <div className={`text-4xl font-extrabold ${team === 'blue' ? 'text-blue-soft' : 'text-red-soft'}`}>
                {room.teams[team].score}
              </div>
              <div className="text-xs text-quizzy-muted font-medium capitalize mt-1">
                {team === 'blue' ? t.blueTeamLabel : t.redTeamLabel}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleBackToHome}
          className="w-full py-3 rounded-xl bg-quizzy-text text-quizzy-card font-semibold hover:opacity-80 active:scale-95 transition-all"
        >
          {t.backToHome}
        </button>
      </div>
    </div>
  );
}
