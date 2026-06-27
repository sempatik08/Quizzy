'use client';

import { Crown } from 'lucide-react';
import type { Room, TeamColor } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface CaptainElectionProps {
  room: Room;
  team: TeamColor;
  playerId: string;
  onVote: (nomineeId: string) => void;
}

export function CaptainElection({ room, team, playerId, onVote }: CaptainElectionProps) {
  const { t } = useLanguage();
  const teamState = room.teams[team];
  const myVote = teamState.captainVotes[playerId];
  const isOnThisTeam = room.players[playerId]?.team === team;
  const isBlue = team === 'blue';
  const accent = isBlue ? 'border-blue-soft text-blue-soft' : 'border-red-soft text-red-soft';
  const votedStyle = isBlue ? 'bg-blue-soft text-white' : 'bg-red-soft text-white';

  if (!isOnThisTeam) return null;

  return (
    <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3">
      <div className="flex items-center gap-1.5 mb-3">
        <Crown size={14} className="text-yellow-500" />
        <span className="text-xs font-bold text-yellow-700 uppercase tracking-wide">
          {t.voteForCaptain}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {teamState.players.map((pid) => {
          const player = room.players[pid];
          if (!player) return null;

          const voteCount = Object.values(teamState.captainVotes).filter((v) => v === pid).length;
          const isMyChoice = myVote === pid;
          const isMe = pid === playerId;

          return (
            <button
              key={pid}
              onClick={() => onVote(pid)}
              disabled={!!myVote}
              className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                isMyChoice
                  ? `${votedStyle} border-transparent shadow-sm`
                  : `bg-quizzy-card ${accent} hover:bg-yellow-50 disabled:cursor-not-allowed disabled:opacity-70`
              }`}
            >
              <span>
                {player.name}
                {isMe && <span className="ml-1.5 text-[10px] opacity-60">({t.you})</span>}
              </span>
              {voteCount > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isMyChoice ? 'bg-quizzy-card/20' : 'bg-yellow-100 text-yellow-700'}`}>
                  {voteCount} {voteCount !== 1 ? t.votes : t.vote}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {myVote && (
        <p className="mt-2 text-[11px] text-yellow-600 text-center">
          {t.youVotedFor} {room.players[myVote]?.name}. {t.waitingTeammates}
        </p>
      )}
    </div>
  );
}
