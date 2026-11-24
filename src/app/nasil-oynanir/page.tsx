import type { Metadata } from 'next';
import Link from 'next/link';
import { SeoShell, PlayCta } from '@/components/seo/SeoShell';
import { MODE_WIN_THRESHOLD } from '@/lib/gameModes';
import modeData from '@/data/game-modes.json';
import questionCounts from '@/data/question-counts.json';

export const metadata: Metadata = {
  title: 'Nasıl Oynanır? Arkadaşlarla Online Takımlı Bilgi Yarışması | Quizzy',
  description:
    'Quizzy nasıl oynanır: oda kur, linki gönder, takımını seç, birlikte oyla. Klasik, Hızlı, Bahis, Survival ve Herkes Kendine modları; sınıf ve arkadaş grupları için ücretsiz, kayıtsız online bilgi yarışması.',
  alternates: { canonical: '/nasil-oynanir' },
};

const q = modeData.questionSeconds;

export default function HowToPlay() {
  return (
    <SeoShell>
      <article className="space-y-6 text-quizzy-text leading-relaxed">
        <header>
          <h1 className="text-3xl font-extrabold">Quizzy nasıl oynanır?</h1>
          <p className="mt-3 text-quizzy-muted">
            Quizzy, arkadaşlarınla tarayıcıdan oynadığın gerçek zamanlı bir bilgi yarışması. Uygulama indirmek
            ya da üye olmak yok: bir oda kurarsın, linki gönderirsin, herkes telefonundan ya da bilgisayarından
            katılır. {questionCounts.categoryCount} kategoride {questionCounts.total} soru var.
          </p>
        </header>

        <section>
          <h2 className="text-xl font-bold">1. Oda kur ve linki gönder</h2>
          <p className="mt-2">
            Ana sayfada adını yaz ve <strong>Oda Oluştur</strong>&apos;a bas. Lobide çıkan davet linkini WhatsApp&apos;tan
            ya da istediğin yerden gönder; link açan kişi sadece adını yazıp odaya girer. İstersen 6 haneli oda
            kodunu da paylaşabilirsin.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">2. Takımını seç</h2>
          <p className="mt-2">
            Takımlı modlarda oyuncular <strong>Mavi</strong> ya da <strong>Kırmızı</strong> takıma geçer (takım başına
            1–3 kişi). Takımlar kilitlenince her takım bir kaptan seçer, yazı tura atılır ve kazanan takım ilk
            kategoriyi belirler.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">3. Birlikte oyla, kaptan onaylasın</h2>
          <p className="mt-2">
            Her soruda 5 seçenek var. Sırası gelen takımın oyuncuları seçeneklere oy verir, kaptan son cevabı
            onaylar. Yanlış cevap verilirse rakip takım <strong>steal</strong> ile aynı soruyu çalmayı deneyebilir;
            her takımın maç başına 2 steal hakkı vardır. Takım başına bir kez <strong>%50</strong> (iki yanlış şıkkı
            eler) ve <strong>ek süre</strong> jokeri kullanılabilir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Oyun modları</h2>
          <ul className="mt-2 space-y-2 list-disc pl-5">
            <li><strong>Klasik</strong> — soru başına {q.classic} saniye, ilk {MODE_WIN_THRESHOLD.classic} puana ulaşan takım kazanır.</li>
            <li><strong>Hızlı</strong> — soru başına {q.fast} saniye, {MODE_WIN_THRESHOLD.fast} puanda biter. Kısa bir mola için ideal.</li>
            <li><strong>Bahis</strong> — soruyu görmeden {modeData.wagerOptions.join(', ')} puan arası bahse girersin; bilirsen kazanırsın, bilemezsen bahsin yarısını kaybedersin.</li>
            <li><strong>Survival</strong> — her yanlış cevap takımına bir oyuncuya mal olur. Takım başına en az 2 kişi gerekir.</li>
            <li><strong>Herkes Kendine</strong> — takım yok, herkes aynı soruyu {q.ffa} saniyede cevaplar; hızlı doğru cevap daha çok puan getirir. Tek başına da oynanabilir.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">Tek başına mı? Günün Quizi</h2>
          <p className="mt-2">
            Arkadaşın şu an müsait değilse <Link href="/gunun-quizi" className="text-blue-soft underline">Günün Quizi</Link>&apos;ni
            çöz: herkese aynı 10 soru, günde bir kez. Sonucunu 🟩🟥 ızgarasıyla paylaş, günün sıralamasında yerini gör.
            Eski günlerin soruları <Link href="/gunun-quizi/arsiv" className="text-blue-soft underline">arşivde</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Sınıfta ve etkinliklerde</h2>
          <p className="mt-2">
            Öğretmenler ve etkinlik düzenleyenler Quizzy&apos;yi sınıf içi bilgi yarışması olarak kullanabilir:
            öğrenciler telefonlarından linke girer, sınıf iki takıma ayrılır, sorular tahtaya yansıtılır.
            Kurulum, hesap ya da ücret gerekmez.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Sık sorulanlar</h2>
          <dl className="mt-2 space-y-3">
            <div>
              <dt className="font-semibold">Ücretli mi?</dt>
              <dd className="text-quizzy-muted">Hayır, Quizzy ücretsiz ve üyelik istemez.</dd>
            </div>
            <div>
              <dt className="font-semibold">Kaç kişi oynayabilir?</dt>
              <dd className="text-quizzy-muted">Takımlı modlarda takım başına 1–3 oyuncu, Herkes Kendine modunda 30 kişiye kadar. Ayrıca izleyici olarak katılmak mümkün.</dd>
            </div>
            <div>
              <dt className="font-semibold">Hangi cihazlarda çalışır?</dt>
              <dd className="text-quizzy-muted">Güncel bir tarayıcısı olan her telefon, tablet ve bilgisayarda. İstersen ana ekrana uygulama gibi ekleyebilirsin.</dd>
            </div>
          </dl>
        </section>
      </article>

      <PlayCta />
    </SeoShell>
  );
}
