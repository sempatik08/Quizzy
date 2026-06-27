import type { Metadata } from 'next';
import './globals.css';
import { LanguageProvider } from '@/context/LanguageContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';

export const metadata: Metadata = {
  title: 'Quizzy — Real-Time Team Quiz',
  description: 'A real-time competitive quiz game for teams.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-quizzy-bg antialiased">
        <ThemeProvider>
          <LanguageProvider>
            <LanguageSwitcher />
            {children}
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
