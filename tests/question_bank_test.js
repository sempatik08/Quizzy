'use strict';

/**
 * Question bank integrity test (PBI 4).
 *
 *   node tests/question_bank_test.js
 *
 * Pure — needs no running server. Guards the things that silently break a match
 * rather than throwing: a duplicate ID makes `usedQuestionIds` skip a question,
 * a bad `answer` makes a question unanswerable, a missing Turkish translation
 * shows English text to a Turkish player, and a category present in the bank but
 * absent from the allow-list is offered by the UI and rejected by the server.
 */

const { QUESTIONS, CATEGORY_KEYS } = require('../server/questions');
const { createReporter } = require('./helpers');
const publishedCounts = require('../src/data/question-counts.json');

const EXPECTED_PER_CATEGORY = 300;
const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E'];

const r = createReporter('QUESTION BANK INTEGRITY — PBI 4');
r.banner();

// ---------------------------------------------------------------------------
// 1. Category coverage
// ---------------------------------------------------------------------------
r.section('1. Categories');

const EXPECTED_CATEGORIES = [
  'general', 'cinema', 'sports', 'history', 'music', 'anime',
  'technology', 'literature', 'math', 'geography', 'philosophy', 'games',
];

const bankKeys = Object.keys(QUESTIONS);
const missing = EXPECTED_CATEGORIES.filter((k) => !bankKeys.includes(k));
r.check('All 12 PBI 4 categories exist in the bank', missing.length === 0, `missing: ${missing}`);

r.check(
  'CATEGORY_KEYS is derived from the bank (no second hand-written list)',
  CATEGORY_KEYS.length === bankKeys.length && CATEGORY_KEYS.every((k) => bankKeys.includes(k)),
  `CATEGORY_KEYS=${CATEGORY_KEYS.length} bank=${bankKeys.length}`,
);

// The bug this test was written for: philosophy shipped in the bank and in the
// UI picker but was absent from gameLogic's own copy of the allow-list.
r.check('philosophy is selectable', CATEGORY_KEYS.includes('philosophy'));

for (const key of EXPECTED_CATEGORIES) {
  const pool = QUESTIONS[key] || [];
  r.check(
    `${key} holds ${EXPECTED_PER_CATEGORY} questions`,
    pool.length === EXPECTED_PER_CATEGORY,
    `got ${pool.length}`,
  );
}

const total = Object.values(QUESTIONS).reduce((n, pool) => n + pool.length, 0);
r.check(
  `Bank total is ${EXPECTED_CATEGORIES.length * EXPECTED_PER_CATEGORY}`,
  total === EXPECTED_CATEGORIES.length * EXPECTED_PER_CATEGORY,
  `got ${total}`,
);

// ---------------------------------------------------------------------------
// 1b. The counts the UI advertises
// ---------------------------------------------------------------------------
r.section('1b. Published counts');

// The footer used to hardcode these and rotted badly — it still advertised
// "482+ soru", listed seven categories as "coming soon" with 5 questions each,
// and omitted philosophy, while the bank held 2400 across 12 finished
// categories. The generated file is now the single source, and this pins it so
// it fails loudly instead of quietly lying to visitors.
// Regenerate with: node scripts/sync-question-counts.js
r.check('Published total matches the bank', publishedCounts.total === total,
  `published ${publishedCounts.total} vs bank ${total}`);
r.check('Published category count matches the bank',
  publishedCounts.categoryCount === bankKeys.length,
  `published ${publishedCounts.categoryCount} vs bank ${bankKeys.length}`);

const countMismatches = [];
for (const key of bankKeys) {
  const published = publishedCounts.categories[key];
  if (published !== QUESTIONS[key].length) {
    countMismatches.push(`${key}: published ${published} vs bank ${QUESTIONS[key].length}`);
  }
}
for (const key of Object.keys(publishedCounts.categories)) {
  if (!bankKeys.includes(key)) countMismatches.push(`${key}: published but not in the bank`);
}
r.check('Every published per-category count matches the bank',
  countMismatches.length === 0,
  `\n      ${countMismatches.join('\n      ')}`);

// ---------------------------------------------------------------------------
// 2. Uniqueness — globally, not just per category
// ---------------------------------------------------------------------------
r.section('2. Uniqueness');

const idSeen = new Map();       // id → "category"
const textSeen = new Map();     // normalised text → "category/id"
const dupIds = [];
const dupTexts = [];

const normalise = (s) =>
  String(s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,'"’]/g, '').trim();

for (const [category, pool] of Object.entries(QUESTIONS)) {
  for (const q of pool) {
    if (idSeen.has(q.id)) dupIds.push(`${q.id} (${idSeen.get(q.id)} + ${category})`);
    else idSeen.set(q.id, category);

    const key = normalise(q.text);
    if (key && textSeen.has(key)) dupTexts.push(`"${q.text}" (${textSeen.get(key)} + ${category}/${q.id})`);
    else if (key) textSeen.set(key, `${category}/${q.id}`);
  }
}

r.check('No duplicate question IDs across the whole bank', dupIds.length === 0,
  `\n      ${dupIds.slice(0, 10).join('\n      ')}`);
r.check('No duplicate question text across the whole bank', dupTexts.length === 0,
  `\n      ${dupTexts.slice(0, 10).join('\n      ')}`);

// ---------------------------------------------------------------------------
// 2b. Near-duplicates — questions that differ only in wording
// ---------------------------------------------------------------------------
r.section('2b. Near-duplicates');

// Exact-text matching is not enough. A real match served
//   "What is the default currency of Japan?"
//   "What is the currency of Japan?"
// back to back: different ids, one word apart, identical answer. To a player
// that is the same question twice, and it is what this catches.
//
// The rule: two questions with the SAME ANSWER whose remaining words overlap by
// half or more. Grouping by answer first keeps this from being O(n^2) over 2400
// questions, and it is also what makes the signal meaningful — two questions can
// share wording and be entirely different if the answers differ.
const NEAR_DUP_THRESHOLD = 0.5;
const STOPWORDS = new Set(
  ('the a an of in on to is are was were which what who whom whose how many much '
    + 'and or for by at from with that this it its as').split(' '),
);

const contentWords = (text) => new Set(
  (String(text ?? '').toLowerCase().match(/[a-zçğıöşü0-9]+/g) ?? [])
    .filter((w) => !STOPWORDS.has(w) && w.length > 2),
);

const byAnswer = new Map();
for (const [category, pool] of Object.entries(QUESTIONS)) {
  for (const q of pool) {
    const key = String(q.options?.[q.answer] ?? '').trim().toLowerCase();
    if (!key) continue;
    if (!byAnswer.has(key)) byAnswer.set(key, []);
    byAnswer.get(key).push({ category, id: q.id, text: q.text, words: contentWords(q.text) });
  }
}

const nearDupes = [];
for (const group of byAnswer.values()) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];
      const shared = [...a.words].filter((w) => b.words.has(w)).length;
      const union = new Set([...a.words, ...b.words]).size;
      const overlap = union ? shared / union : 0;
      if (overlap >= NEAR_DUP_THRESHOLD) {
        nearDupes.push(
          `${overlap.toFixed(2)} ${a.category}/${a.id} <-> ${b.category}/${b.id}`
          + `\n          "${a.text}"\n          "${b.text}"`,
        );
      }
    }
  }
}

const sameCategoryDupes = nearDupes.filter((line) => {
  const m = line.match(/ (\w+)\/\S+ <-> (\w+)\//);
  return m && m[1] === m[2];
});

// Same-category pairs are the urgent ones: a room plays one category at a time,
// so those two can genuinely land back to back.
r.check('No near-duplicate questions within a category', sameCategoryDupes.length === 0,
  `\n      ${sameCategoryDupes.slice(0, 8).join('\n      ')}`);
// Cross-category still matters, because category rotation puts several
// categories in one match.
r.check('No near-duplicate questions across categories', nearDupes.length === 0,
  `\n      ${nearDupes.slice(0, 8).join('\n      ')}`);

// ---------------------------------------------------------------------------
// 3. Per-question shape
// ---------------------------------------------------------------------------
r.section('3. Question shape');

const badOptions = [];
const badAnswers = [];
const badText = [];
const dupOptionValues = [];

for (const [category, pool] of Object.entries(QUESTIONS)) {
  for (const q of pool) {
    const ref = `${category}/${q.id}`;

    if (typeof q.text !== 'string' || q.text.trim().length < 5) badText.push(ref);

    const opts = q.options || {};
    const present = OPTION_KEYS.filter(
      (k) => typeof opts[k] === 'string' && opts[k].trim().length > 0,
    );
    if (present.length !== OPTION_KEYS.length) {
      badOptions.push(`${ref} (has ${present.join('')})`);
    }

    if (!OPTION_KEYS.includes(q.answer) || typeof opts[q.answer] !== 'string') {
      badAnswers.push(`${ref} (answer=${q.answer})`);
    }

    // Two identical options make the "correct" one ambiguous.
    const values = OPTION_KEYS.map((k) => normalise(opts[k])).filter(Boolean);
    if (new Set(values).size !== values.length) dupOptionValues.push(ref);
  }
}

r.check('Every question has non-trivial text', badText.length === 0,
  `\n      ${badText.slice(0, 10).join('\n      ')}`);
r.check('Every question has all 5 options A–E', badOptions.length === 0,
  `\n      ${badOptions.slice(0, 10).join('\n      ')}`);
r.check('Every answer points at an existing option', badAnswers.length === 0,
  `\n      ${badAnswers.slice(0, 10).join('\n      ')}`);
r.check('No question has two identical options', dupOptionValues.length === 0,
  `\n      ${dupOptionValues.slice(0, 10).join('\n      ')}`);

// ---------------------------------------------------------------------------
// 4. Turkish translation completeness
// ---------------------------------------------------------------------------
r.section('4. Turkish translations');

const missingTextTr = [];
const missingOptionsTr = [];

for (const [category, pool] of Object.entries(QUESTIONS)) {
  for (const q of pool) {
    const ref = `${category}/${q.id}`;
    if (typeof q.text_tr !== 'string' || q.text_tr.trim().length === 0) missingTextTr.push(ref);

    const tr = q.options_tr || {};
    const present = OPTION_KEYS.filter(
      (k) => typeof tr[k] === 'string' && tr[k].trim().length > 0,
    );
    if (present.length !== OPTION_KEYS.length) missingOptionsTr.push(ref);
  }
}

r.check(`Every question has text_tr (${missingTextTr.length} missing)`, missingTextTr.length === 0,
  `\n      ${missingTextTr.slice(0, 10).join('\n      ')}`);
r.check(`Every question has all 5 options_tr (${missingOptionsTr.length} missing)`,
  missingOptionsTr.length === 0,
  `\n      ${missingOptionsTr.slice(0, 10).join('\n      ')}`);

process.exit(r.finish());
