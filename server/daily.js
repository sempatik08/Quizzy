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
 * Picked from the bank with a PRNG seeded by the date: one question from each of
 * 10 different categories, ordered easy → hard. The pick depends on the bank's
 * size, so a deploy that adds questions mid-day would pick a different set for
 * the same date — and score half-played runs against questions their players
 * never saw. So the first use of a day pins its ids in the store and every later
 * use (any instance, any deploy) reads them back; only ids that vanished from
 * the bank cause a fresh pick.
 *
 * TRUST
 * The server runs the quiz, not the client. Questions go out one at a time
 * without the answer, the server stamps when each one was shown and judges the
 * answer when it arrives, so neither correctness nor speed is client-reported.
 * Progress is stored after every answer and a profile can only play a day once:
 * reloading resumes at the same question rather than starting over. Profiles
 * themselves are client-made UUIDs (see stats.js), so the daily board is a fun
 * record, not a ranked ladder — same caveat as the main leaderboard.
 *
 * ONE STEP AT A TIME
 * start/answer/shown read a profile's record, change it and write it back.
 * Two of those for the same profile and day (a double tap, two tabs) must not
 * interleave: on Redis each read is a fresh copy, so two answers to the same
 * index would both pass the order check and both be saved. They queue on a
 * per profile+day promise chain (withLock) instead. The chain is per process —
 * enough while one socket server runs the game.
 */

const store = require('./store');

const {
  DAILY_EPOCH, QUESTION_COUNT, QUESTION_SECONDS, GRACE_MS, REVEAL_MS,
  dateFor, dayNumber, nextResetAt, isValidDate, questionsFor, questionsFromIds, publicQuestion,
} = require('./dailyQuestions');

const BOARD_LIMIT = 20;

const RESULT_KEY = (date, profileId) => `quizzy:daily:${date}:${profileId}`;
const PLAYERS_KEY = (date) => `quizzy:daily:${date}:players`;
const QUESTIONS_KEY = (date) => `quizzy:daily:${date}:questions`;

// --- The day's questions, pinned --------------------------------------------

const pinned = new Map(); // date → question objects, once read from / written to the store

/**
 * The day's 10 questions as first picked: from the store when already pinned
 * (and every id is still in the bank), otherwise picked now and pinned.
 */
async function dayQuestions(date) {
  if (pinned.has(date)) return pinned.get(date);
  let qs = questionsFromIds(await store.getJSON(QUESTIONS_KEY(date)));
  if (!qs) {
    qs = questionsFor(date);
    await store.setJSON(QUESTIONS_KEY(date), qs.map((q) => q.id));
  }
  if (pinned.size > 7) pinned.delete(pinned.keys().next().value);
  pinned.set(date, qs);
  return qs;
}

// --- One step at a time per profile and day ----------------------------------

const locks = new Map(); // `${date}:${profileId}` → tail of that profile's queue

function withLock(key, fn) {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const settled = run.catch(() => {});
  locks.set(key, settled);
  settled.then(() => {
    if (locks.get(key) === settled) locks.delete(key);
  });
  return run;
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
async function review(date, record) {
  const qs = await dayQuestions(date);
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
  return withLock(`${date}:${profileId}`, () => startLocked(date, profileId, name, avatar, now));
}

async function startLocked(date, profileId, name, avatar, now) {
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
  const qs = await dayQuestions(date);
  return { done: false, ...meta(date, now), index, question: publicQuestion(qs[index]) };
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
    review: await review(date, record),
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
  return withLock(`${date}:${profileId}`, () => answerLocked(date, profileId, index, choice, now));
}

async function answerLocked(date, profileId, index, choice, now) {
  const record = await getRecord(date, profileId);
  if (record && summarize(record).finished) return { error: 'Already finished today.' };
  if (!record || record.shownAt == null) return { error: 'Start the daily quiz first.' };
  if (index !== record.answers.length) return { error: 'Out of order.' };

  const qs = await dayQuestions(date);
  const q = qs[index];
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
    next: { index: index + 1, question: publicQuestion(qs[index + 1]) },
  };
}

/**
 * Mark the moment the next question actually appeared. The client shows the
 * correct answer for a beat before moving on; this keeps that pause off the
 * player's clock.
 */
async function shown(profileId, index, now = Date.now()) {
  const date = dateFor(now);
  return withLock(`${date}:${profileId}`, async () => {
    const record = await getRecord(date, profileId);
    if (!record || index !== record.answers.length || summarize(record).finished) return;
    if (!record.revealUntil) return; // already marked: calling again must not reset the clock
    record.shownAt = Math.min(now, record.revealUntil);
    record.revealUntil = null;
    await saveRecord(date, profileId, record);
  });
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
  dayQuestions,
  publicQuestion,
  leaderboard,
  status,
  start,
  answer,
  shown,
};
