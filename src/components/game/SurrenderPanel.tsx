'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import type { Room, TeamColor } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface SurrenderPanelProps {
  room: Room;
  playerId: string;
  myTeam: TeamColor | null;
  onInitiate: () => void;
  onVote: (vote: boolean) => void;
}

export function SurrenderPanel({ room, playerId, myTeam, onInitiate, onVote }: SurrenderPanelProps) {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);

  const sv = room.surrenderVote;
  const myConnectedCount = myTeam
    ? room.teams[myTeam].players.filter((id) => room.players[id]?.isConnected).length
    : 0;

  // Vote in progress for MY team
  if (sv && sv.team === myTeam) {
    const myVote = sv.votes[playerId];
    const yesCount = Object.values(sv.votes).filter(Boolean).length;
    const totalConnected = room.teams[myTeam].players.filter((id) => room.players[id]?.isConnected).length;
    const threshold = Math.ceil(totalConnected * 0.51);

    return (
      <div className={`rounded-xl border-2 p-4 ${myTeam === 'blue' ? 'border-blue-light bg-blue-pale' : 'border-red-light bg-red-pale'}`}>
        <p className="font-bold text-sm text-quizzy-text mb-1">{t.surrenderVoteTitle}</p>
        <p className="text-xs text-quizzy-muted mb-3">{t.surrenderVoteDesc}</p>

        <div className="flex items-center gap-2 mb-3 text-xs text-quizzy-muted">
          <span className="font-semibold text-quizzy-text">{yesCount} / {threshold}</span>
          <span>{t.surrenderVoteProgress}</span>
        </div>

        {myVote === undefined ? (
          <div className="flex gap-2">
            <button
              onClick={() => onVote(true)}
              className="flex-1 py-2 rounded-lg bg-red-soft text-white text-xs font-bold hover:opacity-90 active:scale-95 transition-all"
            >
              {t.surrenderVoteYes}
            </button>
            <button
              onClick={() => onVote(false)}
              className="flex-1 py-2 rounded-lg bg-quizzy-card border border-quizzy-border text-quizzy-text text-xs font-bold hover:bg-quizzy-border active:scale-95 transition-all"
            >
              {t.surrenderVoteNo}
            </button>
          </div>
        ) : (
          <p className="text-xs text-quizzy-muted italic">
            {t.surrenderYouVoted}: <span className="font-bold text-quizzy-text">{myVote ? t.surrenderVoteYes : t.surrenderVoteNo}</span>
          </p>
        )}
      </div>
    );
  }

  // Vote in progress for the OPPONENT team
  if (sv && sv.team !== myTeam) {
    return (
      <p className="text-xs text-quizzy-muted italic text-center py-1">
        {t.surrenderOpponentVoting}
      </p>
    );
  }

  // No vote — show surrender button for this player's team
  if (!myTeam) return null;

  if (confirming) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-quizzy-muted text-center">{t.surrenderConfirm}</p>
        <div className="flex gap-2">
          <button
            onClick={() => { setConfirming(false); onInitiate(); }}
            className="flex-1 py-2 rounded-lg bg-red-soft text-white text-xs font-bold hover:opacity-90 active:scale-95 transition-all"
          >
            {myConnectedCount === 1 ? t.surrender : t.surrenderVoteYes}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="flex-1 py-2 rounded-lg bg-quizzy-card border border-quizzy-border text-quizzy-text text-xs font-bold hover:bg-quizzy-border active:scale-95 transition-all"
          >
            {t.surrenderVoteNo}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-quizzy-border text-quizzy-muted text-xs font-medium hover:border-red-light hover:text-red-soft hover:bg-red-pale transition-all"
    >
      <Flag size={12} />
      {t.surrender}
    </button>
  );
}
