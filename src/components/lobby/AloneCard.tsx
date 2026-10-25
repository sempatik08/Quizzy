'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, Play, UserX } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

/**
 * How long a player sits alone before the card appears. Long enough that a
 * friend who is opening the link is not pre-empted, short enough to catch the
 * player before they give up (PBI 24). Overridable so the e2e test need not wait.
 */
const ALONE_MS = Number(process.env.NEXT_PUBLIC_QUIZZY_ALONE_MS ?? 30000);

interface AloneCardProps {
  code: string;
  /** True while the player is the only one in the room (spectators don't count). */
  alone: boolean;
  isHost: boolean;
  onSolo: () => void;
}

/**
 * "Friend didn't come?" (PBI 24). Most lobbies never reach a match because the
 * creator waits for a friend who does not show up. After a while alone they get
 * two ways out: send the link where Turkish players actually talk (WhatsApp), or
 * start a free-for-all match by themselves right away.
 */
export function AloneCard({ code, alone, isHost, onSolo }: AloneCardProps) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // The clock restarts every time someone joins and leaves again: the card is
  // about being alone NOW, not about how old the room is.
  useEffect(() => {
    setVisible(false);
    if (!alone) return;
    const handle = setTimeout(() => setVisible(true), ALONE_MS);
    return () => clearTimeout(handle);
  }, [alone]);

  if (!visible) return null;

  const url = `${origin}/join/${code}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${t.aloneShareText} ${url}`)}`;

  return (
    <div
      id="alone-card"
      className="w-full max-w-md bg-quizzy-card border border-quizzy-border rounded-2xl p-5 shadow-card mb-6 animate-fade-in"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-quizzy-text">
        <UserX size={16} className="text-quizzy-muted" />
        {t.aloneTitle}
      </p>
      <p className="text-xs text-quizzy-muted mt-1 mb-4">{t.aloneBody}</p>

      <div className="flex flex-col sm:flex-row gap-2">
        <a
          id="alone-whatsapp"
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <MessageCircle size={16} />
          {t.aloneWhatsapp}
        </a>
        {isHost && (
          <button
            id="alone-solo"
            onClick={onSolo}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-quizzy-text text-quizzy-card text-sm font-semibold hover:opacity-80 transition-opacity"
          >
            <Play size={16} />
            {t.aloneSolo}
          </button>
        )}
      </div>
    </div>
  );
}
