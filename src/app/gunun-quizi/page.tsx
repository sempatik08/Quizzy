import type { Metadata } from 'next';
import { DailyQuiz } from '@/components/daily/DailyQuiz';

export const metadata: Metadata = {
  title: 'Günün Quizi — Her gün 10 yeni soru | Quizzy',
  description:
    'Herkese aynı 10 soru, günde bir kez. Tek başına oyna, skorunu WhatsApp\'ta paylaş, günün sıralamasına gir. Kayıt yok, ücretsiz.',
  alternates: { canonical: '/gunun-quizi' },
  openGraph: {
    title: 'Günün Quizi — Quizzy',
    description: 'Herkese aynı 10 soru, günde bir kez. Skorunu paylaş, arkadaşlarınla yarış.',
    type: 'website',
    siteName: 'Quizzy',
  },
};

/** Günün Quizi (PBI 26). The quiz itself runs on the socket server; see server/daily.js. */
export default function DailyQuizPage() {
  return <DailyQuiz />;
}
