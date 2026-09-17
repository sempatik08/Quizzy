'use strict';

/**
 * Gameplay analytics (PBI 16).
 *
 * WHAT IT IS FOR
 * Two concrete jobs, both about content quality rather than growth metrics:
 * finding questions that are broken or miskeyed (a question almost nobody gets
 * right usually has a wrong answer key, not a hard subject), and replacing
 * PBI 7's provisional difficulty labels with observed pass rates.
 *
 * NO PERSONAL DATA — THIS IS A HARD RULE, NOT A PREFERENCE
 * Nothing here records who did anything. No player id, no profile id, no name,
 * no socket id, no room code, no IP, no timestamps fine-grained enough to
 * correlate. Only aggregate counters keyed by question id, category and game
 * mode. There is no way to reconstruct an individual's activity from this data
 * because the individual is never written down, and the test asserts that.
 *
 * WHY COUNTERS AND NOT AN EVENT LOG
 * An event log would be both a privacy liability (a stream of timestamped rows
 * is re-identifiable even without names) and unbounded in size. Counters answer
 * every question the PBI actually asks and cannot grow past one row per
 * question in the bank.
 *
 * WHY BUFFERED
 * Answers arrive in bursts and the numbers are aggregate, so a lost buffer costs
 * a few counts and nothing else. Accumulating in memory and merging into the
 * store on a timer turns one write per answer into one write per flush. The
 * merge is read-modify-write so a restart, or a second instance, adds to the
 * stored totals rather than overwriting them.
 */

const store = require('./store');

const KEY_CATEGORIES = 'quizzy:analytics:categories';
const KEY_MATCHES = 'quizzy:analytics:matches';
const KEY_QUESTIONS = 'quizzy:analytics:questions';

/** How often the in-memory buffer is merged into the store. */
const FLUSH_INTERVAL_MS = 30_000;

/**
 * A question needs at least this many attempts before its pass rate is worth
 * acting on. Below it, one unlucky team looks identical to a broken question.
 */
const MIN_ATTEMPTS_FOR_SIGNAL = 12;

/** Pass rate under this, with enough attempts, is a likely miskeyed question. */
const SUSPECT_PASS_RATE = 0.12;

// ---------------------------------------------------------------------------
// In-memory buffer
// ---------------------------------------------------------------------------

function emptyBuffer() {
  return {
    /** category -> { picks, served } */
    categories: {},
    /** questionId -> { served, correct, wrong, timeout, stolen, stealWon } */
    questions: {},
    matches: {
      count: 0,
      totalDurationMs: 0,
      totalQuestions: 0,
      /** mode -> { count, totalDurationMs, totalQuestions } */
      byMode: {},
    },
  };
}

let buffer = emptyBuffer();
let flushHandle = null;
let dirty = false;

function bumpCategory(category, field) {
  if (!category) return;
  const row = buffer.categories[category] ?? { picks: 0, served: 0 };
  row[field] += 1;
  buffer.categories[category] = row;
  dirty = true;
}

function bumpQuestion(questionId, field) {
  if (!questionId) return;
  const row = buffer.questions[questionId]
    ?? { served: 0, correct: 0, wrong: 0, timeout: 0, stolen: 0, stealWon: 0 };
  row[field] += 1;
  buffer.questions[questionId] = row;
  dirty = true;
}

// ---------------------------------------------------------------------------
// Recorders — called from the game loop, must never throw or block
// ---------------------------------------------------------------------------

/** A captain chose a category. Answers "which categories do people want". */
function recordCategoryPick(category) {
  bumpCategory(category, 'picks');
}

/**
 * A question was put on the table. Category is taken separately so a category's
 * served count does not have to be derived by joining every question.
 */
function recordQuestionServed(questionId, category) {
  bumpQuestion(questionId, 'served');
  bumpCategory(category, 'served');
}

/**
 * How a question was resolved.
 * @param {string} questionId
 * @param {{ isCorrect: boolean, isSteal: boolean, answered: boolean }} outcome
 */
function recordAnswer(questionId, outcome) {
  if (!questionId) return;
  if (outcome.isSteal) {
    bumpQuestion(questionId, 'stolen');
    if (outcome.isCorrect) bumpQuestion(questionId, 'stealWon');
    return;
  }
  if (!outcome.answered) {
    // Nobody voted. Not a wrong answer — counting it as one would make every
    // abandoned room look like a broken question.
    bumpQuestion(questionId, 'timeout');
    return;
  }
  bumpQuestion(questionId, outcome.isCorrect ? 'correct' : 'wrong');
}

/**
 * A match finished. Only aggregate shape is kept — duration, question count and
 * mode. Deliberately not the room code, the players, or the winner.
 * @param {object} room
 */
function recordMatchEnd(room) {
  if (!room) return;
  const mode = room.mode ?? 'classic';
  const duration = room.createdAt ? Math.max(0, Date.now() - room.createdAt) : 0;
  const questions = (room.usedQuestionIds ?? []).length;

  buffer.matches.count += 1;
  buffer.matches.totalDurationMs += duration;
  buffer.matches.totalQuestions += questions;

  const row = buffer.matches.byMode[mode]
    ?? { count: 0, totalDurationMs: 0, totalQuestions: 0 };
  row.count += 1;
  row.totalDurationMs += duration;
  row.totalQuestions += questions;
  buffer.matches.byMode[mode] = row;

  dirty = true;
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

function mergeCounters(stored, incoming) {
  const out = { ...(stored ?? {}) };
  for (const [key, row] of Object.entries(incoming)) {
    const base = out[key] ?? {};
    const merged = { ...base };
    for (const [field, value] of Object.entries(row)) {
      merged[field] = (base[field] ?? 0) + value;
    }
    out[key] = merged;
  }
  return out;
}

/** Merge the buffer into the store and clear it. Safe to call when idle. */
async function flushAnalytics() {
  if (!dirty) return { flushed: false };

  const pending = buffer;
  // Swap first: anything recorded during the awaits below lands in the new
  // buffer rather than being dropped when this one is cleared.
  buffer = emptyBuffer();
  dirty = false;

  try {
    const [storedCats, storedQs, storedMatches] = await Promise.all([
      store.getJSON(KEY_CATEGORIES),
      store.getJSON(KEY_QUESTIONS),
      store.getJSON(KEY_MATCHES),
    ]);

    await store.setJSON(KEY_CATEGORIES, mergeCounters(storedCats, pending.categories));
    await store.setJSON(KEY_QUESTIONS, mergeCounters(storedQs, pending.questions));

    const baseMatches = storedMatches ?? {
      count: 0, totalDurationMs: 0, totalQuestions: 0, byMode: {},
    };
    await store.setJSON(KEY_MATCHES, {
      count: baseMatches.count + pending.matches.count,
      totalDurationMs: baseMatches.totalDurationMs + pending.matches.totalDurationMs,
      totalQuestions: baseMatches.totalQuestions + pending.matches.totalQuestions,
      byMode: mergeCounters(baseMatches.byMode, pending.matches.byMode),
    });

    return { flushed: true };
  } catch (err) {
    console.warn(`[Analytics] flush failed: ${err.message}`);
    return { flushed: false, error: err.message };
  }
}

function startAnalyticsFlusher() {
  if (flushHandle) return;
  flushHandle = setInterval(() => {
    flushAnalytics().catch(() => {});
  }, FLUSH_INTERVAL_MS);
  // Analytics must not be the reason a process refuses to exit.
  if (typeof flushHandle.unref === 'function') flushHandle.unref();
}

function stopAnalyticsFlusher() {
  if (flushHandle) {
    clearInterval(flushHandle);
    flushHandle = null;
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/**
 * Turn the raw counters into the two answers the PBI wants.
 *
 * `suspectQuestions` is the cull list: enough attempts to be meaningful, and a
 * pass rate low enough that a wrong answer key is the likelier explanation than
 * a hard subject.
 *
 * `difficultySuggestions` compares each question's observed pass rate against
 * the label PBI 7's heuristic gave it, and names the ones that disagree. Those
 * labels were always provisional; this is the data meant to fix them.
 *
 * @param {Record<string, object>} [bank] category -> questions, for cross-referencing labels
 */
async function buildReport(bank) {
  await flushAnalytics();

  const [categories, questions, matches] = await Promise.all([
    store.getJSON(KEY_CATEGORIES),
    store.getJSON(KEY_QUESTIONS),
    store.getJSON(KEY_MATCHES),
  ]);

  const cats = categories ?? {};
  const qs = questions ?? {};
  const m = matches ?? { count: 0, totalDurationMs: 0, totalQuestions: 0, byMode: {} };

  // Which categories people actually choose.
  const categoryRanking = Object.entries(cats)
    .map(([key, row]) => ({
      category: key,
      picks: row.picks ?? 0,
      served: row.served ?? 0,
    }))
    .sort((a, b) => b.picks - a.picks || b.served - a.served);

  // Per-question pass rate. `attempts` counts only rounds where a team actually
  // committed to an answer: a timeout says nothing about the question.
  const questionStats = Object.entries(qs).map(([id, row]) => {
    const correct = row.correct ?? 0;
    const wrong = row.wrong ?? 0;
    const attempts = correct + wrong;
    return {
      id,
      served: row.served ?? 0,
      correct,
      wrong,
      timeout: row.timeout ?? 0,
      stolen: row.stolen ?? 0,
      stealWon: row.stealWon ?? 0,
      attempts,
      passRate: attempts > 0 ? correct / attempts : null,
    };
  });

  const withSignal = questionStats.filter((q) => q.attempts >= MIN_ATTEMPTS_FOR_SIGNAL);

  const suspectQuestions = withSignal
    .filter((q) => q.passRate !== null && q.passRate < SUSPECT_PASS_RATE)
    .sort((a, b) => a.passRate - b.passRate);

  // Observed difficulty from the pass rate, compared with the stored label.
  const labelFor = buildLabelIndex(bank);
  const difficultySuggestions = withSignal
    .map((q) => {
      const observed = observedDifficulty(q.passRate);
      const current = labelFor.get(q.id);
      if (current === undefined || observed === current) return null;
      return {
        id: q.id,
        category: labelFor.get(`${q.id}:category`),
        current,
        suggested: observed,
        passRate: Number(q.passRate.toFixed(3)),
        attempts: q.attempts,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.attempts - a.attempts);

  return {
    categories: categoryRanking,
    matches: {
      count: m.count,
      avgDurationMs: m.count ? Math.round(m.totalDurationMs / m.count) : 0,
      avgQuestions: m.count ? Number((m.totalQuestions / m.count).toFixed(1)) : 0,
      byMode: Object.entries(m.byMode ?? {}).map(([mode, row]) => ({
        mode,
        count: row.count ?? 0,
        avgDurationMs: row.count ? Math.round(row.totalDurationMs / row.count) : 0,
        avgQuestions: row.count ? Number((row.totalQuestions / row.count).toFixed(1)) : 0,
      })).sort((a, b) => b.count - a.count),
    },
    questions: {
      tracked: questionStats.length,
      withSignal: withSignal.length,
      minAttemptsForSignal: MIN_ATTEMPTS_FOR_SIGNAL,
    },
    suspectQuestions,
    difficultySuggestions,
  };
}

/** Thresholds mirror the 1/2/3 buckets: easy passes often, hard rarely. */
function observedDifficulty(passRate) {
  if (passRate >= 0.75) return 1;
  if (passRate >= 0.45) return 2;
  return 3;
}

function buildLabelIndex(bank) {
  const index = new Map();
  if (!bank) return index;
  for (const [category, pool] of Object.entries(bank)) {
    for (const q of pool) {
      index.set(q.id, [1, 2, 3].includes(q.difficulty) ? q.difficulty : 2);
      index.set(`${q.id}:category`, category);
    }
  }
  return index;
}

/** Test/maintenance helper: forget everything buffered and stored. */
async function resetAnalytics() {
  buffer = emptyBuffer();
  dirty = false;
  await store.setJSON(KEY_CATEGORIES, {});
  await store.setJSON(KEY_QUESTIONS, {});
  await store.setJSON(KEY_MATCHES, {
    count: 0, totalDurationMs: 0, totalQuestions: 0, byMode: {},
  });
}

module.exports = {
  KEY_CATEGORIES,
  KEY_MATCHES,
  KEY_QUESTIONS,
  FLUSH_INTERVAL_MS,
  MIN_ATTEMPTS_FOR_SIGNAL,
  SUSPECT_PASS_RATE,
  recordCategoryPick,
  recordQuestionServed,
  recordAnswer,
  recordMatchEnd,
  flushAnalytics,
  startAnalyticsFlusher,
  stopAnalyticsFlusher,
  buildReport,
  observedDifficulty,
  resetAnalytics,
};
