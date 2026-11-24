'use strict';

/**
 * Bot opponents for free-for-all (PBI 36).
 *
 * The last fallback for a player with nobody to play: no live opponent and no
 * ghost recording (PBI 35). Unlike a ghost, a bot is openly a bot — the client
 * labels it as one — and it decides each question on the spot.
 *
 * The decision is deliberately simple and probabilistic: a level sets how often
 * the bot is right and how fast it answers, and the question's difficulty tag
 * (PBI 7) moves the accuracy up or down. Its answer goes through the normal
 * answer path (ffa.castAnswer), so it is scored by the live rules like anyone.
 */

const { difficultyOf } = require('./difficulty');

const LEVELS = {
  /** Right a bit under half the time, answers late. */
  easy: { accuracy: 0.45, speed: [0.45, 0.9], skip: 0.05 },
  /** Right two times in three, mid-window. */
  medium: { accuracy: 0.65, speed: [0.3, 0.7], skip: 0.02 },
  /** Right most of the time, answers early. */
  hard: { accuracy: 0.85, speed: [0.15, 0.45], skip: 0 },
};
const LEVEL_KEYS = Object.keys(LEVELS);
const DEFAULT_LEVEL = 'medium';

/** Easy questions (1) lift accuracy, hard ones (3) cut it. */
const DIFFICULTY_SHIFT = { 1: 0.15, 2: 0, 3: -0.15 };

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E'];

/**
 * Multiplies every answer time. 1 in production; the socket test shrinks it so
 * a 15-question match against a slow bot runs in seconds, like the other
 * QUIZZY_FFA_* timing knobs.
 */
const TIME_SCALE = (() => {
  const v = parseFloat(process.env.QUIZZY_BOT_TIME_SCALE ?? '');
  return Number.isFinite(v) && v > 0 ? v : 1;
})();

function isValidLevel(level) {
  return LEVEL_KEYS.includes(level);
}

/** Chance this level answers this question correctly. */
function accuracyFor(level, question) {
  const base = LEVELS[level]?.accuracy ?? LEVELS[DEFAULT_LEVEL].accuracy;
  const shifted = base + (DIFFICULTY_SHIFT[difficultyOf(question)] ?? 0);
  return Math.min(0.98, Math.max(0.05, shifted));
}

/**
 * What the bot does on one question.
 * @param {{ answer: string, options?: object, difficulty?: number }} question
 * @param {string} level easy | medium | hard
 * @param {number} durationMs the answer window
 * @param {() => number} rng 0..1, injectable for tests
 * @returns {{ option: string|null, elapsedMs: number|null }}
 */
function decide(question, level, durationMs, rng = Math.random) {
  const cfg = LEVELS[level] ?? LEVELS[DEFAULT_LEVEL];
  if (rng() < cfg.skip) return { option: null, elapsedMs: null };

  const [lo, hi] = cfg.speed;
  const elapsedMs = Math.round(durationMs * (lo + (hi - lo) * rng()) * TIME_SCALE);

  if (rng() < accuracyFor(level, question)) return { option: question.answer, elapsedMs };

  // A wrong answer among the options the question actually has.
  const present = OPTION_KEYS.filter((k) => !question.options || question.options[k]);
  const wrong = present.filter((k) => k !== question.answer);
  return { option: wrong[Math.floor(rng() * wrong.length)] ?? null, elapsedMs };
}

module.exports = {
  LEVELS,
  LEVEL_KEYS,
  DEFAULT_LEVEL,
  isValidLevel,
  accuracyFor,
  decide,
};
