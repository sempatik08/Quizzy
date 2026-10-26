'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, Loader2, Search, X, Zap } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { useLanguage } from '@/context/LanguageContext';
import { useProfile } from '@/context/ProfileContext';
import { randomGuestName } from '@/lib/guestName';
import { GameModePicker } from './GameModePicker';
import type { GameModeKey, MatchFoundPayload, RoomCreatedPayload, RoomErrorPayload } from '@/types';

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
  /** "Find an opponent" (PBI 35): seconds left in the live search, or null. */
  const [searchLeft, setSearchLeft] = useState<number | null>(null);
  /** True from the click until match:found/cancel — kept apart from `loading` so Create doesn't read "Creating…". */
  const [finding, setFinding] = useState(false);
  const autoFindDone = useRef(false);

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
      setFinding(false);
    };

    // Matchmaking (PBI 35). The opponent is kept for the lobby, which tells a
    // player who found nobody what they can do next.
    const onFound = (payload: MatchFoundPayload) => {
      sessionStorage.setItem(SESSION_KEY(payload.roomCode), payload.playerId);
      sessionStorage.setItem(`quizzy_match_${payload.roomCode}`, JSON.stringify(payload.opponent));
      setSearchLeft(null);
      setFinding(false);
      router.push(`/lobby/${payload.roomCode}`);
    };
    const onSearching = ({ waitMs }: { waitMs: number }) => {
      setSearchLeft(Math.ceil(waitMs / 1000));
    };
    const onCancelled = () => {
      setSearchLeft(null);
      setFinding(false);
    };

    socket.on('room:created', onCreated);
    socket.on('room:error', onError);
    socket.on('match:found', onFound);
    socket.on('match:searching', onSearching);
    socket.on('match:cancelled', onCancelled);

    return () => {
      socket.off('room:created', onCreated);
      socket.off('room:error', onError);
      socket.off('match:found', onFound);
      socket.off('match:searching', onSearching);
      socket.off('match:cancelled', onCancelled);
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

  // Counts down the live search; the server falls back to a ghost at zero.
  useEffect(() => {
    if (searchLeft === null || searchLeft <= 0) return;
    const handle = setTimeout(() => setSearchLeft((n) => (n === null ? n : n - 1)), 1000);
    return () => clearTimeout(handle);
  }, [searchLeft]);

  const findOpponent = () => {
    const trimmed = (name.trim() || randomGuestName(language)).slice(0, 20);
    setError(null);
    setFinding(true);
    setProfileName(trimmed);
    const socket = getSocket();
    if (!socket.connected) socket.connect();
    socket.emit('match:find', {
      playerName: trimmed,
      ...(profile ? { profileId: profile.id, avatar: profile.avatar } : {}),
    });
  };

  const cancelSearch = () => {
    getSocket().emit('match:cancel');
  };

  // "Find a new opponent" after a ghost match lands here with ?find=1.
  useEffect(() => {
    if (autoFindDone.current || !profile || !name) return;
    if (new URLSearchParams(window.location.search).get('find') !== '1') return;
    autoFindDone.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    findOpponent();
    // findOpponent reads the latest name/profile; running once is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, name]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createRoom(name, mode);
  };

  // Onboarding-friction cut: one click, no field to touch. Falls back to a
  // random name when the player never edited the prefilled one. Opens a
  // free-for-all room (PBI 24): Quick Play always starts with one person, and
  // only free-for-all can be played alone — a friend can still join by link.
  const handleQuickPlay = () => {
    createRoom(name.trim() || randomGuestName(language), 'ffa');
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
        disabled={loading || finding || !name.trim()}
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
        disabled={loading || finding}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-blue-soft text-blue-soft font-semibold hover:bg-blue-soft hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Zap size={16} fill="currentColor" />
        {t.quickPlayBtn}
      </button>

      {searchLeft === null ? (
        <button
          type="button"
          id="find-opponent"
          onClick={findOpponent}
          disabled={loading || finding}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-quizzy-border text-quizzy-text font-semibold hover:bg-quizzy-bg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Search size={16} />
          {t.findOpponent}
        </button>
      ) : (
        <div
          id="match-searching"
          className="flex items-center justify-between gap-2 w-full px-4 py-2.5 rounded-xl border border-blue-light bg-blue-pale text-sm font-semibold text-quizzy-text"
        >
          <span className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-blue-soft" />
            {t.findingOpponent.replace('{n}', String(Math.max(0, searchLeft)))}
          </span>
          <button
            type="button"
            id="cancel-search"
            onClick={cancelSearch}
            className="flex items-center gap-1 text-xs text-quizzy-muted hover:text-quizzy-text"
          >
            <X size={14} />
            {t.cancelSearch}
          </button>
        </div>
      )}
    </form>
  );
}
