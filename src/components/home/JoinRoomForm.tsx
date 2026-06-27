'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, Loader2 } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { useLanguage } from '@/context/LanguageContext';
import type { RoomJoinedPayload, RoomErrorPayload } from '@/types';

const SESSION_KEY = (roomCode: string) => `quizzy_player_${roomCode}`;

export function JoinRoomForm() {
  const router = useRouter();
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState('');

  useEffect(() => {
    const socket = getSocket();

    const onJoined = (payload: RoomJoinedPayload) => {
      const rc = pendingCode || payload.room?.code;
      if (rc) {
        sessionStorage.setItem(SESSION_KEY(rc), payload.playerId);
        router.push(`/lobby/${rc}`);
      }
    };

    const onError = (payload: RoomErrorPayload) => {
      setError(payload.message);
      setLoading(false);
    };

    socket.on('room:joined', onJoined);
    socket.on('room:error', onError);

    return () => {
      socket.off('room:joined', onJoined);
      socket.off('room:error', onError);
    };
  }, [router, pendingCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();

    if (!trimmedName) return setError(t.enterYourName);
    if (trimmedName.length > 20) return setError(t.nameTooLong);
    if (trimmedCode.length !== 6) return setError(t.invalidRoomCode);

    setError(null);
    setLoading(true);
    setPendingCode(trimmedCode);

    const socket = getSocket();
    if (!socket.connected) socket.connect();
    socket.emit('room:join', { playerName: trimmedName, roomCode: trimmedCode });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="join-name" className="block text-sm font-semibold text-quizzy-text mb-1.5">
          {t.yourName}
        </label>
        <input
          id="join-name"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          placeholder={t.enterName}
          maxLength={20}
          className="w-full px-4 py-2.5 rounded-xl border border-quizzy-border bg-quizzy-card text-quizzy-text placeholder:text-quizzy-subtle focus:outline-none focus:ring-2 focus:ring-red-soft focus:border-transparent transition"
        />
      </div>

      <div>
        <label htmlFor="join-code" className="block text-sm font-semibold text-quizzy-text mb-1.5">
          {t.roomCodeLabel}
        </label>
        <input
          id="join-code"
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
          placeholder="e.g. A3BKW9"
          maxLength={6}
          className="w-full px-4 py-2.5 rounded-xl border border-quizzy-border bg-quizzy-card text-quizzy-text placeholder:text-quizzy-subtle font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-red-soft focus:border-transparent transition"
        />
      </div>

      {error && (
        <p className="text-sm text-red-soft font-medium">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !name.trim() || code.trim().length !== 6}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-red-soft text-white font-semibold hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <LogIn size={18} />
        )}
        {loading ? t.joining : t.joinRoomBtn}
      </button>
    </form>
  );
}
