'use client';

import { useState } from 'react';
import { Share2, Download, Copy, Check, Loader2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { generateScoreCardBlob } from '@/lib/scoreCard';
import type { TeamColor } from '@/types';

interface ShareResultProps {
  roomCode: string;
  winnerTeam: TeamColor;
  blueScore: number;
  redScore: number;
  blueLabel: string;
  redLabel: string;
  winsLabel: string;
}

/**
 * Turns a finished match into something worth sending a friend (PBI: result
 * sharing). A share-sheet with the score-card image when the platform
 * supports sharing files, a plain download otherwise, and a one-tap "copy
 * result + rematch link" for chat apps that don't take image shares well.
 */
export function ShareResult({
  roomCode,
  winnerTeam,
  blueScore,
  redScore,
  blueLabel,
  redLabel,
  winsLabel,
}: ShareResultProps) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const resultLine = `${winnerTeam === 'blue' ? blueLabel : redLabel} ${winsLabel} (${blueScore}-${redScore}) 🏆`;
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/${roomCode}` : `/join/${roomCode}`;

  const buildCard = () =>
    generateScoreCardBlob({ winnerTeam, blueScore, redScore, blueLabel, redLabel, winsLabel });

  const handleShare = async () => {
    setBusy(true);
    try {
      const blob = await buildCard();
      const file = blob ? new File([blob], 'quizzy-score.png', { type: 'image/png' }) : null;

      if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: 'Quizzy', text: `${resultLine}\n${joinUrl}`, files: [file] });
      } else if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Quizzy', text: resultLine, url: joinUrl });
      } else if (blob) {
        downloadBlob(blob);
      }
    } catch {
      // Share sheet dismissed — nothing to recover from.
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      const blob = await buildCard();
      if (blob) downloadBlob(blob);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${resultLine}\n${joinUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked outside a secure context — share/download still work.
    }
  };

  return (
    <div className="flex gap-2 mb-2.5">
      <button
        type="button"
        onClick={handleShare}
        disabled={busy}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-quizzy-border text-quizzy-text text-sm font-semibold hover:bg-quizzy-bg disabled:opacity-60 transition-colors"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}
        {t.shareResult}
      </button>
      <button
        type="button"
        onClick={handleDownload}
        disabled={busy}
        aria-label={t.downloadCard}
        title={t.downloadCard}
        className="shrink-0 flex items-center justify-center px-3 py-2.5 rounded-xl border border-quizzy-border text-quizzy-text hover:bg-quizzy-bg disabled:opacity-60 transition-colors"
      >
        <Download size={15} />
      </button>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={t.copyResult}
        title={t.copyResult}
        className="shrink-0 flex items-center justify-center px-3 py-2.5 rounded-xl border border-quizzy-border text-quizzy-text hover:bg-quizzy-bg transition-colors"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

function downloadBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'quizzy-score.png';
  a.click();
  URL.revokeObjectURL(url);
}
