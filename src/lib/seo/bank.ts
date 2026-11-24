/**
 * Build/server-side access to the question bank for the public SEO pages
 * (PBI 29). Never imported by a client component: the bank is ~9000 questions.
 */
import type { Category, OptionKey } from '@/types';

export interface BankQuestion {
  id: string;
  text: string;
  text_tr: string;
  options: Record<OptionKey, string>;
  options_tr: Record<OptionKey, string>;
  answer: OptionKey;
  difficulty?: number;
  explanation?: string;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { QUESTIONS } = require('../../../server/questions') as { QUESTIONS: Record<Category, BankQuestion[]> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dailyQuestions = require('../../../server/dailyQuestions') as {
  DAILY_EPOCH: string;
  dateFor: (now?: number) => string;
  dayNumber: (date: string) => number;
  dateForDay: (n: number) => string;
  questionsFor: (date: string) => Array<BankQuestion & { category: Category }>;
};

export const SAMPLE_SIZE = 20;

/**
 * A fixed, evenly spread sample of a category: the same 20 every build, so
 * the indexed page does not change under the crawler, and spread across the
 * pool so it is not just the first (easiest, oldest) questions.
 */
export function sampleQuestions(category: Category, n = SAMPLE_SIZE): BankQuestion[] {
  const pool = (QUESTIONS[category] ?? []).filter((q) => q.text_tr && q.options_tr);
  if (pool.length <= n) return pool;
  const step = pool.length / n;
  return Array.from({ length: n }, (_, i) => pool[Math.floor(i * step + step / 2)]);
}

export function categorySize(category: Category): number {
  return (QUESTIONS[category] ?? []).length;
}

/** Days of Günün Quizi that are over (today is never shown — it would spoil it). */
export function pastDailyDays(now = Date.now()): number[] {
  const today = dailyQuestions.dayNumber(dailyQuestions.dateFor(now));
  return Array.from({ length: Math.max(0, today - 1) }, (_, i) => today - 1 - i);
}

export function dailyDay(n: number, now = Date.now()) {
  const today = dailyQuestions.dayNumber(dailyQuestions.dateFor(now));
  if (!Number.isInteger(n) || n < 1 || n >= today) return null;
  const date = dailyQuestions.dateForDay(n);
  return { day: n, date, questions: dailyQuestions.questionsFor(date) };
}
