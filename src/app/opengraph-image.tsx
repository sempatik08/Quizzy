import { ImageResponse } from 'next/og';
import questionCounts from '@/data/question-counts.json';

export const runtime = 'edge';
export const alt = 'Quizzy — Real-Time Team Quiz';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111827',
          backgroundImage: 'linear-gradient(135deg, #111827 0%, #1F2937 60%, #1E3A5F 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 96,
              height: 96,
              borderRadius: 24,
              background: 'linear-gradient(135deg, #4D96FF, #FF6B6B)',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 56,
            }}
          >
            🧠
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 96,
              fontWeight: 800,
              color: '#F9FAFB',
              letterSpacing: -2,
            }}
          >
            Quizzy
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 36,
            fontWeight: 600,
            color: '#93C5FD',
            marginBottom: 20,
          }}
        >
          Takım Kur, Çal, Kazan — Canlı Bilgi Yarışması
        </div>
        <div
          style={{
            display: 'flex',
            gap: 16,
          }}
        >
          {[
            `${questionCounts.total.toLocaleString('en-US')} Soru`,
            `${questionCounts.categoryCount} Kategori`,
            'Kayıt Gerektirmez',
          ].map((label) => (
            <div
              key={label}
              style={{
                display: 'flex',
                padding: '10px 24px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#F9FAFB',
                fontSize: 26,
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
