'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, Loader2, Zap } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { useLanguage } from '@/context/LanguageContext';
import { useProfile } from '@/context/ProfileContext';
import { randomGuestName } from '@/lib/guestName';
import { GameModePicker } from './GameModePicker';
import type { GameModeKey, RoomCreatedPayload, RoomErrorPayload } from '@/types';

const SESSION_KEY = (roomCode: string) => `quizzy_player_${roomCode}`;

export function CreateRoomForm() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { profile, setName: setProfileName } = useProfile();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<GameModeKey>('classic');
  const nameTouched = useRef(false);

  // Prefill so a first-time player never faces an empty required field: a
  // returning player's saved name, or a fun random placeholder otherwise.
  useEffect(() => {
    if (nameTouched.current || !profile || name) return;
    setName(profile.name || randomGuestName(language));
  }, [profile, language, name]);

  useEffect(() => {
    const socket = getSocket();

    const onCreated = (payload: RoomCreatedPayload) => {
      sessionStorage.setItem(SESSION_KEY(payload.roomCode), payload.playerId);
      router.push(`/lobby/${payload.roomCode}`);
    };

    const onError = (payload: RoomErrorPayload) => {
      setError(payload.message);
      setLoading(false);
    };

    socket.on('room:created', onCreated);
    socket.on('room:error', onError);

    return () => {
      socket.off('room:created', onCreated);
      socket.off('room:error', onError);
    };
  }, [router]);

  const createRoom = (playerName: string, roomMode: GameModeKey) => {
    const trimmed = playerName.trim();
    if (!trimmed) return setError(t.enterYourName);
    if (trimmed.length > 20) return setError(t.nameTooLong);

    setError(null);
    setLoading(true);
    // Remember the name for next time and for the leaderboard.
    setProfileName(trimmed);

    const socket = getSocket();
    if (!socket.connected) socket.connect();
    socket.emit('room:create', {
      playerName: trimmed,
      mode: roomMode,
      // Guest identity (PBI 14). Omitted entirely when there is no profile
      // yet, so the server simply records no stats for this player.
      ...(profile ? { profileId: profile.id, avatar: profile.avatar } : {}),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createRoom(name, mode);
  };

  // Onboarding-friction cut: one click, no field to touch. Falls back to a
  // random name when the player never edited the prefilled one.
  const handleQuickPlay = () => {
    createRoom(name.trim() || randomGuestName(language), 'classic');
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="create-name" className="block text-sm font-semibold text-quizzy-text mb-1.5">
          {t.yourName}
        </label>
        <input
          id="create-name"
          type="text"
          value={name}
          onChange={(e) => { nameTouched.current = true; setName(e.target.value); setError(null); }}
          placeholder={t.enterName}
          maxLength={20}
          className="w-full px-4 py-2.5 rounded-xl border border-quizzy-border bg-quizzy-card text-quizzy-text placeholder:text-quizzy-subtle focus:outline-none focus:ring-2 focus:ring-blue-soft focus:border-transparent transition"
        />
      </div>

      {/* Mode selection (PBI 9) — picked at creation because it changes the
          clock and the target score, both of which are locked once teams are. */}
      <GameModePicker value={mode} onChange={(m) => { setMode(m); setError(null); }} />

      {error && (
        <p className="text-sm text-red-soft font-medium">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-soft text-white font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <PlusCircle size={18} />
        )}
        {loading ? t.creating : t.createRoomBtn}
      </button>

      <button
        type="button"
        onClick={handleQuickPlay}
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-blue-soft text-blue-soft font-semibold hover:bg-blue-soft hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Zap size={16} fill="currentColor" />
        {t.quickPlayBtn}
      </button>
    </form>
  );
}
