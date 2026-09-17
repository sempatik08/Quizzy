'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getSocket } from '@/lib/socket';
import type { AvatarName, GuestProfile } from '@/types';
import { DEFAULT_AVATAR, isAvatarName } from '@/lib/avatars';

const STORAGE_KEY = 'quizzy_profile';

interface StoredProfile {
  id: string;
  name: string;
  avatar: AvatarName;
}

interface ProfileContextType {
  /** null until the stored profile has been read on the client. */
  profile: StoredProfile | null;
  /** Server-side record for this profile, once fetched. */
  stats: GuestProfile | null;
  setName: (name: string) => void;
  setAvatar: (avatar: AvatarName) => void;
  refreshStats: () => void;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  stats: null,
  setName: () => {},
  setAvatar: () => {},
  refreshStats: () => {},
});

/**
 * The account-less guest identity (PBI 14).
 *
 * A UUID generated once per browser and kept in localStorage is the whole
 * mechanism. It remembers a name, an avatar and a record across sessions on one
 * device and costs the player nothing — which matters for a party quiz you send
 * to a friend over chat, where a sign-up wall would lose most of them.
 *
 * The id is created lazily in an effect, never during render: it must not differ
 * between the server and client passes, and localStorage does not exist on the
 * server.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [stats, setStats] = useState<GuestProfile | null>(null);

  useEffect(() => {
    let next: StoredProfile | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredProfile>;
        if (typeof parsed.id === 'string' && parsed.id.length === 36) {
          next = {
            id: parsed.id,
            name: typeof parsed.name === 'string' ? parsed.name : '',
            avatar: isAvatarName(parsed.avatar) ? parsed.avatar : DEFAULT_AVATAR,
          };
        }
      }
    } catch {
      // Blocked or corrupt storage — fall through and mint a fresh identity.
    }

    if (!next) {
      // randomUUID needs a secure context; a plain-http LAN test would get
      // nothing at all, so fall back rather than leaving the player profileless.
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : fallbackUuid();
      next = { id, name: '', avatar: DEFAULT_AVATAR };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The identity still works for this session, it just will not persist.
      }
    }

    setProfile(next);
  }, []);

  const persist = useCallback((next: StoredProfile) => {
    setProfile(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Non-fatal, as above.
    }
    if (next.name.trim()) {
      const socket = getSocket();
      if (!socket.connected) socket.connect();
      socket.emit('profile:save', {
        profileId: next.id,
        name: next.name.trim(),
        avatar: next.avatar,
      });
    }
  }, []);

  const setName = useCallback(
    (name: string) => {
      setProfile((prev) => {
        if (!prev) return prev;
        const next = { ...prev, name };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setAvatar = useCallback(
    (avatar: AvatarName) => {
      setProfile((prev) => {
        if (!prev) return prev;
        const next = { ...prev, avatar };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const refreshStats = useCallback(() => {
    if (!profile?.id) return;
    const socket = getSocket();
    if (!socket.connected) socket.connect();
    socket.emit('profile:get', { profileId: profile.id });
  }, [profile?.id]);

  useEffect(() => {
    const socket = getSocket();
    const onData = (payload: { profile: GuestProfile | null }) => setStats(payload.profile);
    socket.on('profile:data', onData);
    return () => { socket.off('profile:data', onData); };
  }, []);

  return (
    <ProfileContext.Provider value={{ profile, stats, setName, setAvatar, refreshStats }}>
      {children}
    </ProfileContext.Provider>
  );
}

/** RFC-4122-shaped id for contexts where crypto.randomUUID is unavailable. */
function fallbackUuid(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[(Math.random() * 4) | 8];
    else out += hex[(Math.random() * 16) | 0];
  }
  return out;
}

export function useProfile() {
  return useContext(ProfileContext);
}
