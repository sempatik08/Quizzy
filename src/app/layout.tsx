import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { LanguageProvider } from '@/context/LanguageContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { SoundProvider } from '@/context/SoundContext';
import { ProfileProvider } from '@/context/ProfileContext';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { ServiceWorkerRegistrar } from '@/components/shared/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: 'Quizzy — Real-Time Team Quiz',
  description:
    'Real-time team quiz battles. Pick your side, vote together, steal the win. '
    + '2400 questions across 12 categories, free and no sign-up.',
  applicationName: 'Quizzy',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Quizzy',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Quizzy — Real-Time Team Quiz',
    description: 'Pick your side, vote together, steal the win. Free, no sign-up.',
    type: 'website',
    siteName: 'Quizzy',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Quizzy — Real-Time Team Quiz',
    description: 'Pick your side, vote together, steal the win. Free, no sign-up.',
  },
};

// themeColor belongs in viewport rather than metadata in the App Router;
// putting it under metadata logs a deprecation warning on every render.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F4F6' },
    { media: '(prefers-color-scheme: dark)', color: '#111827' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-quizzy-bg antialiased">
        <ThemeProvider>
          <LanguageProvider>
            <SoundProvider>
              <ProfileProvider>
                <LanguageSwitcher />
                {children}
              </ProfileProvider>
            </SoundProvider>
          </LanguageProvider>
        </ThemeProvider>
        <ServiceWorkerRegistrar />
        <Analytics />
      </body>
    </html>
  );
}
