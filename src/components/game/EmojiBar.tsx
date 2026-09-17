'use client';

import { useEffect, useRef, useState } from 'react';
import type { EmojiName, EmojiReactionPayload } from '@/types';
import { EMOJI_GLYPHS, EMOJI_ORDER, EMOJI_COOLDOWN_MS } from '@/lib/emoji';
import { useLanguage } from '@/context/LanguageContext';

interface EmojiBarProps {
  reactions: EmojiReactionPayload[];
  onSend: (emoji: EmojiName) => void;
}

/**
 * Reaction buttons plus the floating reactions themselves (PBI 11).
 *
 * The cooldown is mirrored here so the button visibly locks for two seconds.
 * The server drops over-quota reactions silently — an error toast on every fast
 * tap would be worse spam than the reaction it refuses — so without a local
 * mirror a rapid tap would just do nothing with no explanation.
 */
export function EmojiBar({ reactions, onSend }: EmojiBarProps) {
  const { t } = useLanguage();
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Only tick while a cooldown is actually running.
  useEffect(() => {
    if (cooldownUntil === 0) return;
    setNow(Date.now());
    intervalRef.current = setInterval(() => {
      const t2 = Date.now();
      setNow(t2);
      if (t2 >= cooldownUntil) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setCooldownUntil(0);
      }
    }, 120);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [cooldownUntil]);

  const onCooldown = cooldownUntil > now && cooldownUntil > 0;
  const secondsLeft = onCooldown ? Math.ceil((cooldownUntil - now) / 1000) : 0;

  const handleSend = (emoji: EmojiName) => {
    if (onCooldown) return;
    onSend(emoji);
    setCooldownUntil(Date.now() + EMOJI_COOLDOWN_MS);
  };

  return (
    <div className="relative w-full">
      {/* Floating reactions. pointer-events-none so they never block a vote. */}
      <div
        id="emoji-stream"
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 bottom-full h-28 overflow-hidden"
      >
        {reactions.map((rx, i) => (
          <span
            key={rx.id}
            data-emoji={rx.emoji}
            title={rx.playerName}
            className="absolute bottom-0 text-2xl animate-emoji-float"
            style={{
              // Spread them out so simultaneous reactions do not stack exactly.
              left: `${12 + ((i * 17) % 70)}%`,
              filter:
                rx.team === 'blue'
                  ? 'drop-shadow(0 0 6px rgba(77,150,255,0.55))'
                  : rx.team === 'red'
                  ? 'drop-shadow(0 0 6px rgba(255,107,107,0.55))'
                  : 'none',
            }}
          >
            {EMOJI_GLYPHS[rx.emoji]}
          </span>
        ))}
      </div>

      <div
        id="emoji-bar"
        className="w-full bg-quizzy-card border border-quizzy-border rounded-2xl px-3 py-2 shadow-card flex items-center gap-1 overflow-x-auto"
      >
        {EMOJI_ORDER.map((name) => (
          <button
            key={name}
            type="button"
            data-emoji-send={name}
            onClick={() => handleSend(name)}
            disabled={onCooldown}
            aria-label={name}
            title={onCooldown ? `${t.emojiCooldown} ${secondsLeft}s` : name}
            className="shrink-0 w-9 h-9 rounded-xl text-lg leading-none flex items-center justify-center hover:bg-quizzy-bg active:scale-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all"
          >
            {EMOJI_GLYPHS[name]}
          </button>
        ))}

        <span className="ml-auto shrink-0 pl-2 text-[10px] text-quizzy-muted tabular-nums">
          {onCooldown ? `${secondsLeft}s` : t.emojiReact}
        </span>
      </div>
    </div>
  );
}
