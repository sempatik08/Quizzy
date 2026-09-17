'use client';

import { Eye } from 'lucide-react';
import type { Player } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface SpectatorBannerProps {
  /** Whether the viewer themselves is a spectator. */
  isSpectator: boolean;
  spectators: Player[];
}

/**
 * Tells a spectator what they cannot do, and tells players who is watching
 * (PBI 10).
 *
 * The explicit list of restrictions matters: without it a spectator clicks an
 * option, gets "Spectators cannot vote", and reads that as a broken game rather
 * than the role they chose.
 */
export function SpectatorBanner({ isSpectator, spectators }: SpectatorBannerProps) {
  const { t } = useLanguage();
  const watching = spectators.filter((p) => p.isConnected);

  if (!isSpectator && watching.length === 0) return null;

  if (isSpectator) {
    return (
      <div
        id="spectator-banner"
        className="w-full max-w-2xl mb-4 px-4 py-2.5 rounded-xl bg-quizzy-card border border-quizzy-border flex items-center gap-2"
      >
        <Eye size={15} className="text-quizzy-muted shrink-0" />
        <span className="text-xs font-semibold text-quizzy-text">{t.spectator}</span>
        <span className="text-xs text-quizzy-muted">{t.spectatorBanner}</span>
      </div>
    );
  }

  return (
    <div
      id="spectator-count"
      data-spectator-count={watching.length}
      className="w-full max-w-2xl mb-4 flex items-center gap-1.5 text-xs text-quizzy-muted"
    >
      <Eye size={13} />
      <span>
        {watching.length} {t.spectators.toLowerCase()}
      </span>
      <span className="truncate">
        — {watching.map((p) => p.name).join(', ')}
      </span>
    </div>
  );
}
