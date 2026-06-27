'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Lock, Loader2, Zap } from 'lucide-react';
import { useGame } from '@/hooks/useGame';
import { RoomCodeBadge } from '@/components/shared/RoomCodeBadge';
import { TeamPanel } from '@/components/lobby/TeamPanel';
import { CoinToss } from '@/components/lobby/CoinToss';
import { CategoryPicker } from '@/components/lobby/CategoryPicker';
import { useLanguage } from '@/context/LanguageContext';

export default function LobbyPage() {
  const params = useParams();
  const roomCode = (params.roomCode as string).toUpperCase();
  const router = useRouter();
  const { t } = useLanguage();

  const {
    room,
    playerId,
    isHost,
    isCaptain,
    actions,
    roomError,
    gameError,
  } = useGame(roomCode);

  // Redirect to home if no player session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pid = sessionStorage.getItem(`quizzy_player_${roomCode}`);
      if (!pid) router.replace('/');
    }
  }, [roomCode, router]);

  // Navigate to game when phase advances past lobby
  useEffect(() => {
    if (
      room?.phase === 'question' ||
      room?.phase === 'finished'
    ) {
      router.push(`/game/${roomCode}`);
    }
  }, [room?.phase, roomCode, router]);

  if (!room || !playerId) {
    return (
      <div className="min-h-screen bg-quizzy-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-quizzy-muted" size={32} />
      </div>
    );
  }

  const bothTeamsHavePlayers =
    room.teams.blue.players.length > 0 && room.teams.red.players.length > 0;

  return (
    <main className="min-h-screen bg-quizzy-bg px-4 py-8 flex flex-col items-center">
      {/* Top bar */}
      <div className="w-full max-w-3xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Zap size={20} className="text-blue-soft" fill="#4D96FF" />
          <span className="font-extrabold text-xl text-quizzy-text">Quizzy</span>
        </div>
        <RoomCodeBadge code={roomCode} />
      </div>

      {/* Error messages */}
      {(roomError || gameError) && (
        <div className="w-full max-w-3xl mb-4 px-4 py-3 rounded-xl bg-red-pale border border-red-light text-red-soft text-sm font-medium flex items-center justify-between">
          <span>{roomError || gameError}</span>
          <button onClick={actions.clearErrors} className="ml-4 text-xs underline">
            {t.dismiss}
          </button>
        </div>
      )}

      {/* Coin toss phase */}
      {room.phase === 'coin_toss' && (
        <div className="w-full max-w-md bg-quizzy-card rounded-2xl shadow-card border border-quizzy-border p-8 mb-6">
          <CoinToss winner={null} />
        </div>
      )}

      {/* Category pick phase */}
      {room.phase === 'category_pick' && room.coinTossWinner && (() => {
        const pickerTeam = room.categoryPickTeam ?? room.coinTossWinner;
        return (
          <div className="w-full max-w-md bg-quizzy-card rounded-2xl shadow-card border border-quizzy-border p-8 mb-6">
            <CoinToss winner={room.coinTossWinner} />
            <div className="mt-6 border-t border-quizzy-border pt-6">
              <CategoryPicker
                winnerTeam={pickerTeam}
                isCaptain={isCaptain && room.teams[pickerTeam].captain === playerId}
                onPick={actions.pickCategory}
                usedCategories={room.usedCategories ?? []}
              />
            </div>
          </div>
        );
      })()}

      {/* Lobby phase — team panels */}
      {(room.phase === 'lobby') && (
        <>
          <div className="w-full max-w-3xl flex flex-col sm:flex-row gap-4 mb-6">
            <TeamPanel
              room={room}
              team="blue"
              playerId={playerId}
              onJoin={() => actions.joinTeam('blue')}
              onLeave={actions.leaveTeam}
              onVoteCaptain={actions.voteCaptain}
            />
            <TeamPanel
              room={room}
              team="red"
              playerId={playerId}
              onJoin={() => actions.joinTeam('red')}
              onLeave={actions.leaveTeam}
              onVoteCaptain={actions.voteCaptain}
            />
          </div>

          {/* Lock Teams — host only */}
          {isHost && (
            <button
              onClick={actions.lockTeams}
              disabled={!bothTeamsHavePlayers}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-quizzy-text text-quizzy-card font-semibold hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              title={!bothTeamsHavePlayers ? t.lockTeamsDisabled : ''}
            >
              <Lock size={16} />
              {t.lockTeams}
            </button>
          )}

          {!isHost && (
            <p className="text-sm text-quizzy-muted text-center animate-pulse-soft">
              {t.waitingHost}
            </p>
          )}
        </>
      )}

      {/* Player list below (all connected players) */}
      <div className="w-full max-w-3xl mt-6">
        <p className="text-xs text-quizzy-subtle uppercase tracking-widest mb-2 font-medium">
          {t.playersInRoom} ({Object.keys(room.players).length})
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.values(room.players).map((p) => (
            <span
              key={p.id}
              className={`text-xs px-3 py-1 rounded-full font-medium border ${
                p.team === 'blue'
                  ? 'bg-blue-pale text-blue-soft border-blue-light'
                  : p.team === 'red'
                  ? 'bg-red-pale text-red-soft border-red-light'
                  : 'bg-gray-100 text-quizzy-muted border-quizzy-border'
              } ${!p.isConnected ? 'opacity-40 line-through' : ''}`}
            >
              {p.name}
              {p.id === playerId && ` (${t.you})`}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
