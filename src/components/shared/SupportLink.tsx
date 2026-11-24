'use client';

import { Coffee } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { track } from '@/lib/track';

/**
 * Where "Support Quizzy" points (PBI 31): a Buy Me a Coffee or Kreosus page.
 * Read at build time; with no URL configured the link is simply not rendered,
 * so nothing ships pointing at a placeholder.
 */
export const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_URL ?? '';

/** A quiet text link, for the end-of-match screens. */
export function SupportLink({ placement }: { placement: string }) {
  const { t } = useLanguage();
  if (!SUPPORT_URL) return null;
  return (
    <a
      id="support-link"
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('support_clicked', { placement })}
      className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-quizzy-muted hover:text-quizzy-text transition-colors"
    >
      <Coffee size={13} />
      {t.supportQuizzy}
    </a>
  );
}
