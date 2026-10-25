'use client';

import { Play, Users } from 'lucide-react';
import type { Room } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { avatarGlyph } from '@/lib/avatars';

interface FfaLobbyProps {
  room: Room;
  playerId: string;
  isHost: boolean;
  onStart: () => void;
}

/**
 * Lobby for the free-for-all mode (PBI 19). No team panels and no captain
 * election — players just appear in the list, and the host starts.
 */
export function FfaLobby({ room, playerId, isHost, onStart }: FfaLobbyProps) {
  const { t } = useLanguage();
  const players = Object.values(room.players).filter((p) => !p.isSpectator);
  const total = room.totalQuestions ?? 15;

  return (
    <div className="w-full max-w-3xl flex flex-col items-center">
      <div className="w-full bg-quizzy-card rounded-2xl shadow-card border border-quizzy-border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-quizzy-text">
            <Users size={16} className="text-blue-soft" />
            {t.ffaPlayers} ({players.length})
          </p>
          <span className="text-xs text-quizzy-muted">
            {t.modeFfa} · {t.modeFfaNote.replace('{n}', String(total))}
          </span>
        </div>

        <ul id="ffa-player-list" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {players.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium ${
                p.id === playerId
                  ? 'border-blue-soft bg-blue-pale text-quizzy-text'
                  : 'border-quizzy-border bg-quizzy-bg text-quizzy-text'
              } ${!p.isConnected ? 'opacity-40 line-through' : ''}`}
            >
              <span aria-hidden>{avatarGlyph(p.avatar)}</span>
              <span className="truncate">{p.name}</span>
              {p.id === playerId && <span className="text-xs text-quizzy-muted">({t.you})</span>}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <button
          id="ffa-start"
          onClick={onStart}
          disabled={players.length === 0}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-quizzy-text text-quizzy-card font-semibold hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          <Play size={16} />
          {t.ffaStart}
        </button>
      ) : (
        <p className="text-sm text-quizzy-muted text-center animate-pulse-soft">{t.ffaWaitingStart}</p>
      )}
    </div>
  );
}
