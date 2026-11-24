import type { Metadata } from 'next';
import Link from 'next/link';
import { SeoShell, PlayCta } from '@/components/seo/SeoShell';
import { CATEGORY_PAGES } from '@/lib/seo/categories';
import { categorySize } from '@/lib/seo/bank';
import questionCounts from '@/data/question-counts.json';

export const metadata: Metadata = {
  title: `Bilgi Yarışması Kategorileri — ${questionCounts.total} soru | Quizzy`,
  description: `${questionCounts.categoryCount} kategoride ${questionCounts.total} bilgi yarışması sorusu: tarih, coğrafya, sinema, spor, müzik ve daha fazlası. Örnek soruları çöz, arkadaşlarınla online oyna.`,
  alternates: { canonical: '/kategori' },
};

export default function CategoriesIndex() {
  return (
    <SeoShell>
      <h1 className="text-3xl font-extrabold text-quizzy-text">Bilgi yarışması kategorileri</h1>
      <p className="mt-3 text-quizzy-muted leading-relaxed">
        Quizzy&apos;de {questionCounts.categoryCount} kategoride {questionCounts.total} soru var. Her kategoride
        örnek sorular ve cevapları bulabilir, ardından arkadaşlarınla takım kurup canlı oynayabilirsin.
      </p>
      <ul className="mt-8 grid sm:grid-cols-2 gap-3">
        {CATEGORY_PAGES.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/kategori/${c.slug}`}
              className="block h-full rounded-2xl bg-quizzy-card border border-quizzy-border p-4 shadow-card hover:border-blue-soft transition-colors"
            >
              <p className="font-bold text-quizzy-text">{c.emoji} {c.name}</p>
              <p className="text-sm text-quizzy-muted mt-1">{c.summary}</p>
              <p className="text-xs text-quizzy-muted mt-2">{categorySize(c.key)} soru</p>
            </Link>
          </li>
        ))}
      </ul>
      <PlayCta />
    </SeoShell>
  );
}
