'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Zap } from 'lucide-react';
import { useGame } from '@/hooks/useGame';
import { ScoreBoard } from '@/components/game/ScoreBoard';
import { QuestionCard } from '@/components/game/QuestionCard';
import { VotingTimer } from '@/components/game/VotingTimer';
import { WinnerScreen } from '@/components/game/WinnerScreen';
import { SurrenderPanel } from '@/components/game/SurrenderPanel';
import { RoomCodeBadge } from '@/components/shared/RoomCodeBadge';
import { CategoryPicker } from '@/components/lobby/CategoryPicker';
import { useLanguage } from '@/context/LanguageContext';

export default function GamePage() {
  const params = useParams();
  const roomCode = (params.roomCode as string).toUpperCase();
  const router = useRouter();
  const { t } = useLanguage();

  const {
    room,
    playerId,
    myTeam,
    isCaptain,
    timeLeft,
    answerReveal,
    isMyTurn,
    gameError,
    actions,
  } = useGame(roomCode);

  // Guard: redirect if no session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pid = sessionStorage.getItem(`quizzy_player_${roomCode}`);
      if (!pid) router.replace('/');
    }
  }, [roomCode, router]);

  // If game goes back to lobby phase, redirect (but NOT for mid-game category pick)
  useEffect(() => {
    if (room?.phase === 'lobby' || room?.phase === 'coin_toss') {
      router.replace(`/lobby/${roomCode}`);
    }
  }, [room?.phase, roomCode, router]);

  if (!room || !playerId) {
    return (
      <div className="min-h-screen bg-quizzy-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-quizzy-muted" size={32} />
      </div>
    );
  }

  const categoryLabel: Record<string, string> = {
    general:    t.generalCulture,
    sports:     t.sports,
    history:    t.history,
    music:      t.music,
    cinema:     t.cinema,
    anime:      t.anime,
    games:      t.games,
    technology: t.technology,
    literature: t.literature,
    math:       t.math,
    geography:  t.geography,
    cinema_music: t.cinemaMusic,
  };

  const teamAccent = myTeam === 'blue'
    ? { bg: 'bg-blue-pale', border: 'border-blue-light', text: 'text-blue-soft', label: t.blueTeam }
    : myTeam === 'red'
    ? { bg: 'bg-red-pale', border: 'border-red-light', text: 'text-red-soft', label: t.redTeam }
    : { bg: 'bg-quizzy-bg', border: 'border-transparent', text: 'text-quizzy-muted', label: '' };

  const activeTeamLabel = room.activeTeam === 'blue' ? t.blueTeam : t.redTeam;

  return (
    <main className="min-h-screen bg-quizzy-bg px-4 py-6 flex flex-col items-center">
      {/* Team color banner */}
      {myTeam && (
        <div className={`w-full ${teamAccent.bg} border-b ${teamAccent.border} py-1.5 mb-4 text-center text-xs font-bold uppercase tracking-widest ${teamAccent.text}`}>
          {teamAccent.label}
        </div>
      )}

      {/* Top bar */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Zap size={18} className={myTeam === 'red' ? 'text-red-soft' : 'text-blue-soft'} fill={myTeam === 'red' ? '#FF6B6B' : '#4D96FF'} />
          <span className="font-extrabold text-lg text-quizzy-text">Quizzy</span>
          {room.selectedCategory && (
            <span className="text-xs text-quizzy-muted bg-quizzy-card border border-quizzy-border rounded-full px-2.5 py-0.5 ml-1 font-medium">
              {categoryLabel[room.selectedCategory] ?? room.selectedCategory}
            </span>
          )}
        </div>
        <RoomCodeBadge code={roomCode} />
      </div>

      {/* Error */}
      {gameError && (
        <div className="w-full max-w-2xl mb-4 px-4 py-3 rounded-xl bg-red-pale border border-red-light text-red-soft text-sm font-medium flex items-center justify-between">
          <span>{gameError}</span>
          <button onClick={actions.clearErrors} className="ml-4 text-xs underline">{t.dismiss}</button>
        </div>
      )}

      {/* Scoreboard */}
      <div className="w-full max-w-2xl mb-5">
        <ScoreBoard room={room} playerId={playerId} />
      </div>

      {/* Mid-game category pick */}
      {room.phase === 'category_pick' && room.categoryPickTeam && (
        <div className="w-full max-w-2xl mb-5">
          <div className="bg-quizzy-card rounded-2xl shadow-card border border-quizzy-border p-6 animate-fade-in">
            <div className="text-center mb-4">
              <p className="text-sm font-semibold text-quizzy-muted uppercase tracking-widest">
                {t.categoryExhausted}
              </p>
              <p className="text-xs text-quizzy-subtle mt-1">{t.lowerScoreTeamPicks}</p>
            </div>
            <CategoryPicker
              winnerTeam={room.categoryPickTeam}
              isCaptain={isCaptain && room.teams[room.categoryPickTeam].captain === playerId}
              onPick={actions.pickCategory}
              usedCategories={[
                ...(room.usedCategories ?? []),
                ...(room.selectedCategory && !(room.usedCategories ?? []).includes(room.selectedCategory)
                  ? [room.selectedCategory]
                  : []),
              ]}
            />
          </div>
        </div>
      )}

      {/* Question + Timer row */}
      {room.phase === 'question' && room.activeQuestion && (
        <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-4 items-start">
          <div className="flex-1">
            <QuestionCard
              room={room}
              playerId={playerId}
              isMyTurn={isMyTurn}
              answerReveal={answerReveal}
              onVote={actions.castVote}
              onFinalize={actions.finalizeVote}
            />
          </div>

          <div className="sm:mt-6 flex sm:flex-col items-center gap-3 sm:sticky sm:top-6">
            {/* Hide timer while answer is being revealed */}
            {!answerReveal && <VotingTimer timeLeft={timeLeft} />}

            {/* Active turn label */}
            {room.activeTeam && (
              <span
                className={`text-[11px] font-bold uppercase tracking-wide ${
                  isMyTurn
                    ? teamAccent.text
                    : room.activeTeam === 'blue' ? 'text-blue-soft' : 'text-red-soft'
                }`}
              >
                {isMyTurn ? t.yourTurn : `${activeTeamLabel} ${t.teamsTurn}`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Surrender panel — visible during active game */}
      {room.phase === 'question' && myTeam && (
        <div className="w-full max-w-2xl mt-4">
          <SurrenderPanel
            room={room}
            playerId={playerId}
            myTeam={myTeam}
            onInitiate={actions.initiateSurrender}
            onVote={actions.voteSurrender}
          />
        </div>
      )}

      {/* Winner screen overlay */}
      {room.phase === 'finished' && (
        <WinnerScreen room={room} playerId={playerId} />
      )}
    </main>
  );
}
