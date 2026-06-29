'use client';

import { useState } from 'react';
import { Github, Twitter, Globe, X, Zap, Trophy, Shuffle, Crown, BookOpen, Tag } from 'lucide-react';
import { TextHoverEffect, FooterBackgroundGradient } from '@/components/ui/hover-footer';

/* ─── Modal content ─── */
type ModalKey = 'howToPlay' | 'categories' | 'scoring' | 'teamSelection' | 'steal' | 'captain';

const MODAL_CONTENT: Record<ModalKey, { title: string; icon: React.ReactNode; content: React.ReactNode }> = {
  howToPlay: {
    title: 'Nasıl Oynanır?',
    icon: <BookOpen size={20} className="text-blue-400" />,
    content: (
      <ol className="space-y-4 text-gray-300 text-sm leading-relaxed list-none">
        {[
          ['1', 'Oda Oluştur veya Katıl', 'Bir oyuncu oda oluşturur, diğerleri 6 haneli oda koduyla katılır.'],
          ['2', 'Takım Seç', 'Her oyuncu Mavi veya Kırmızı takımı seçer. Her takımda 1–3 oyuncu olabilir.'],
          ['3', 'Takımları Kilitle', 'Host "Takımları Kilitle & Başlat" butonuna basar. Kaptan oylaması başlar.'],
          ['4', 'Yazı Tura', 'Sunucu otomatik olarak yazı tura atar. Kazanan takım kategori seçer.'],
          ['5', 'Soru & Oylama', 'Aktif takım 60 saniye içinde 5 seçenekten birini oylamayla seçer. Kaptan "Onayla" butonuna basar.'],
          ['6', 'Steal', 'Yanlış cevap verilirse rakip takım aynı soruyu steal etmeye çalışır.'],
          ['7', 'Kazanan', 'İlk 100 puana ulaşan takım oyunu kazanır!'],
        ].map(([num, title, desc]) => (
          <li key={num} className="flex gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-bold flex items-center justify-center">
              {num}
            </span>
            <div>
              <p className="text-white font-medium mb-0.5">{title}</p>
              <p className="text-gray-400">{desc}</p>
            </div>
          </li>
        ))}
      </ol>
    ),
  },
  categories: {
    title: 'Kategoriler',
    icon: <Tag size={20} className="text-purple-400" />,
    content: (
      <div className="space-y-3 text-sm">
        {[
          { name: 'Genel Kültür', count: 194, color: 'blue', emoji: '🧠' },
          { name: 'Sinema & Dizi', count: 100, color: 'yellow', emoji: '🎬' },
          { name: 'Oyunlar', count: 100, color: 'green', emoji: '🎮' },
          { name: 'Spor', count: 88, color: 'orange', emoji: '⚽' },
          { name: 'Tarih', count: 5, color: 'amber', emoji: '📜', soon: true },
          { name: 'Müzik', count: 5, color: 'pink', emoji: '🎵', soon: true },
          { name: 'Anime', count: 5, color: 'red', emoji: '🎌', soon: true },
          { name: 'Teknoloji', count: 5, color: 'cyan', emoji: '💻', soon: true },
          { name: 'Edebiyat', count: 5, color: 'violet', emoji: '📚', soon: true },
          { name: 'Matematik', count: 5, color: 'teal', emoji: '🔢', soon: true },
          { name: 'Coğrafya', count: 5, color: 'lime', emoji: '🌍', soon: true },
        ].map((cat) => (
          <div key={cat.name} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-lg">{cat.emoji}</span>
              <span className={`text-white font-medium ${cat.soon ? 'opacity-60' : ''}`}>{cat.name}</span>
              {cat.soon && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400 font-medium">YAKINDA</span>
              )}
            </div>
            <span className="text-gray-400 text-xs font-mono">{cat.count} soru</span>
          </div>
        ))}
        <p className="text-gray-500 text-xs pt-1">Yeni kategoriler ekleniyor...</p>
      </div>
    ),
  },
  scoring: {
    title: 'Puan Sistemi',
    icon: <Trophy size={20} className="text-yellow-400" />,
    content: (
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-1 gap-3">
          {[
            { label: 'Doğru Cevap', points: '+5', color: 'green', desc: 'Aktif takım doğru cevap verirse +5 puan kazanır.' },
            { label: 'Steal ile Doğru', points: '+10', color: 'blue', desc: 'Rakip takım steal edip doğru cevap verirse +10 puan kazanır.' },
            { label: 'Yanlış Cevap', points: '0', color: 'red', desc: 'Yanlış cevapta puan verilmez; seçenek devre dışı kalır.' },
            { label: 'Tüm Seçenekler Bitti', points: '0', color: 'gray', desc: 'Hiçbir takım doğru cevap veremezse soru geçilir, puan yok.' },
          ].map((item) => (
            <div key={item.label} className="flex gap-3 items-start p-3 rounded-xl bg-white/5 border border-white/10">
              <span
                className={`flex-shrink-0 text-lg font-black w-12 text-center ${
                  item.color === 'green' ? 'text-green-400' :
                  item.color === 'blue' ? 'text-blue-400' :
                  item.color === 'red' ? 'text-red-400' : 'text-gray-500'
                }`}
              >
                {item.points}
              </span>
              <div>
                <p className="text-white font-semibold mb-0.5">{item.label}</p>
                <p className="text-gray-400">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
          <p className="text-yellow-400 font-bold text-base">🏆 Hedef: 100 Puan</p>
          <p className="text-gray-400 mt-1">İlk 100 puana ulaşan takım oyunu kazanır.</p>
        </div>
      </div>
    ),
  },
  teamSelection: {
    title: 'Takım Seçimi',
    icon: <Zap size={20} className="text-blue-400" />,
    content: (
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-center">
            <div className="text-2xl mb-1">🔵</div>
            <p className="text-blue-400 font-bold">Mavi Takım</p>
            <p className="text-gray-400 text-xs mt-1">1–3 oyuncu</p>
          </div>
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-center">
            <div className="text-2xl mb-1">🔴</div>
            <p className="text-red-400 font-bold">Kırmızı Takım</p>
            <p className="text-gray-400 text-xs mt-1">1–3 oyuncu</p>
          </div>
        </div>
        <div className="space-y-3 text-gray-300">
          {[
            ['👆', 'Takım Seçimi', 'Lobiye girince sol veya sağ takıma tıklayarak katılırsın.'],
            ['🔄', 'Takım Değişikliği', 'Takımlar kilitlenmeden önce istediğin zaman takım değiştirebilirsin.'],
            ['🔒', 'Kilitleme', 'Host "Takımları Kilitle & Başlat" butonuna basar. Her iki takımda da en az bir oyuncu olmalıdır.'],
            ['⚖️', 'Denge', 'Takımlarda eşit sayıda oyuncu olmak zorunda değildir; strateji sizin elinizdedir.'],
          ].map(([emoji, title, desc]) => (
            <div key={title} className="flex gap-3 items-start">
              <span className="text-lg flex-shrink-0">{emoji}</span>
              <div>
                <p className="text-white font-medium mb-0.5">{title}</p>
                <p className="text-gray-400">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  steal: {
    title: 'Steal Mekanizması',
    icon: <Shuffle size={20} className="text-orange-400" />,
    content: (
      <div className="space-y-4 text-sm">
        <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30">
          <p className="text-orange-400 font-bold mb-1">⚡ Steal Nedir?</p>
          <p className="text-gray-300">Aktif takım yanlış cevap verdiğinde rakip takıma aynı soruyu cevaplama hakkı verilir. Buna "steal" denir.</p>
        </div>
        <div className="space-y-3">
          {[
            ['1', 'Yanlış Cevap', 'Aktif takım yanlış seçeneği oylayıp kaptan onaylarsa o seçenek devre dışı kalır.'],
            ['2', 'Steal Hakkı', 'Rakip takım aynı soruyu devre dışı kalan seçenekler olmadan cevaplamak için devreye girer.'],
            ['3', 'Steal Başarılı', 'Rakip doğru cevap verirse +10 puan kazanır (normal cevabın 2 katı).'],
            ['4', 'Steal Başarısız', 'Rakip de yanlış cevap verirse o seçenek de devre dışı kalır ve sıra tekrar değişebilir.'],
            ['5', 'Tüm Seçenekler Bitti', 'Hiçbir takım doğru cevaplayamazsa soru geçilir, puan verilmez.'],
          ].map(([num, title, desc]) => (
            <div key={num} className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-400 text-xs font-bold flex items-center justify-center">
                {num}
              </span>
              <div>
                <p className="text-white font-medium mb-0.5">{title}</p>
                <p className="text-gray-400">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  captain: {
    title: 'Kaptan Seçimi',
    icon: <Crown size={20} className="text-yellow-400" />,
    content: (
      <div className="space-y-4 text-sm">
        <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
          <p className="text-yellow-400 font-bold mb-1">👑 Kaptan Kimdir?</p>
          <p className="text-gray-300">Her takımda bir kaptan bulunur. Kaptan, oylamanın sonucunu onaylayan ve "Cevabı Onayla" butonuna basan kişidir.</p>
        </div>
        <div className="space-y-3">
          {[
            ['🗳️', 'Oylama', 'Takım üyeleri lobide birbirine oy verir. Kendi kendine oy verilemez.'],
            ['🏆', 'Seçilme', 'En çok oy alan oyuncu kaptan seçilir. Eşitlik durumunda sistem rastgele belirler.'],
            ['📢', 'Soruyu Okumak', 'Kaptan, soru ekranında soruyu sesli okur ve takım tartışır.'],
            ['✅', 'Onaylama', 'Takım oylamayla çoğunluk seçeneğini belirledikten sonra kaptan "Cevabı Onayla" butonuna basar.'],
            ['⏱️', 'Süre', 'Oylama için 60 saniye vardır. Süre dolduğunda çoğunluk seçeneği otomatik uygulanır.'],
          ].map(([emoji, title, desc]) => (
            <div key={title} className="flex gap-3 items-start">
              <span className="text-lg flex-shrink-0">{emoji}</span>
              <div>
                <p className="text-white font-medium mb-0.5">{title}</p>
                <p className="text-gray-400">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
};

const socialLinks = [
  { icon: <Github size={15} />, label: 'GitHub', href: 'https://github.com/sempatik08/Quizzy' },
  { icon: <Twitter size={15} />, label: 'Twitter', href: '#' },
  { icon: <Globe size={15} />, label: 'Web', href: '#' },
];

/* ─── Modal ─── */
function InfoModal({ modalKey, onClose }: { modalKey: ModalKey; onClose: () => void }) {
  const { title, icon, content } = MODAL_CONTENT[modalKey];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-white font-bold text-lg">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          {content}
        </div>
      </div>
    </div>
  );
}

const ALL_LINKS = [
  { label: 'Nasıl Oynanır?', modal: 'howToPlay' as ModalKey, icon: <BookOpen size={14} /> },
  { label: 'Kategoriler',    modal: 'categories' as ModalKey, icon: <Tag size={14} /> },
  { label: 'Puan Sistemi',   modal: 'scoring' as ModalKey,    icon: <Trophy size={14} /> },
  { label: 'Takım Seçimi',   modal: 'teamSelection' as ModalKey, icon: <Zap size={14} /> },
  { label: 'Steal',          modal: 'steal' as ModalKey,      icon: <Shuffle size={14} /> },
  { label: 'Kaptan Seçimi',  modal: 'captain' as ModalKey,    icon: <Crown size={14} /> },
];

/* ─── Main component ─── */
export function HoverFooter() {
  const [activeModal, setActiveModal] = useState<ModalKey | null>(null);

  return (
    <>
      {activeModal && <InfoModal modalKey={activeModal} onClose={() => setActiveModal(null)} />}

      <footer
        className="relative w-full overflow-hidden border-t"
        style={{
          backgroundColor: 'var(--footer-bg)',
          borderColor: 'var(--footer-border)',
        }}
      >
        <div className="relative z-10 max-w-6xl mx-auto px-6">

          {/* ── Main row ── */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-10 py-12">

            {/* Brand */}
            <div className="flex-shrink-0 flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-soft flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Zap size={17} className="text-white" fill="white" />
                </div>
                <span className="text-2xl font-black tracking-tight" style={{ color: 'var(--footer-text)' }}>
                  Quizzy
                </span>
              </div>
              <p className="text-[13px] leading-relaxed max-w-[220px]" style={{ color: 'var(--footer-muted)' }}>
                Gerçek zamanlı rekabetçi bilgi yarışması.
              </p>
              <div className="flex gap-3 mt-0.5">
                {socialLinks.map(({ icon, label, href }) => (
                  <a
                    key={label}
                    href={href}
                    aria-label={label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-100"
                    style={{
                      backgroundColor: 'var(--footer-social-bg)',
                      border: '1px solid var(--footer-social-border)',
                      color: 'var(--footer-muted)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--footer-text)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--footer-muted)')}
                  >
                    {icon}
                  </a>
                ))}
              </div>
            </div>

            {/* Divider (vertical on lg) */}
            <div
              className="hidden lg:block w-px h-24"
              style={{ backgroundColor: 'var(--footer-divider)' }}
            />

            {/* Links grid */}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ALL_LINKS.map((link) => (
                <button
                  key={link.label}
                  onClick={() => setActiveModal(link.modal)}
                  className="group flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all text-left"
                  style={{
                    backgroundColor: 'var(--footer-item-bg)',
                    border: '1px solid var(--footer-item-border)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = 'var(--footer-item-hover-bg)';
                    e.currentTarget.style.borderColor = 'var(--footer-item-hover-border)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'var(--footer-item-bg)';
                    e.currentTarget.style.borderColor = 'var(--footer-item-border)';
                  }}
                >
                  <span className="flex-shrink-0 transition-colors" style={{ color: 'var(--footer-muted)' }}>
                    {link.icon}
                  </span>
                  <span className="text-[13px] font-medium transition-colors" style={{ color: 'var(--footer-muted)' }}>
                    {link.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Bottom strip ── */}
          <div
            className="py-4 flex flex-col sm:flex-row items-center justify-between gap-2 border-t"
            style={{ borderColor: 'var(--footer-divider)' }}
          >
            <div className="flex items-center gap-3">
              <span
                className="text-[11px] px-2.5 py-1 rounded-full"
                style={{
                  color: 'var(--footer-muted)',
                  backgroundColor: 'var(--footer-badge-bg)',
                  border: '1px solid var(--footer-badge-border)',
                }}
              >482+ soru</span>
              <span
                className="text-[11px] px-2.5 py-1 rounded-full"
                style={{
                  color: 'var(--footer-muted)',
                  backgroundColor: 'var(--footer-badge-bg)',
                  border: '1px solid var(--footer-badge-border)',
                }}
              >🏆 100 puana ulaş</span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--footer-muted)' }}>
              &copy; {new Date().getFullYear()} Quizzy. Tüm hakları saklıdır.
            </p>
          </div>
        </div>

        {/* Big text hover effect */}
        <div className="h-32 select-none -mb-2">
          <TextHoverEffect text="QUIZZY" />
        </div>

        <FooterBackgroundGradient />
      </footer>
    </>
  );
}
