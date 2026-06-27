'use client';

import { Users, UserPlus, UserMinus } from 'lucide-react';
import type { Room, TeamColor } from '@/types';
import { PlayerTag } from '@/components/shared/PlayerTag';
import { CaptainElection } from './CaptainElection';
import { useLanguage } from '@/context/LanguageContext';

interface TeamPanelProps {
  room: Room;
  team: TeamColor;
  playerId: string;
  onJoin: () => void;
  onLeave: () => void;
  onVoteCaptain: (nomineeId: string) => void;
}

export function TeamPanel({ room, team, playerId, onJoin, onLeave, onVoteCaptain }: TeamPanelProps) {
  const { t } = useLanguage();
  const teamState = room.teams[team];
  const myPlayer = room.players[playerId];
  const isOnThisTeam = myPlayer?.team === team;
  const isOnOtherTeam = myPlayer?.team !== null && myPlayer?.team !== team;
  const isFull = teamState.players.length >= 3;
  const needsElection = teamState.players.length >= 2 && !teamState.captain;

  const isBlue = team === 'blue';
  const accent = isBlue ? '#4D96FF' : '#FF6B6B';
  const paleBg = isBlue ? 'bg-blue-pale' : 'bg-red-pale';
  const borderColor = isBlue ? 'border-blue-light' : 'border-red-light';
  const textColor = isBlue ? 'text-blue-soft' : 'text-red-soft';
  const btnBg = isBlue
    ? 'bg-blue-soft hover:bg-blue-600 text-white'
    : 'bg-red-soft hover:bg-red-500 text-white';

  const teamLabel = isBlue ? t.blueTeam : t.redTeam;
  const joinLabel = isFull ? t.full : isBlue ? t.joinBlue : t.joinRed;

  return (
    <div className={`flex-1 rounded-2xl border-2 ${borderColor} bg-quizzy-card shadow-card overflow-hidden`}>
      {/* Header */}
      <div className={`${paleBg} px-5 py-4 border-b ${borderColor}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accent }} />
            <h3 className={`font-bold text-base ${textColor}`}>{teamLabel}</h3>
          </div>
          <div className="flex items-center gap-1 text-xs text-quizzy-muted font-medium">
            <Users size={13} />
            <span>{teamState.players.length}/3</span>
          </div>
        </div>

        {/* Score (shown mid-game) */}
        {(room.phase === 'question' || room.phase === 'finished') && (
          <div className={`mt-2 text-3xl font-extrabold ${textColor}`}>
            {teamState.score}
            <span className="text-sm font-normal text-quizzy-muted ml-1">{t.pts}</span>
          </div>
        )}
      </div>

      {/* Players */}
      <div className="px-5 py-4 flex flex-col gap-2 min-h-[120px]">
        {teamState.players.length === 0 ? (
          <p className="text-sm text-quizzy-subtle italic text-center py-4">{t.noPlayersYet}</p>
        ) : (
          teamState.players.map((pid) => {
            const player = room.players[pid];
            if (!player) return null;
            return (
              <PlayerTag
                key={pid}
                player={player}
                isCaptain={teamState.captain === pid}
                team={team}
                isMe={pid === playerId}
              />
            );
          })
        )}
      </div>

      {/* Captain Election */}
      {needsElection && (
        <div className="px-5 pb-4">
          <CaptainElection
            room={room}
            team={team}
            playerId={playerId}
            onVote={onVoteCaptain}
          />
        </div>
      )}

      {/* Captain elected badge */}
      {teamState.captain && !needsElection && (
        <div className={`mx-5 mb-4 text-center text-xs font-semibold ${textColor} ${paleBg} rounded-lg py-1.5 border ${borderColor}`}>
          {t.captainLabel}: {room.players[teamState.captain]?.name ?? '–'}
        </div>
      )}

      {/* Join / Leave */}
      <div className="px-5 pb-5">
        {isOnThisTeam ? (
          <button
            onClick={onLeave}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-quizzy-border text-quizzy-muted hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            <UserMinus size={15} />
            {t.leaveTeam}
          </button>
        ) : (
          <button
            onClick={onJoin}
            disabled={isFull || isOnOtherTeam}
            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              isFull || isOnOtherTeam
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : `${btnBg}`
            }`}
            title={isFull ? t.teamFull : isOnOtherTeam ? t.leaveFirst : ''}
          >
            <UserPlus size={15} />
            {joinLabel}
          </button>
        )}
      </div>
    </div>
  );
}
