import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SeoShell, PlayCta } from '@/components/seo/SeoShell';
import { QuestionList } from '@/components/seo/QuestionList';
import { CATEGORY_PAGES, categoryBySlug } from '@/lib/seo/categories';
import { categorySize, sampleQuestions, SAMPLE_SIZE } from '@/lib/seo/bank';

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORY_PAGES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = categoryBySlug(slug);
  if (!c) return {};
  return {
    title: `${c.name} Soruları ve Cevapları — Bilgi Yarışması | Quizzy`,
    description: `${c.summary} ${SAMPLE_SIZE} örnek soru ve cevabı, ${categorySize(c.key)} soruluk havuz. Arkadaşlarınla online ${c.name.toLowerCase()} bilgi yarışması oyna.`,
    alternates: { canonical: `/kategori/${c.slug}` },
    openGraph: { title: `${c.name} soruları — Quizzy`, description: c.summary, type: 'article', siteName: 'Quizzy' },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const c = categoryBySlug(slug);
  if (!c) notFound();
  const questions = sampleQuestions(c.key);
  const others = CATEGORY_PAGES.filter((o) => o.slug !== c.slug);

  return (
    <SeoShell>
      <nav className="text-xs text-quizzy-muted mb-3">
        <Link href="/kategori" className="hover:text-quizzy-text">Kategoriler</Link> / {c.name}
      </nav>
      <h1 className="text-3xl font-extrabold text-quizzy-text">{c.emoji} {c.name} soruları ve cevapları</h1>
      <p className="mt-3 text-quizzy-muted leading-relaxed">{c.intro}</p>
      <p className="mt-2 text-sm text-quizzy-muted">
        Bu kategoride toplam <strong className="text-quizzy-text">{categorySize(c.key)}</strong> soru var; aşağıda {questions.length} tanesi.
      </p>

      <h2 className="text-xl font-bold text-quizzy-text mt-8 mb-4">Örnek {c.name.toLowerCase()} soruları</h2>
      <QuestionList questions={questions} />

      <PlayCta
        label={`${c.name} kategorisinde arkadaşlarınla yarış`}
        sub="Oda kur, linki WhatsApp'tan gönder, takımını seç. Kayıt yok."
      />

      <h2 className="text-lg font-bold text-quizzy-text mt-10 mb-3">Diğer kategoriler</h2>
      <ul className="flex flex-wrap gap-2">
        {others.map((o) => (
          <li key={o.slug}>
            <Link href={`/kategori/${o.slug}`} className="inline-block px-3 py-1.5 rounded-full bg-quizzy-card border border-quizzy-border text-sm text-quizzy-text hover:border-blue-soft">
              {o.emoji} {o.name}
            </Link>
          </li>
        ))}
      </ul>
    </SeoShell>
  );
}
