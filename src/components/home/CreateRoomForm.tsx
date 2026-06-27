'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, Loader2 } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { useLanguage } from '@/context/LanguageContext';
import type { RoomCreatedPayload, RoomErrorPayload } from '@/types';

const SESSION_KEY = (roomCode: string) => `quizzy_player_${roomCode}`;

export function CreateRoomForm() {
  const router = useRouter();
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(t.enterYourName);
    if (trimmed.length > 20) return setError(t.nameTooLong);

    setError(null);
    setLoading(true);

    const socket = getSocket();
    if (!socket.connected) socket.connect();
    socket.emit('room:create', { playerName: trimmed });
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
          onChange={(e) => { setName(e.target.value); setError(null); }}
          placeholder={t.enterName}
          maxLength={20}
          className="w-full px-4 py-2.5 rounded-xl border border-quizzy-border bg-quizzy-card text-quizzy-text placeholder:text-quizzy-subtle focus:outline-none focus:ring-2 focus:ring-blue-soft focus:border-transparent transition"
        />
      </div>

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
    </form>
  );
}
