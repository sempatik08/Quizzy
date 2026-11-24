import Link from 'next/link';
import { Zap } from 'lucide-react';
import { CATEGORY_PAGES } from '@/lib/seo/categories';

/**
 * Layout for the public content pages (PBI 29): category pages, how to play
 * and the Daily Quiz archive. Server-rendered Turkish text with plenty of
 * internal links — the opposite of the game screens, which have almost no
 * text for a search engine to index.
 */
export function SeoShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-quizzy-bg flex flex-col">
      <header className="w-full max-w-3xl mx-auto px-4 pt-20 pb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="w-9 h-9 rounded-2xl bg-blue-soft flex items-center justify-center shadow-md">
            <Zap size={20} className="text-white" fill="white" />
          </span>
          <span className="text-2xl font-extrabold tracking-tight text-quizzy-text">Quizzy</span>
        </Link>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-quizzy-muted">
          <Link href="/kategori" className="hover:text-quizzy-text">Kategoriler</Link>
          <Link href="/nasil-oynanir" className="hover:text-quizzy-text">Nasıl oynanır?</Link>
          <Link href="/gunun-quizi" className="hover:text-quizzy-text">Günün Quizi</Link>
          <Link href="/" className="text-blue-soft hover:text-blue-500">Hemen oyna →</Link>
        </nav>
      </header>

      <main className="w-full max-w-3xl mx-auto px-4 pb-12 flex-1">{children}</main>

      <footer className="border-t border-quizzy-border">
        <div className="w-full max-w-3xl mx-auto px-4 py-8 text-sm text-quizzy-muted">
          <p className="font-semibold text-quizzy-text mb-2">Kategoriler</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-4">
            {CATEGORY_PAGES.map((c) => (
              <li key={c.slug}>
                <Link href={`/kategori/${c.slug}`} className="hover:text-quizzy-text">{c.name}</Link>
              </li>
            ))}
          </ul>
          <p>
            Quizzy — arkadaşlarla gerçek zamanlı, takımlı online bilgi yarışması. Ücretsiz, kayıt yok.{' '}
            <Link href="/gunun-quizi/arsiv" className="underline hover:text-quizzy-text">Günün Quizi arşivi</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Primary call to action at the bottom of a content page. */
export function PlayCta({ label = 'Arkadaşlarınla oyna', sub }: { label?: string; sub?: string }) {
  return (
    <div className="mt-10 rounded-2xl bg-quizzy-card border border-quizzy-border shadow-card p-6 text-center">
      <p className="text-lg font-bold text-quizzy-text">{label}</p>
      {sub && <p className="text-sm text-quizzy-muted mt-1">{sub}</p>}
      <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
        <Link href="/" className="px-5 py-3 rounded-xl bg-blue-soft text-white font-semibold hover:bg-blue-500 transition-colors">
          Oda kur, linki gönder
        </Link>
        <Link href="/gunun-quizi" className="px-5 py-3 rounded-xl bg-quizzy-text text-quizzy-card font-semibold hover:opacity-80 transition-opacity">
          Günün Quizi&apos;ni çöz
        </Link>
      </div>
    </div>
  );
}
