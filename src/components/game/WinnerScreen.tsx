'use client';

import { useRouter } from 'next/navigation';
import { Trophy, RotateCcw, Loader2, Check } from 'lucide-react';
import type { Room } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { Confetti } from './Confetti';

interface WinnerScreenProps {
  room: Room;
  playerId: string;
  /** My team has already agreed to a rematch (PBI 8). */
  myTeamWantsRematch: boolean;
  /** The opposing team has agreed and is waiting on mine. */
  opponentWantsRematch: boolean;
  onRematch: () => void;
}

export function WinnerScreen({
  room,
  playerId,
  myTeamWantsRematch,
  opponentWantsRematch,
  onRematch,
}: WinnerScreenProps) {
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

  // A player who never joined a team has nothing to consent to.
  const canRematch = Boolean(myTeam);

  const rematchStatus = myTeamWantsRematch
    ? t.rematchYourTeamReady
    : opponentWantsRematch
    ? t.rematchOpponentReady
    : t.rematchKeeps;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <Confetti team={winner} />
      <div className="bg-quizzy-card rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center animate-slide-up relative z-[61]">
        {/* Trophy */}
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
            isBlue ? 'bg-blue-pale' : 'bg-red-pale'
          }`}
        >
          <Trophy
            size={36}
            className={`animate-pop-in ${isBlue ? 'text-blue-soft' : 'text-red-soft'}`}
          />
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

        {/* Rematch (PBI 8) */}
        {canRematch && (
          <>
            <p
              id="rematch-status"
              className={`text-xs mb-3 font-medium ${
                opponentWantsRematch && !myTeamWantsRematch
                  ? 'text-quizzy-text'
                  : 'text-quizzy-muted'
              }`}
            >
              {rematchStatus}
            </p>

            <button
              id="rematch-button"
              onClick={onRematch}
              disabled={myTeamWantsRematch}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-soft text-white font-semibold hover:bg-blue-500 disabled:opacity-60 disabled:cursor-default active:scale-95 transition-all mb-2.5"
            >
              {myTeamWantsRematch ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  {t.rematchWaiting}
                </>
              ) : (
                <>
                  {opponentWantsRematch ? <Check size={17} /> : <RotateCcw size={17} />}
                  {t.playAgain}
                </>
              )}
            </button>
          </>
        )}

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
