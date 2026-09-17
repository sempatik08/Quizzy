'use strict';

/**
 * Prints the gameplay analytics report (PBI 16).
 *
 *   QUIZZY_STORE_FILE=./.data/rooms.json node scripts/analytics-report.js
 *   REDIS_URL=redis://... node scripts/analytics-report.js
 *   ... node scripts/analytics-report.js --json
 *
 * Reads the store directly rather than going through the running server, so it
 * works against a production Redis from a laptop without exposing an endpoint.
 * The server's own /analytics route exists for when that is more convenient; it
 * needs ANALYTICS_TOKEN.
 *
 * The two sections that earn their keep:
 *
 *   SUSPECT QUESTIONS   — enough attempts to mean something, and a pass rate low
 *                         enough that a wrong answer key is likelier than a hard
 *                         subject. This is the cull-and-check list.
 *   DIFFICULTY DRIFT    — where the observed pass rate disagrees with the label
 *                         PBI 7's heuristic assigned. Those labels were always
 *                         provisional; this is the data meant to replace them.
 */

const store = require('../server/store');
const analytics = require('../server/analytics');
const { QUESTIONS } = require('../server/questions');

const AS_JSON = process.argv.includes('--json');

/** Finds a question's text so the report is readable without grepping. */
function questionText(id) {
  for (const pool of Object.values(QUESTIONS)) {
    const q = pool.find((entry) => entry.id === id);
    if (q) return q.text;
  }
  return '(not in the current bank)';
}

function fmtDuration(ms) {
  if (!ms) return '—';
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

async function main() {
  const { backend } = await store.initStore();
  if (backend === 'memory') {
    console.error(
      'Store is in-memory, so there is nothing to read.\n' +
      'Set QUIZZY_STORE_FILE or REDIS_URL to the store the server writes to.',
    );
    process.exit(1);
  }

  const report = await analytics.buildReport(QUESTIONS);

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
    await store.closeStore();
    return;
  }

  const line = (ch = '=') => console.log(ch.repeat(66));

  line();
  console.log(`  QUIZZY ANALYTICS  (store: ${backend})`);
  line();

  console.log('\nMATCHES');
  if (report.matches.count === 0) {
    console.log('  No finished matches recorded yet.');
  } else {
    console.log(`  Finished matches : ${report.matches.count}`);
    console.log(`  Average duration : ${fmtDuration(report.matches.avgDurationMs)}`);
    console.log(`  Average questions: ${report.matches.avgQuestions}`);
    for (const m of report.matches.byMode) {
      console.log(
        `    ${m.mode.padEnd(9)} ${String(m.count).padStart(4)} matches` +
        `  avg ${fmtDuration(m.avgDurationMs).padStart(8)}  ${m.avgQuestions} questions`,
      );
    }
  }

  console.log('\nCATEGORY POPULARITY  (picks / questions served)');
  if (report.categories.length === 0) {
    console.log('  Nothing recorded yet.');
  } else {
    for (const c of report.categories) {
      console.log(
        `  ${c.category.padEnd(12)} ${String(c.picks).padStart(5)} picks` +
        `  ${String(c.served).padStart(6)} served`,
      );
    }
  }

  console.log(
    `\nQUESTION COVERAGE` +
    `\n  Tracked questions        : ${report.questions.tracked}` +
    `\n  With enough attempts     : ${report.questions.withSignal}` +
    ` (>= ${report.questions.minAttemptsForSignal} attempts)`,
  );

  console.log('\nSUSPECT QUESTIONS  (likely a wrong answer key, not a hard subject)');
  if (report.suspectQuestions.length === 0) {
    console.log('  None — either no question is failing that badly, or not enough data yet.');
  } else {
    for (const q of report.suspectQuestions) {
      console.log(
        `  ${q.id.padEnd(14)} ${(q.passRate * 100).toFixed(0).padStart(3)}% pass` +
        `  (${q.correct}/${q.attempts})`,
      );
      console.log(`    ${questionText(q.id).slice(0, 88)}`);
    }
  }

  console.log('\nDIFFICULTY DRIFT  (observed pass rate vs the PBI 7 label)');
  if (report.difficultySuggestions.length === 0) {
    console.log('  No disagreements with enough data behind them.');
  } else {
    const names = { 1: 'easy', 2: 'medium', 3: 'hard' };
    for (const d of report.difficultySuggestions.slice(0, 40)) {
      console.log(
        `  ${d.id.padEnd(14)} ${String(d.category ?? '?').padEnd(11)}` +
        ` ${names[d.current].padEnd(6)} -> ${names[d.suggested].padEnd(6)}` +
        ` ${(d.passRate * 100).toFixed(0).padStart(3)}% pass over ${d.attempts} attempts`,
      );
    }
    if (report.difficultySuggestions.length > 40) {
      console.log(`  ... and ${report.difficultySuggestions.length - 40} more (use --json)`);
    }
  }

  console.log('');
  line();
  console.log('  No personal data is recorded: these counters are keyed only by');
  console.log('  question id, category and game mode.');
  line();

  await store.closeStore();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
