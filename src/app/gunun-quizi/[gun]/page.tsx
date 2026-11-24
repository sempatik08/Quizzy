import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SeoShell, PlayCta } from '@/components/seo/SeoShell';
import { QuestionList } from '@/components/seo/QuestionList';
import { dailyDay } from '@/lib/seo/bank';
import { CATEGORY_PAGES } from '@/lib/seo/categories';

type Props = { params: Promise<{ gun: string }> };

export const revalidate = 3600;

const fmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const categoryName = (key: string) => CATEGORY_PAGES.find((c) => c.key === key)?.name ?? key;

/** Only finished days resolve: today's (and future) questions would be spoilers. */
function load(gun: string) {
  return /^\d{1,5}$/.test(gun) ? dailyDay(Number(gun)) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gun } = await params;
  const d = load(gun);
  if (!d) return {};
  const date = fmt.format(new Date(`${d.date}T00:00:00Z`));
  return {
    title: `Günün Quizi #${d.day} (${date}) — Sorular ve cevaplar | Quizzy`,
    description: `Quizzy Günün Quizi #${d.day}, ${date}: ${d.questions.map((q) => categoryName(q.category)).join(', ')} kategorilerinden 10 soru ve cevapları.`,
    alternates: { canonical: `/gunun-quizi/${d.day}` },
  };
}

export default async function DailyArchiveDay({ params }: Props) {
  const { gun } = await params;
  const d = load(gun);
  if (!d) notFound();
  const date = fmt.format(new Date(`${d.date}T00:00:00Z`));
  return (
    <SeoShell>
      <nav className="text-xs text-quizzy-muted mb-3">
        <Link href="/gunun-quizi/arsiv" className="hover:text-quizzy-text">Günün Quizi arşivi</Link> / #{d.day}
      </nav>
      <h1 className="text-3xl font-extrabold text-quizzy-text">Günün Quizi #{d.day}</h1>
      <p className="mt-2 text-quizzy-muted">{date} · 10 soru, kolaydan zora</p>
      <div className="mt-6">
        <QuestionList questions={d.questions} labels={d.questions.map((q) => categoryName(q.category))} />
      </div>
      <div className="mt-6 flex justify-between text-sm">
        {d.day > 1 ? <Link href={`/gunun-quizi/${d.day - 1}`} className="text-blue-soft">← #{d.day - 1}</Link> : <span />}
        {dailyDay(d.day + 1) ? <Link href={`/gunun-quizi/${d.day + 1}`} className="text-blue-soft">#{d.day + 1} →</Link> : <span />}
      </div>
      <PlayCta label="Bugünün quizini çöz" sub="Herkese aynı 10 soru. Sonucunu 🟩🟥 ızgarasıyla paylaş." />
    </SeoShell>
  );
}
