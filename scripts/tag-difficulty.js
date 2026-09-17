'use strict';

/**
 * Writes a provisional `difficulty: 1 | 2 | 3` onto every question (PBI 7).
 *
 *   node scripts/tag-difficulty.js            # apply
 *   node scripts/tag-difficulty.js --dry-run  # report the split only
 *
 * WHY A SCRIPT AND NOT HAND-TAGGING
 * There are 2400 questions. Hand-rating them is the right long-term answer and
 * PBI 16 exists partly to drive it with real answer data, but the difficulty
 * *mechanism* should not wait for that. So this produces a defensible starting
 * point and writes it into the question files, where a human can correct any
 * single entry by editing one line. Re-running preserves nothing — it recomputes
 * from the text — so once entries are hand-corrected this script should be run
 * with care, or not at all.
 *
 * WHAT IT ACTUALLY MEASURES
 * Not difficulty. It measures *specificity*: how much precise recall a question
 * demands. Dates, long qualified phrasings and numeric option sets need exact
 * knowledge; short questions with short answers are usually canonical facts.
 * That correlates with difficulty well enough to shape a curve, and the naming
 * here says so rather than pretending otherwise.
 *
 * WHY RANKING WITHIN A CATEGORY, NOT ABSOLUTE THRESHOLDS
 * Absolute cutoffs on the same signals gave philosophy 0 easy / 173 hard and
 * general 135 easy / 12 hard, because philosophy questions are simply longer and
 * carry philosophers' dates. That is a measurement of prose style, not of
 * difficulty, and it would leave the early game unable to find an easy
 * philosophy question at all. Ranking inside each category and splitting by
 * quantile guarantees every category has a full spread, which is what the
 * selection curve needs.
 */

const fs = require('fs');
const path = require('path');
const { QUESTIONS } = require('../server/questions');

const DRY_RUN = process.argv.includes('--dry-run');

/** Share of each category that becomes easy / medium / hard. */
const SPLIT = { easy: 0.30, medium: 0.45 }; // the remaining 0.25 is hard

const YEAR = /\b(1[0-9]{3}|20[0-9]{2})\b/;
const MOSTLY_NUMBER = /^[^0-9]{0,3}[\d.,]{2,}[^0-9]{0,12}$/;

/**
 * Higher = demands more precise recall.
 * The weights are judgement, not fitted to anything; they only have to order
 * questions sensibly within one category.
 */
function specificityScore(q) {
  const text = String(q.text ?? '');
  const options = Object.values(q.options ?? {}).map(String);
  const answer = String(q.options?.[q.answer] ?? '');

  let score = 0;

  // A year in the question means the answer hinges on a date.
  if (YEAR.test(text)) score += 30;

  // Numeric option sets ("1921 / 1923 / 1925 / 1927") leave nothing to reason from.
  const numericOptions = options.filter((o) => MOSTLY_NUMBER.test(o)).length;
  score += numericOptions * 7;

  // Long, qualified phrasing narrows to one specific fact.
  score += Math.min(40, text.length / 3);

  // A long answer is usually a full title or a precise phrase.
  score += Math.min(15, answer.length / 3);

  // "Which of the following"-style framings tend to be the more obscure ones.
  if (/\bwhich of the\b/i.test(text)) score += 6;

  // Superlatives are usually canonical and widely known: largest, first, capital.
  if (/\b(capital|largest|smallest|first|highest|longest)\b/i.test(text)) score -= 12;

  return score;
}

const report = [];
let changedFiles = 0;

for (const [category, pool] of Object.entries(QUESTIONS)) {
  const ranked = pool
    .map((q) => ({ id: q.id, score: specificityScore(q) }))
    // Ties broken by id so the output is stable across runs.
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));

  const easyCut = Math.round(ranked.length * SPLIT.easy);
  const mediumCut = Math.round(ranked.length * (SPLIT.easy + SPLIT.medium));

  /** @type {Map<string, 1|2|3>} */
  const assignment = new Map();
  ranked.forEach((entry, i) => {
    assignment.set(entry.id, i < easyCut ? 1 : i < mediumCut ? 2 : 3);
  });

  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const d of assignment.values()) counts[d]++;
  report.push({ category, total: pool.length, ...counts });

  if (DRY_RUN) continue;

  const file = path.join(__dirname, '..', 'server', 'questions', `${category}.js`);
  let src = fs.readFileSync(file, 'utf8');
  let touched = 0;

  for (const [id, difficulty] of assignment) {
    // Anchor on the id line and insert (or replace) difficulty right after the
    // answer line of that same object, so nothing depends on key ordering
    // elsewhere in the file.
    const block = new RegExp(
      `(id: '${id}',[\\s\\S]*?\\n(\\s*)answer: '[A-E]',)(\\n\\s*difficulty: [123],)?`,
    );
    const match = src.match(block);
    if (!match) {
      console.warn(`  ! could not locate ${category}/${id}`);
      continue;
    }
    src = src.replace(block, `$1\n${match[2]}difficulty: ${difficulty},`);
    touched++;
  }

  fs.writeFileSync(file, src, 'utf8');
  changedFiles++;
  console.log(`  ${category}: tagged ${touched}/${pool.length}`);
}

console.log(`\n${'='.repeat(58)}`);
console.log('  DIFFICULTY SPLIT' + (DRY_RUN ? ' (dry run)' : ''));
console.log('='.repeat(58));
let t = { 1: 0, 2: 0, 3: 0, total: 0 };
for (const row of report) {
  console.log(
    `  ${row.category.padEnd(12)} easy=${String(row[1]).padStart(3)}` +
      ` med=${String(row[2]).padStart(3)} hard=${String(row[3]).padStart(3)}`,
  );
  t[1] += row[1]; t[2] += row[2]; t[3] += row[3]; t.total += row.total;
}
console.log('-'.repeat(58));
console.log(
  `  ${'TOTAL'.padEnd(12)} easy=${String(t[1]).padStart(3)}` +
    ` med=${String(t[2]).padStart(3)} hard=${String(t[3]).padStart(3)}  (n=${t.total})`,
);
if (!DRY_RUN) console.log(`\n  ${changedFiles} files rewritten.`);
