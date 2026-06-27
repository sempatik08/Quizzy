'use client';

import type { Room } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface ScoreBoardProps {
  room: Room;
  playerId: string;
}

export function ScoreBoard({ room, playerId }: ScoreBoardProps) {
  const { t } = useLanguage();
  const myTeam = room.players[playerId]?.team;

  return (
    <div className="w-full flex items-center justify-between gap-4">
      {(['blue', 'red'] as const).map((team) => {
        const state = room.teams[team];
        const isActive = room.activeTeam === team;
        const isMyTeam = myTeam === team;
        const pct = Math.min((state.score / 100) * 100, 100);

        return (
          <div
            key={team}
            className={`flex-1 rounded-2xl border-2 p-4 transition-all ${
              team === 'blue'
                ? isActive
                  ? 'border-blue-soft bg-blue-pale shadow-md'
                  : 'border-blue-light bg-quizzy-card'
                : isActive
                ? 'border-red-soft bg-red-pale shadow-md'
                : 'border-red-light bg-quizzy-card'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: team === 'blue' ? '#4D96FF' : '#FF6B6B' }}
                />
                <span className={`font-bold text-sm capitalize ${team === 'blue' ? 'text-blue-soft' : 'text-red-soft'}`}>
                  {team === 'blue' ? t.blueTeam : t.redTeam}
                  {isMyTeam && <span className="ml-1 font-normal text-xs opacity-60">({t.you})</span>}
                </span>
              </div>
              {isActive && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    team === 'blue' ? 'bg-blue-soft text-white' : 'bg-red-soft text-white'
                  }`}
                >
                  {t.turn}
                </span>
              )}
            </div>

            <div className={`text-3xl font-extrabold ${team === 'blue' ? 'text-blue-soft' : 'text-red-soft'}`}>
              {state.score}
              <span className="text-sm font-normal text-quizzy-muted ml-1">/ 100</span>
            </div>

            {/* Progress bar */}
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: team === 'blue' ? '#4D96FF' : '#FF6B6B',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
