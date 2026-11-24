'use strict';

/**
 * Günün Quizi — the Daily Quiz (PBI 26).
 *
 * Everyone gets the same 10 questions on the same day, plays them alone, once,
 * and can share a result grid ("Quizzy #12 🟩🟩🟥…"). It is the first Quizzy
 * experience that needs no second player, and the link a social post can point
 * at.
 *
 * THE DAY
 * A "day" is the calendar date in Türkiye (UTC+3 all year, no DST since 2016),
 * because that is where the players are: the quiz turns over at midnight in
 * Istanbul, not at 03:00. Day #1 is DAILY_EPOCH.
 *
 * THE QUESTIONS
 * Picked from the bank with a PRNG seeded by the date, so every server instance
 * and every restart agrees without storing anything: one question from each of
 * 10 different categories, ordered easy → hard.
 *
 * TRUST
 * The server runs the quiz, not the client. Questions go out one at a time
 * without the answer, the server stamps when each one was shown and judges the
 * answer when it arrives, so neither correctness nor speed is client-reported.
 * Progress is stored after every answer and a profile can only play a day once:
 * reloading resumes at the same question rather than starting over. Profiles
 * themselves are client-made UUIDs (see stats.js), so the daily board is a fun
 * record, not a ranked ladder — same caveat as the main leaderboard.
 */

const { QUESTIONS, CATEGORY_KEYS } = require('./questions');
const store = require('./store');

const DAILY_EPOCH = '2026-11-24';
const QUESTION_COUNT = 10;
/** Seconds a player has per question. */
const QUESTION_SECONDS = 20;
/** Network slack before a late answer is treated as a timeout. */
const GRACE_MS = 2500;
/** Longest answer-reveal pause the client may keep off the player's clock. */
const REVEAL_MS = 4000;
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
const BOARD_LIMIT = 20;
/** Difficulty mix: 3 easy, 4 medium, 3 hard (falls back when a tier is short). */
const DIFFICULTY_PLAN = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];

const RESULT_KEY = (date, profileId) => `quizzy:daily:${date}:${profileId}`;
const PLAYERS_KEY = (date) => `quizzy:daily:${date}:players`;

/** YYYY-MM-DD in Türkiye for a timestamp. */
function dateFor(now = Date.now()) {
  return new Date(now + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Quizzy #N for a date. Day #1 is DAILY_EPOCH. */
function dayNumber(date) {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`);
  return Math.floor(ms / 86400000) + 1;
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

// --- Results -----------------------------------------------------------------

function summarize(record) {
  const answers = record.answers || [];
  return {
    score: answers.filter((a) => a.correct).length,
    ms: answers.reduce((n, a) => n + (a.ms || 0), 0),
    answered: answers.length,
    finished: answers.length >= QUESTION_COUNT,
  };
}

/** Per-question review for the result screen — only once the day is done. */
function review(date, record) {
  const qs = questionsFor(date);
  return qs.map((q, i) => ({
    ...publicQuestion(q),
    answer: q.answer,
    explanation: q.explanation ?? null,
    chosen: record.answers[i]?.answer ?? null,
    correct: Boolean(record.answers[i]?.correct),
    ms: record.answers[i]?.ms ?? null,
  }));
}

async function getRecord(date, profileId) {
  return store.getJSON(RESULT_KEY(date, profileId));
}

async function saveRecord(date, profileId, record) {
  await store.setJSON(RESULT_KEY(date, profileId), record);
}

/**
 * Today's board: finished players only, best score then fastest. Entries carry
 * names and avatars, never profile ids.
 */
async function leaderboard(date, myProfileId = null) {
  const ids = await store.getSet(PLAYERS_KEY(date));
  const records = await store.getManyJSON(ids.map((id) => RESULT_KEY(date, id)));
  const rows = [];
  records.forEach((rec, i) => {
    if (!rec) return;
    const s = summarize(rec);
    if (!s.finished) return;
    rows.push({ name: rec.name, avatar: rec.avatar, score: s.score, ms: s.ms, me: ids[i] === myProfileId });
  });
  rows.sort((a, b) => b.score - a.score || a.ms - b.ms);
  const myIndex = rows.findIndex((r) => r.me);
  return {
    entries: rows.slice(0, BOARD_LIMIT).map((r, i) => ({ rank: i + 1, ...r })),
    total: rows.length,
    myRank: myIndex >= 0 ? myIndex + 1 : null,
  };
}

/**
 * Where a profile stands today, without starting anything: lets the page
 * show "you already played" (with the result) instead of a Start button.
 */
async function status(profileId, now = Date.now()) {
  const date = dateFor(now);
  const record = profileId ? await getRecord(date, profileId) : null;
  if (record && summarize(record).finished) return { done: true, ...(await result(date, profileId, record)) };
  return { done: false, ...meta(date, now), answered: record ? record.answers.length : 0 };
}

/**
 * Start (or resume) today's quiz for a profile. Returns either the next
 * question to show, or the finished result when this profile already played.
 */
async function start(profileId, name, avatar, now = Date.now()) {
  const date = dateFor(now);
  let record = await getRecord(date, profileId);
  if (!record) {
    record = { name, avatar, answers: [], startedAt: now, shownAt: null };
    await store.addToSet(PLAYERS_KEY(date), profileId);
  } else {
    // A name change since the start shows on the board; the answers do not move.
    record.name = name;
    record.avatar = avatar;
  }
  if (summarize(record).finished) {
    await saveRecord(date, profileId, record);
    return { done: true, ...(await result(date, profileId, record)) };
  }
  // (Re)starting shows the current question afresh. A reload therefore restarts
  // that one question's clock — but its answer, and every earlier one, is
  // already locked, so there is nothing to gain by reloading.
  record.shownAt = now;
  record.revealUntil = null;
  await saveRecord(date, profileId, record);
  const index = record.answers.length;
  return { done: false, ...meta(date, now), index, question: publicQuestion(questionsFor(date)[index]) };
}

function meta(date, now) {
  return {
    date,
    day: dayNumber(date),
    total: QUESTION_COUNT,
    seconds: QUESTION_SECONDS,
    nextAt: nextResetAt(now),
  };
}

async function result(date, profileId, record) {
  return {
    ...meta(date, Date.now()),
    ...summarize(record),
    grid: record.answers.map((a) => (a.answer === null ? 'timeout' : a.correct ? 'correct' : 'wrong')),
    review: review(date, record),
    board: await leaderboard(date, profileId),
  };
}

/**
 * Judge one answer. `index` must be the question the server last showed this
 * profile; anything else (a replayed or out-of-order packet) is rejected.
 * `answer` is an option key, or null when the player's timer ran out.
 */
async function answer(profileId, index, choice, now = Date.now()) {
  const date = dateFor(now);
  const record = await getRecord(date, profileId);
  if (record && summarize(record).finished) return { error: 'Already finished today.' };
  if (!record || record.shownAt == null) return { error: 'Start the daily quiz first.' };
  if (index !== record.answers.length) return { error: 'Out of order.' };

  const q = questionsFor(date)[index];
  const elapsed = Math.max(0, now - record.shownAt);
  const late = elapsed > QUESTION_SECONDS * 1000 + GRACE_MS;
  const given = late ? null : choice;
  const correct = given !== null && given === q.answer;
  record.answers.push({ answer: given, correct, ms: Math.min(elapsed, QUESTION_SECONDS * 1000) });
  record.shownAt = null;

  const finished = record.answers.length >= QUESTION_COUNT;
  // The clock for the next question starts now; `shown` may move it later by
  // at most REVEAL_MS, once, to cover the client's answer-reveal pause.
  if (!finished) {
    record.shownAt = now;
    record.revealUntil = now + REVEAL_MS;
  }
  await saveRecord(date, profileId, record);

  const base = { index, correct, correctAnswer: q.answer, explanation: q.explanation ?? null };
  if (finished) return { ...base, done: true, result: await result(date, profileId, record) };
  return {
    ...base,
    done: false,
    next: { index: index + 1, question: publicQuestion(questionsFor(date)[index + 1]) },
  };
}

/**
 * Mark the moment the next question actually appeared. The client shows the
 * correct answer for a beat before moving on; this keeps that pause off the
 * player's clock.
 */
async function shown(profileId, index, now = Date.now()) {
  const date = dateFor(now);
  const record = await getRecord(date, profileId);
  if (!record || index !== record.answers.length || summarize(record).finished) return;
  if (!record.revealUntil) return; // already marked: calling again must not reset the clock
  record.shownAt = Math.min(now, record.revealUntil);
  record.revealUntil = null;
  await saveRecord(date, profileId, record);
}

module.exports = {
  DAILY_EPOCH,
  QUESTION_COUNT,
  QUESTION_SECONDS,
  dateFor,
  dayNumber,
  nextResetAt,
  isValidDate,
  questionsFor,
  publicQuestion,
  leaderboard,
  status,
  start,
  answer,
  shown,
};
