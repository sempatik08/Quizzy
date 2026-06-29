'use client';

import { CreateRoomForm } from '@/components/home/CreateRoomForm';
import { JoinRoomForm } from '@/components/home/JoinRoomForm';
import { HoverFooter } from '@/components/shared/HoverFooter';
import DataGridHero from '@/components/ui/data-grid-hero';
import { Zap } from 'lucide-react';
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
      </div>

      {/* Full-width Hover Footer */}
      <HoverFooter />
    </DataGridHero>
  );
}
