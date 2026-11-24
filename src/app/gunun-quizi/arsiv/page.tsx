import type { Metadata } from 'next';
import Link from 'next/link';
import { SeoShell, PlayCta } from '@/components/seo/SeoShell';
import { pastDailyDays, dailyDay } from '@/lib/seo/bank';

export const metadata: Metadata = {
  title: 'Günün Quizi Arşivi — Geçmiş günlerin soruları ve cevapları | Quizzy',
  description: 'Quizzy Günün Quizi\'nin geçmiş günlerdeki 10 sorusu ve cevapları. Kaçırdığın günleri çöz, bugünün quizinde şansını dene.',
  alternates: { canonical: '/gunun-quizi/arsiv' },
};

// New day every midnight (Türkiye); an hourly refresh is plenty.
export const revalidate = 3600;

const fmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function DailyArchive() {
  const days = pastDailyDays();
  return (
    <SeoShell>
      <h1 className="text-3xl font-extrabold text-quizzy-text">Günün Quizi arşivi</h1>
      <p className="mt-3 text-quizzy-muted leading-relaxed">
        Her gün herkese aynı 10 soru soruluyor. Bugünün quizi bitene kadar soruları burada göstermiyoruz;
        geçmiş günlerin soruları ve cevapları aşağıda.
      </p>
      {days.length === 0 ? (
        <p className="mt-8 text-quizzy-muted">
          Arşiv yarın açılıyor. Şimdilik <Link href="/gunun-quizi" className="text-blue-soft underline">bugünün quizini çöz</Link>.
        </p>
      ) : (
        <ul className="mt-8 grid sm:grid-cols-2 gap-3">
          {days.map((n) => {
            const d = dailyDay(n);
            if (!d) return null;
            return (
              <li key={n}>
                <Link
                  href={`/gunun-quizi/${n}`}
                  className="block rounded-2xl bg-quizzy-card border border-quizzy-border p-4 shadow-card hover:border-blue-soft transition-colors"
                >
                  <p className="font-bold text-quizzy-text">Quizzy #{n}</p>
                  <p className="text-sm text-quizzy-muted">{fmt.format(new Date(`${d.date}T00:00:00Z`))}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <PlayCta label="Bugünün quizi seni bekliyor" sub="10 soru, 20'şer saniye. Sonucunu paylaş." />
    </SeoShell>
  );
}
