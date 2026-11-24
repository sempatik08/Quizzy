import type { Category } from '@/types';

/**
 * Public category pages (PBI 29): Turkish slugs and copy. The keys must match
 * the bank's categories; tests/question_bank_test.js does not need to know
 * about this file because the build fails on a key the bank does not have.
 */
export interface CategoryPage {
  key: Category;
  slug: string;
  name: string;
  emoji: string;
  /** One-line summary for listings and the meta description. */
  summary: string;
  /** A short paragraph at the top of the page. */
  intro: string;
}

export const CATEGORY_PAGES: CategoryPage[] = [
  {
    key: 'general', slug: 'genel-kultur', name: 'Genel Kültür', emoji: '🧠',
    summary: 'Bilimden gündelik hayata, her konudan genel kültür soruları.',
    intro: 'Genel kültür, bilgi yarışmalarının kalbidir: bilim, doğa, yemek, gelenekler ve "bunu herkes bilir mi?" dedirten sorular. Aşağıda Quizzy\'nin genel kültür havuzundan örnek sorular ve cevapları var; kendini dene, sonra arkadaşlarınla canlı oyna.',
  },
  {
    key: 'history', slug: 'tarih', name: 'Tarih', emoji: '📜',
    summary: 'Antik çağdan Osmanlı\'ya, dünya savaşlarından Cumhuriyet\'e tarih soruları.',
    intro: 'İmparatorluklar, savaşlar, devrimler ve onları yön veren insanlar. Tarih kategorisi; antik uygarlıklardan Osmanlı\'ya, iki dünya savaşından yakın tarihe uzanan sorularla bilgini ölçer.',
  },
  {
    key: 'geography', slug: 'cografya', name: 'Coğrafya', emoji: '🌍',
    summary: 'Ülkeler, başkentler, nehirler, dağlar ve bayraklar üzerine sorular.',
    intro: 'Hangi nehir hangi denize dökülür, hangi ülkenin bayrağında ne vardır? Coğrafya soruları haritada kaybolmadan dünyayı ne kadar tanıdığını gösterir.',
  },
  {
    key: 'cinema', slug: 'sinema-dizi', name: 'Sinema & Dizi', emoji: '🎬',
    summary: 'Klasik filmler, yönetmenler, oyuncular ve diziler hakkında sorular.',
    intro: 'Oscar\'lı filmler, efsane yönetmenler, unutulmaz replikler ve sevilen diziler. Sinema & dizi kategorisi film gecelerinin vazgeçilmez tartışmalarını bilgi yarışmasına taşır.',
  },
  {
    key: 'music', slug: 'muzik', name: 'Müzik', emoji: '🎵',
    summary: 'Klasikten popa, Türk müziğinden dünya listelerine müzik soruları.',
    intro: 'Besteciler, gruplar, albümler ve şarkıların hikâyeleri. Müzik soruları klasikten rock\'a, Türk pop\'undan dünya listelerine geniş bir yelpazeyi kapsar.',
  },
  {
    key: 'sports', slug: 'spor', name: 'Spor', emoji: '⚽',
    summary: 'Futbol, basketbol, olimpiyatlar ve rekorlar üzerine spor soruları.',
    intro: 'Şampiyonluklar, rekorlar, efsane sporcular ve kurallar. Spor kategorisi futboldan basketbola, tenisten olimpiyatlara kadar uzanır.',
  },
  {
    key: 'world_cup', slug: 'dunya-kupasi', name: 'Dünya Kupası', emoji: '🏆',
    summary: 'FIFA Dünya Kupası tarihi, ev sahipleri, golcüler ve rekorlar.',
    intro: '1930\'dan bugüne Dünya Kupası: ev sahipleri, finaller, gol kralları ve unutulmaz anlar. Futbolseverlerin en çok tartıştığı turnuvanın soruları burada.',
  },
  {
    key: 'technology', slug: 'teknoloji', name: 'Teknoloji', emoji: '💻',
    summary: 'Bilgisayar tarihi, internet, yazılım ve icatlar üzerine sorular.',
    intro: 'İlk bilgisayarlardan yapay zekâya, programlama dillerinden internetin doğuşuna. Teknoloji soruları dijital dünyanın nasıl kurulduğunu sorar.',
  },
  {
    key: 'literature', slug: 'edebiyat', name: 'Edebiyat', emoji: '📚',
    summary: 'Türk ve dünya edebiyatından yazarlar, romanlar ve şiirler.',
    intro: 'Romanlar, şairler, akımlar ve unutulmaz karakterler. Edebiyat kategorisi Türk ve dünya edebiyatının klasiklerinden sorular içerir.',
  },
  {
    key: 'philosophy', slug: 'felsefe', name: 'Felsefe', emoji: '🤔',
    summary: 'Büyük düşünürler, felsefe akımları ve fikirler üzerine sorular.',
    intro: 'Sokrates\'ten Nietzsche\'ye, varoluşçuluktan pozitivizme. Felsefe soruları fikirlerin tarihini ve onları ortaya atanları sorar.',
  },
  {
    key: 'math', slug: 'matematik', name: 'Matematik', emoji: '🔢',
    summary: 'Sayılar, geometri, ünlü teoremler ve matematikçiler.',
    intro: 'Asal sayılar, ünlü teoremler, paradokslar ve onları bulan matematikçiler. Matematik soruları hesap makinesinden çok merak ister.',
  },
  {
    key: 'anime', slug: 'anime', name: 'Anime', emoji: '🎌',
    summary: 'Anime ve manga serileri, stüdyolar, karakterler ve yaratıcılar.',
    intro: 'Klasik serilerden yeni sezonlara, stüdyolardan seslendirme sanatçılarına. Anime kategorisi Japon animasyonu ve manga hayranları için.',
  },
  {
    key: 'games', slug: 'oyunlar', name: 'Oyunlar', emoji: '🎮',
    summary: 'Video oyunları, konsollar, oyun serileri ve masa oyunları.',
    intro: 'Efsane oyun serileri, konsollar, karakterler ve masa oyunları. Oyunlar kategorisi oyuncuların bildiği ama çoğu zaman unuttuğu detayları sorar.',
  },
  {
    key: 'tr_magazine', slug: 'turkiye-magazini', name: 'Türkiye Magazini', emoji: '⭐',
    summary: 'Türk ünlüleri, diziler, şarkıcılar ve ekranın unutulmazları.',
    intro: 'Yeşilçam yıldızlarından bugünün dizi oyuncularına, şarkıcılardan programlara. Türkiye magazini soruları ekranın ve sahnenin hafızasını yoklar.',
  },
  {
    key: 'world_magazine', slug: 'dunya-magazini', name: 'Dünya Magazini', emoji: '✨',
    summary: 'Hollywood, pop yıldızları, kırmızı halı ve ödül törenleri.',
    intro: 'Hollywood ünlüleri, pop yıldızları, ödül törenleri ve kırmızı halı. Dünya magazini kategorisi popüler kültürün nabzını tutar.',
  },
];

export const categoryBySlug = (slug: string) => CATEGORY_PAGES.find((c) => c.slug === slug) ?? null;
