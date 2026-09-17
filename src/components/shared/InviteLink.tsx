'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface InviteLinkProps {
  code: string;
}

/**
 * Shows the shareable /join/<code> URL with copy and native-share actions (PBI 12).
 *
 * The URL is built from window.location at mount rather than from an env var:
 * the app is served from a Vercel domain, from localhost, and from a LAN IP in
 * Docker, and a hardcoded origin would hand out a link that only works on one
 * of them.
 *
 * navigator.share is mobile-only and navigator.clipboard needs a secure context,
 * so both are feature-detected and the raw URL stays selectable as the fallback.
 */
export function InviteLink({ code }: InviteLinkProps) {
  const { t } = useLanguage();
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const url = origin ? `${origin}/join/${code}` : `/join/${code}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside a secure context; the URL below stays
      // selectable so the player can copy it by hand.
    }
  };

  const handleShare = async () => {
    try {
      await navigator.share({ title: 'Quizzy', text: t.inviteFriends, url });
    } catch {
      // The player dismissed the share sheet — nothing to recover from.
    }
  };

  return (
    <div className="w-full max-w-md bg-quizzy-card border border-quizzy-border rounded-2xl p-4 shadow-card">
      <p className="text-sm font-semibold text-quizzy-text">{t.inviteFriends}</p>
      <p className="text-xs text-quizzy-muted mt-0.5 mb-3">{t.inviteLinkHint}</p>

      <div className="flex items-center gap-2">
        <code
          id="invite-url"
          className="flex-1 min-w-0 truncate text-xs font-mono px-3 py-2 rounded-xl bg-quizzy-bg border border-quizzy-border text-quizzy-muted"
        >
          {url}
        </code>

        <button
          type="button"
          id="copy-invite-link"
          onClick={handleCopy}
          aria-label={t.copyLink}
          title={t.copyLink}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-soft text-white text-xs font-semibold hover:bg-blue-500 transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span className="hidden sm:inline">{copied ? t.linkCopied : t.copyLink}</span>
        </button>

        {canShare && (
          <button
            type="button"
            id="share-invite-link"
            onClick={handleShare}
            aria-label={t.shareLink}
            title={t.shareLink}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-quizzy-border text-quizzy-text text-xs font-semibold hover:bg-quizzy-bg transition-colors"
          >
            <Share2 size={14} />
            <span className="hidden sm:inline">{t.shareLink}</span>
          </button>
        )}
      </div>
    </div>
  );
}
