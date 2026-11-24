'use client';

import { CreateRoomForm } from '@/components/home/CreateRoomForm';
import { JoinRoomForm } from '@/components/home/JoinRoomForm';
import { HoverFooter } from '@/components/shared/HoverFooter';
import { ProfilePanel } from '@/components/profile/ProfilePanel';
import DataGridHero from '@/components/ui/data-grid-hero';
import Link from 'next/link';
import { Zap, CalendarDays, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <DataGridHero
      className="min-h-screen flex flex-col"
      rows={22}
      cols={32}
      spacing={3}
      duration={7}
      color="var(--color-blue-soft)"
      animationType="pulse"
      pulseEffect={true}
      mouseGlow={true}
      opacityMin={0.03}
      opacityMax={0.35}
      background="var(--color-bg)"
    >
      {/* Guest profile, leaderboard and history (PBI 14). Home only: in the
          lobby and game the top-right corner already holds the room code. */}
      <ProfilePanel />

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Branding */}
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-soft flex items-center justify-center shadow-md">
              <Zap size={22} className="text-white" fill="white" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-quizzy-text">Quizzy</h1>
          </div>
          <p className="text-quizzy-muted text-base max-w-sm">{t.tagline}</p>
        </div>

        {/* Günün Quizi (PBI 26): the one way in that needs no second player. */}
        <Link
          id="daily-cta"
          href="/gunun-quizi"
          className="w-full max-w-2xl mb-5 flex items-center gap-3 bg-quizzy-card rounded-2xl shadow-card border border-quizzy-border px-5 py-4 hover:shadow-card-hover hover:border-blue-soft transition-all animate-slide-up"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-pale flex items-center justify-center shrink-0">
            <CalendarDays size={20} className="text-blue-soft" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-quizzy-text">{t.dailyHomeCta}</p>
            <p className="text-xs text-quizzy-muted">{t.dailyHomeCtaDesc}</p>
          </div>
          <span className="hidden sm:inline text-lg tracking-tight" aria-hidden>🟩🟩🟥🟩⬜</span>
          <ChevronRight size={18} className="text-quizzy-muted" />
        </Link>

        {/* Cards */}
        <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-5 animate-slide-up">
          {/* Create Room */}
          <div className="bg-quizzy-card rounded-2xl shadow-card p-6 border border-quizzy-border">
            <div className="mb-5">
              <div className="w-8 h-1 rounded-full bg-blue-soft mb-3" />
              <h2 className="text-lg font-bold text-quizzy-text">{t.createRoom}</h2>
              <p className="text-sm text-quizzy-muted mt-1">{t.createRoomDesc}</p>
            </div>
            <CreateRoomForm />
          </div>

          {/* Join Room */}
          <div className="bg-quizzy-card rounded-2xl shadow-card p-6 border border-quizzy-border">
            <div className="mb-5">
              <div className="w-8 h-1 rounded-full bg-red-soft mb-3" />
              <h2 className="text-lg font-bold text-quizzy-text">{t.joinRoom}</h2>
              <p className="text-sm text-quizzy-muted mt-1">{t.joinRoomDesc}</p>
            </div>
            <JoinRoomForm />
          </div>
        </div>

        {/* Crawlable links to the content pages (PBI 29). */}
        <nav className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-quizzy-muted">
          <Link href="/kategori" className="hover:text-quizzy-text">Kategoriler</Link>
          <Link href="/nasil-oynanir" className="hover:text-quizzy-text">Nasıl oynanır?</Link>
          <Link href="/gunun-quizi/arsiv" className="hover:text-quizzy-text">Günün Quizi arşivi</Link>
        </nav>
      </div>

      {/* Full-width Hover Footer */}
      <HoverFooter />
    </DataGridHero>
  );
}
