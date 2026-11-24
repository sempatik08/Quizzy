'use client';

import { useEffect, useRef } from 'react';
import type { Room } from '@/types';
import { track } from '@/lib/track';

/**
 * Lobby → match → result funnel events (PBI 22).
 *
 * Used by both the lobby and the game page. Each page is a separate mount, so
 * where this player is in the funnel lives in sessionStorage per room rather
 * than in a ref — otherwise the lobby → game navigation would look like a
 * fresh lobby, and a rematch would never count as a second match.
 *
 *   lobby    entered the room, no question shown yet
 *   playing  a question has been shown       → match_started fired
 *   finished the result screen was reached   → match_finished fired
 *
 * Leaving while still in `lobby` (back to home, closed tab) is the drop-off
 * the plan is about: lobby_abandoned with how long they waited and how many
 * players were there.
 */
type Stage = 'lobby' | 'playing' | 'finished';
interface FunnelState { stage: Stage; enteredAt: number }

const key = (code: string) => `quizzy_funnel_${code}`;

function read(code: string): FunnelState | null {
  try {
    const raw = sessionStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as FunnelState) : null;
  } catch {
    return null;
  }
}

function write(code: string, state: FunnelState | null): void {
  try {
    if (state) sessionStorage.setItem(key(code), JSON.stringify(state));
    else sessionStorage.removeItem(key(code));
  } catch {
    // Private mode with storage blocked: events are best-effort anyway.
  }
}

function playingCount(room: Room): number {
  return Object.values(room.players).filter((p) => !p.isSpectator).length;
}

export function useMatchFunnel(room: Room | null, isSpectator: boolean): void {
  const roomRef = useRef<Room | null>(room);
  roomRef.current = room;

  useEffect(() => {
    if (!room || isSpectator) return;
    const state = read(room.code);
    const players = playingCount(room);

    if (room.phase === 'question') {
      if (state?.stage !== 'playing') {
        track('match_started', { mode: room.mode, players });
        write(room.code, { stage: 'playing', enteredAt: state?.enteredAt ?? Date.now() });
      }
    } else if (room.phase === 'finished') {
      if (state?.stage === 'playing') {
        track('match_finished', { mode: room.mode, players });
        write(room.code, { stage: 'finished', enteredAt: state.enteredAt });
      }
    } else if (!state) {
      write(room.code, { stage: 'lobby', enteredAt: Date.now() });
    }
  }, [room, isSpectator]);

  // Leaving before any question: on unmount (navigated away) or tab close.
  useEffect(() => {
    if (isSpectator) return;
    const report = () => {
      const current = roomRef.current;
      if (!current) return;
      const state = read(current.code);
      if (state?.stage !== 'lobby' || current.phase === 'question') return;
      track('lobby_abandoned', {
        seconds: Math.round((Date.now() - state.enteredAt) / 1000),
        players: playingCount(current),
      });
      write(current.code, null);
    };
    window.addEventListener('pagehide', report);
    return () => {
      window.removeEventListener('pagehide', report);
      report();
    };
  }, [isSpectator]);
}
