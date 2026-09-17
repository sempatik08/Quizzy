'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Zap, AlertCircle } from 'lucide-react';
import { JoinRoomForm } from '@/components/home/JoinRoomForm';
import { HoverFooter } from '@/components/shared/HoverFooter';
import { useLanguage } from '@/context/LanguageContext';

/**
 * Invite route — /join/ABC123 (PBI 12).
 *
 * Dictating a 6-character code over chat was the single biggest friction point
 * in getting a second player into a room. This page takes the code from the URL
 * so the invited player only types a name.
 *
 * The code is validated here rather than deferred to the server so a mistyped
 * or truncated link fails with something readable instead of a socket error.
 * The room-code alphabet deliberately excludes 0/O/1/I/L (see generateRoomCode
 * in server/roomManager.js); a link containing them cannot be a real room.
 */

const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export default function JoinByLinkPage() {
  const params = useParams();
  const { t } = useLanguage();

  const raw = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
  const code = (raw ?? '').toUpperCase();
  const isValid = CODE_PATTERN.test(code);

  return (
    <main className="min-h-screen bg-quizzy-bg flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <Link href="/" className="inline-flex items-center gap-2 mb-8 group">
          <div className="w-9 h-9 rounded-2xl bg-blue-soft flex items-center justify-center shadow-md">
            <Zap size={20} className="text-white" fill="white" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-quizzy-text">Quizzy</span>
        </Link>

        <div className="w-full max-w-sm bg-quizzy-card rounded-2xl shadow-card p-6 border border-quizzy-border animate-slide-up">
          {isValid ? (
            <>
              <div className="mb-5">
                <div className="w-8 h-1 rounded-full bg-red-soft mb-3" />
                <h1 id="invite-heading" className="text-lg font-bold text-quizzy-text">
                  {t.invitedToRoom}
                </h1>
                <p className="text-sm text-quizzy-muted mt-1">{t.invitedHint}</p>
              </div>
              <JoinRoomForm initialCode={code} lockCode autoFocusName />
            </>
          ) : (
            <div className="text-center">
              <AlertCircle size={28} className="text-red-soft mx-auto mb-3" />
              <h1 className="text-lg font-bold text-quizzy-text mb-1">{t.invalidRoomCode}</h1>
              <p id="invite-error" className="text-sm text-quizzy-muted mb-5">
                {t.badInviteLink}
              </p>
              <Link
                href="/"
                className="inline-block w-full py-3 rounded-xl bg-blue-soft text-white font-semibold hover:bg-blue-500 transition-colors shadow-sm"
              >
                {t.enterCodeManually}
              </Link>
            </div>
          )}
        </div>
      </div>

      <HoverFooter />
    </main>
  );
}
