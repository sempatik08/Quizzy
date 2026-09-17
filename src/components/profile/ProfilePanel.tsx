'use client';

import { useEffect, useState, useCallback } from 'react';
import { User, Trophy, X, History, Loader2 } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { useProfile } from '@/context/ProfileContext';
import { useLanguage } from '@/context/LanguageContext';
import { AVATARS, AVATAR_GLYPHS, avatarGlyph } from '@/lib/avatars';
import type { AvatarName, LeaderboardPayload, MatchHistoryEntry } from '@/types';

type Tab = 'profile' | 'leaderboard' | 'history';

/**
 * Profile, leaderboard and match history in one dialog (PBI 14).
 *
 * One entry point rather than three pages: all three answer "how am I doing",
 * they are all read-only, and a party game's home screen should not grow a
 * navigation bar for them.
 *
 * The board is labelled as guest records rather than a ranked ladder. Profile
 * ids are client-supplied, so it can be farmed, and presenting it as
 * competitive would be a claim the data cannot support.
 */
export function ProfilePanel() {
  const { t } = useLanguage();
  const { profile, stats, setName, setAvatar, refreshStats } = useProfile();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('profile');
  const [board, setBoard] = useState<LeaderboardPayload | null>(null);
  const [history, setHistory] = useState<MatchHistoryEntry[] | null>(null);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    if (profile?.name) setDraftName(profile.name);
  }, [profile?.name]);

  useEffect(() => {
    const socket = getSocket();
    const onBoard = (payload: LeaderboardPayload) => setBoard(payload);
    const onHistory = (payload: { matches: MatchHistoryEntry[] }) => setHistory(payload.matches);
    socket.on('leaderboard:data', onBoard);
    socket.on('profile:history:data', onHistory);
    return () => {
      socket.off('leaderboard:data', onBoard);
      socket.off('profile:history:data', onHistory);
    };
  }, []);

  const load = useCallback(
    (next: Tab) => {
      setTab(next);
      const socket = getSocket();
      if (!socket.connected) socket.connect();
      if (next === 'leaderboard') {
        setBoard(null);
        socket.emit('leaderboard:get', {});
      }
      if (next === 'history' && profile?.id) {
        setHistory(null);
        socket.emit('profile:history', { profileId: profile.id });
      }
      if (next === 'profile') refreshStats();
    },
    [profile?.id, refreshStats],
  );

  const openPanel = () => {
    setOpen(true);
    load('profile');
  };

  if (!profile) return null;

  const winRate = stats?.matches ? Math.round((stats.wins / stats.matches) * 100) : 0;

  return (
    <>
      <button
        id="open-profile"
        type="button"
        onClick={openPanel}
        aria-label={t.profile}
        className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-quizzy-card border border-quizzy-border rounded-xl shadow-sm px-2.5 py-1.5 hover:bg-quizzy-bg transition-colors"
      >
        <span className="text-base leading-none" aria-hidden="true">
          {avatarGlyph(profile.avatar)}
        </span>
        <span className="text-xs font-semibold text-quizzy-text max-w-[7rem] truncate">
          {profile.name || t.profile}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label={t.yourProfile}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-quizzy-card rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-quizzy-text">{t.yourProfile}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.close}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-quizzy-muted hover:bg-quizzy-bg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-5 p-1 rounded-xl bg-quizzy-bg border border-quizzy-border">
              {([
                ['profile', <User key="u" size={13} />, t.profile],
                ['leaderboard', <Trophy key="t" size={13} />, t.leaderboard],
                ['history', <History key="h" size={13} />, t.matchHistory],
              ] as const).map(([key, icon, label]) => (
                <button
                  key={key}
                  type="button"
                  data-tab={key}
                  onClick={() => load(key as Tab)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    tab === key
                      ? 'bg-quizzy-card text-quizzy-text shadow-sm'
                      : 'text-quizzy-muted hover:text-quizzy-text'
                  }`}
                >
                  {icon}
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            {tab === 'profile' && (
              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-sm font-semibold text-quizzy-text mb-1.5"
                >
                  {t.yourName}
                </label>
                <input
                  id="profile-name"
                  type="text"
                  value={draftName}
                  maxLength={20}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => { if (draftName.trim()) setName(draftName.trim()); }}
                  placeholder={t.enterName}
                  className="w-full px-4 py-2.5 rounded-xl border border-quizzy-border bg-quizzy-bg text-quizzy-text placeholder:text-quizzy-subtle focus:outline-none focus:ring-2 focus:ring-blue-soft focus:border-transparent transition mb-4"
                />

                <p className="text-sm font-semibold text-quizzy-text mb-2">{t.chooseAvatar}</p>
                <div id="avatar-grid" className="grid grid-cols-6 gap-1.5 mb-4">
                  {AVATARS.map((a: AvatarName) => (
                    <button
                      key={a}
                      type="button"
                      data-avatar={a}
                      aria-label={a}
                      aria-pressed={profile.avatar === a}
                      onClick={() => setAvatar(a)}
                      className={`aspect-square rounded-xl text-xl flex items-center justify-center border transition-colors ${
                        profile.avatar === a
                          ? 'border-blue-soft bg-blue-pale'
                          : 'border-quizzy-border bg-quizzy-bg hover:bg-quizzy-card'
                      }`}
                    >
                      {AVATAR_GLYPHS[a]}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {([
                    [t.statRank, stats?.rank ? `#${stats.rank}` : t.unranked],
                    [t.statMatches, stats?.matches ?? 0],
                    [t.statWins, stats?.wins ?? 0],
                    [t.statLosses, stats?.losses ?? 0],
                    [t.statWinRate, `${winRate}%`],
                    [t.statPoints, stats?.points ?? 0],
                  ] as const).map(([label, value]) => (
                    <div
                      key={label}
                      className="px-3 py-2 rounded-xl bg-quizzy-bg border border-quizzy-border"
                    >
                      <p className="text-[10px] uppercase tracking-wide text-quizzy-muted">
                        {label}
                      </p>
                      <p className="text-base font-bold text-quizzy-text tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-quizzy-muted mt-4">{t.profileHint}</p>
              </div>
            )}

            {tab === 'leaderboard' && (
              <div>
                {board === null ? (
                  <Loader2 className="animate-spin text-quizzy-muted mx-auto my-8" size={22} />
                ) : board.entries.length === 0 ? (
                  <p className="text-sm text-quizzy-muted text-center py-8">
                    {t.leaderboardEmpty}
                  </p>
                ) : (
                  <ul id="leaderboard-list" className="flex flex-col gap-1.5">
                    {board.entries.map((e) => (
                      <li
                        key={`${e.rank}-${e.name}`}
                        data-rank={e.rank}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl bg-quizzy-bg border border-quizzy-border"
                      >
                        <span className="w-6 text-xs font-bold text-quizzy-muted tabular-nums">
                          {e.rank}
                        </span>
                        <span className="text-lg leading-none" aria-hidden="true">
                          {avatarGlyph(e.avatar)}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-quizzy-text truncate">
                          {e.name}
                        </span>
                        <span className="text-xs text-quizzy-muted tabular-nums">
                          {e.wins}
                          <span className="opacity-60">/{e.matches}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-quizzy-muted mt-4">{t.leaderboardHint}</p>
              </div>
            )}

            {tab === 'history' && (
              <div>
                {history === null ? (
                  <Loader2 className="animate-spin text-quizzy-muted mx-auto my-8" size={22} />
                ) : history.length === 0 ? (
                  <p className="text-sm text-quizzy-muted text-center py-8">{t.historyEmpty}</p>
                ) : (
                  <ul id="history-list" className="flex flex-col gap-1.5">
                    {history.map((m) => (
                      <li
                        key={`${m.roomCode}-${m.finishedAt}`}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl bg-quizzy-bg border border-quizzy-border"
                      >
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            m.won
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-pale text-red-soft'
                          }`}
                        >
                          {m.won ? t.won : t.lost}
                        </span>
                        <span className="flex-1 text-xs text-quizzy-muted truncate">
                          {m.roomCode} · {m.questions}Q
                        </span>
                        <span className="text-sm font-bold text-quizzy-text tabular-nums">
                          {m.myScore}
                          <span className="text-quizzy-muted font-normal">–{m.theirScore}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
