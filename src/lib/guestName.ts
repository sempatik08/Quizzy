import type { Language } from './i18n';

// Playful adjective + noun combos so a first-time player never faces an empty
// required field — they get a name they can keep or replace in one edit.
const WORDS: Record<Language, { adjectives: string[]; nouns: string[] }> = {
  tr: {
    adjectives: ['Turuncu', 'Mavi', 'Gizli', 'Hızlı', 'Cesur', 'Sinsi', 'Bilge', 'Vahşi', 'Sessiz', 'Parlak'],
    nouns: ['Tilki', 'Kartal', 'Şahin', 'Kaplan', 'Panda', 'Baykuş', 'Kurt', 'Ejder', 'Aslan', 'Ayı'],
  },
  en: {
    adjectives: ['Orange', 'Sneaky', 'Swift', 'Brave', 'Wise', 'Wild', 'Silent', 'Bright', 'Clever', 'Bold'],
    nouns: ['Fox', 'Eagle', 'Falcon', 'Tiger', 'Panda', 'Owl', 'Wolf', 'Dragon', 'Lion', 'Bear'],
  },
};

/** Generates a fun placeholder name like "Turuncu Tilki42" so onboarding never starts on a blank field. */
export function randomGuestName(lang: Language = 'tr'): string {
  const { adjectives, nouns } = WORDS[lang];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 90) + 10;
  return `${adjective} ${noun}${number}`;
}
