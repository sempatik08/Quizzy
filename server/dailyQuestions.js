'use strict';

/**
 * Which questions a given day of Günün Quizi uses (PBI 26), and the calendar
 * around it. Pure: no store, no sockets — so the Next.js archive pages
 * (PBI 29) can show past days with the exact same selection the game used.
 * See server/daily.js for how the quiz itself runs.
 */

const { QUESTIONS, CATEGORY_KEYS } = require('./questions');

const DAILY_EPOCH = '2026-11-24';
const QUESTION_COUNT = 10;
/** Seconds a player has per question. */
const QUESTION_SECONDS = 20;
/** Network slack before a late answer is treated as a timeout. */
const GRACE_MS = 2500;
/** Longest answer-reveal pause the client may keep off the player's clock. */
const REVEAL_MS = 4000;
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
/** Difficulty mix: 3 easy, 4 medium, 3 hard (falls back when a tier is short). */
const DIFFICULTY_PLAN = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];

/** YYYY-MM-DD in Türkiye for a timestamp. */
function dateFor(now = Date.now()) {
  return new Date(now + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Quizzy #N for a date. Day #1 is DAILY_EPOCH. */
function dayNumber(date) {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`);
  return Math.floor(ms / 86400000) + 1;
}

/** The date of Quizzy #N. */
function dateForDay(n) {
  return new Date(Date.parse(`${DAILY_EPOCH}T00:00:00Z`) + (n - 1) * 86400000).toISOString().slice(0, 10);
}

/** Epoch ms of the next midnight in Türkiye — when tomorrow's quiz opens. */
function nextResetAt(now = Date.now()) {
  const date = dateFor(now);
  return Date.parse(`${date}T00:00:00Z`) - TZ_OFFSET_MS + 86400000;
}

function isValidDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
}

// --- Deterministic selection -------------------------------------------------

function hashString(s) {
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const cache = new Map(); // date → question objects (full, with answers)

/** The day's 10 questions, with answers. Server-side only. */
function questionsFor(date) {
  if (cache.has(date)) return cache.get(date);
  const rand = mulberry32(hashString(`quizzy-daily:${date}`));
  const categories = shuffled(CATEGORY_KEYS, rand).slice(0, QUESTION_COUNT);
  const picked = categories.map((category, i) => {
    const pool = QUESTIONS[category].filter((q) => q.text_tr && q.options_tr);
    const want = DIFFICULTY_PLAN[i];
    const tier = pool.filter((q) => (q.difficulty ?? 2) === want);
    const from = tier.length > 0 ? tier : pool;
    const q = from[Math.floor(rand() * from.length)];
    return { ...q, category };
  });
  picked.sort((a, b) => (a.difficulty ?? 2) - (b.difficulty ?? 2));
  if (cache.size > 7) cache.delete(cache.keys().next().value);
  cache.set(date, picked);
  return picked;
}

/**
 * The question objects for a stored id list, in that order, or null when any id
 * is no longer in the bank (a question was removed or renamed). daily.js pins
 * each day's ids in the store so a deploy that grows the bank mid-day cannot
 * reshuffle the day; this turns the pinned ids back into questions.
 */
function questionsFromIds(ids) {
  if (!Array.isArray(ids) || ids.length !== QUESTION_COUNT) return null;
  const out = [];
  for (const id of ids) {
    const q = bankById().get(id);
    if (!q) return null;
    out.push(q);
  }
  return out;
}

let byId = null;
function bankById() {
  if (byId) return byId;
  byId = new Map();
  for (const category of CATEGORY_KEYS) {
    for (const q of QUESTIONS[category]) {
      if (q.text_tr && q.options_tr) byId.set(q.id, { ...q, category });
    }
  }
  return byId;
}

/** What a player may see before answering: no answer, no explanation. */
function publicQuestion(q) {
  return {
    id: q.id,
    category: q.category,
    difficulty: q.difficulty ?? 2,
    text: q.text,
    text_tr: q.text_tr,
    options: q.options,
    options_tr: q.options_tr,
  };
}

module.exports = {
  DAILY_EPOCH,
  QUESTION_COUNT,
  QUESTION_SECONDS,
  GRACE_MS,
  REVEAL_MS,
  dateFor,
  dayNumber,
  dateForDay,
  nextResetAt,
  isValidDate,
  questionsFor,
  questionsFromIds,
  publicQuestion,
};
