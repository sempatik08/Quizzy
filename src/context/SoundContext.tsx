'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { playSound, warmUpAudio, type SoundName } from '@/lib/sounds';

const STORAGE_KEY = 'quizzy_sound';

interface SoundContextType {
  enabled: boolean;
  toggle: () => void;
  play: (name: SoundName) => void;
}

const SoundContext = createContext<SoundContextType>({
  enabled: true,
  toggle: () => {},
  play: () => {},
});

/**
 * Holds the player's sound preference and hands out a `play` that respects it
 * (PBI 15).
 *
 * Sound defaults to ON: a quiz game is a social, shared-screen thing and the
 * cues carry real information (right/wrong lands before you have read the
 * reveal text). The toggle sits next to the language switcher so it is one
 * click away when it isn't wanted.
 *
 * The first render always uses the default so server and client markup match;
 * the stored preference is applied in an effect straight after.
 */
export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'off') setEnabled(false);
    } catch {
      // Private mode or blocked storage — the default stands.
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
      } catch {
        // Preference just won't survive a reload.
      }
      // Turning sound on is itself a user gesture, which is the only moment a
      // browser will let us create the AudioContext.
      if (next) {
        warmUpAudio();
        playSound('reveal', true);
      }
      return next;
    });
  }, []);

  const play = useCallback((name: SoundName) => playSound(name, enabled), [enabled]);

  return (
    <SoundContext.Provider value={{ enabled, toggle, play }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  return useContext(SoundContext);
}
