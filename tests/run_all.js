'use strict';

/**
 * Runs every tests/*_test.js in sequence and reports a single summary.
 *
 *   node tests/run_all.js              # all suites
 *   node tests/run_all.js joker steal  # only suites whose name matches
 *
 * They run sequentially on purpose: each one drives real socket clients against
 * a shared server and the rate limiter is per player, so parallel runs would
 * fight over timing rather than test anything.
 *
 * Suites that need the socket server say so; question_bank_test is pure.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TESTS_DIR = __dirname;
const filters = process.argv.slice(2);

const suites = fs
  .readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith('_test.js'))
  .filter((f) => filters.length === 0 || filters.some((x) => f.includes(x)))
  .sort((a, b) => {
    // The pure bank test first: it is instant and catches content breakage
    // before anything spends 30 seconds driving sockets.
    if (a.startsWith('question_bank')) return -1;
    if (b.startsWith('question_bank')) return 1;
    return a.localeCompare(b);
  });

if (suites.length === 0) {
  console.log('No matching test suites.');
  process.exit(1);
}

console.log(`\nRunning ${suites.length} suite(s): ${suites.join(', ')}\n`);

const results = [];

for (const suite of suites) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [path.join(TESTS_DIR, suite)], {
    stdio: 'inherit',
    env: process.env,
  });
  results.push({
    suite,
    ok: res.status === 0,
    code: res.status,
    seconds: ((Date.now() - started) / 1000).toFixed(1),
  });
}

console.log(`\n${'#'.repeat(62)}`);
console.log('  ALL SUITES');
console.log('#'.repeat(62));
for (const rr of results) {
  console.log(`  ${rr.ok ? 'OK  ' : 'FAIL'}  ${rr.suite.padEnd(34)} ${rr.seconds}s`);
}
const failed = results.filter((rr) => !rr.ok);
console.log('#'.repeat(62));
console.log(`  ${results.length - failed.length}/${results.length} suites passed`);
console.log('#'.repeat(62));

process.exit(failed.length === 0 ? 0 : 1);
