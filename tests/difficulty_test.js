'use strict';

/**
 * Difficulty curve test (PBI 7).
 *
 *   node tests/difficulty_test.js
 *
 * Mostly pure: the curve and the selector are deterministic given an injected
 * rng, so the interesting behaviour is tested directly rather than by playing
 * thousands of socket questions. A short socket section at the end confirms the
 * wiring — that a served question carries a difficulty and that scoring is
 * untouched.
 */

const {
  sleep, createReporter, waitFor, setupMatch, answerFor, submit, teardown,
} = require('./helpers');

const {
  DEFAULT_DIFFICULTY, HARD_RAMP_START_FRACTION,
  difficultyOf, hardProbability, pickTargetDifficulty, fallbackOrder, selectQuestion,
} = require('../server/difficulty');

const { QUESTIONS } = require('../server/questions');

const r = createReporter('DIFFICULTY CURVE — PBI 7');

/** Deterministic rng that walks a fixed list, so a draw is reproducible. */
function seqRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

/** Samples the target difficulty many times at one score. */
function distributionAt(score, threshold = 100, n = 4000) {
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < n; i++) counts[pickTargetDifficulty(score, threshold)]++;
  return { ...counts, hardPct: counts[3] / n, easyPct: counts[1] / n };
}

async function main() {
  r.banner();

  // =====================================================================
  // 1. Tagging
  // =====================================================================
  r.section('1. Tagging');

  r.check('Untagged questions default to medium', difficultyOf({}) === DEFAULT_DIFFICULTY,
    `${difficultyOf({})}`);
  r.check('An out-of-range difficulty falls back to medium',
    difficultyOf({ difficulty: 7 }) === DEFAULT_DIFFICULTY &&
      difficultyOf({ difficulty: 0 }) === DEFAULT_DIFFICULTY,
    `${difficultyOf({ difficulty: 7 })}/${difficultyOf({ difficulty: 0 })}`);
  r.check('An explicit difficulty is respected',
    difficultyOf({ difficulty: 1 }) === 1 && difficultyOf({ difficulty: 3 }) === 3);

  // Every category needs all three buckets, or the curve silently flattens into
  // the fallback for that category.
  const thin = [];
  for (const [category, pool] of Object.entries(QUESTIONS)) {
    const counts = { 1: 0, 2: 0, 3: 0 };
    for (const q of pool) counts[difficultyOf(q)]++;
    if (counts[1] === 0 || counts[2] === 0 || counts[3] === 0) {
      thin.push(`${category} ${JSON.stringify(counts)}`);
    }
  }
  r.check('Every category has easy, medium AND hard questions', thin.length === 0,
    thin.join(' | '));

  // =====================================================================
  // 2. The hard ramp
  // =====================================================================
  r.section('2. The hard ramp');

  r.check('No hard questions at score 0', hardProbability(0, 100) === 0,
    `${hardProbability(0, 100)}`);
  r.check('No hard questions at the ramp start (60 of 100)',
    hardProbability(60, 100) === 0, `${hardProbability(60, 100)}`);
  r.check('Ramp start is 60% of the win threshold',
    HARD_RAMP_START_FRACTION === 0.6, `${HARD_RAMP_START_FRACTION}`);
  r.check('Halfway up the ramp is 50% hard',
    Math.abs(hardProbability(80, 100) - 0.5) < 1e-9, `${hardProbability(80, 100)}`);
  r.check('At the win threshold it is fully hard', hardProbability(100, 100) === 1,
    `${hardProbability(100, 100)}`);
  r.check('The probability is clamped above the threshold',
    hardProbability(140, 100) === 1, `${hardProbability(140, 100)}`);
  r.check('The ramp rises monotonically',
    [61, 70, 80, 90, 99].every((sc, i, arr) =>
      i === 0 || hardProbability(sc, 100) > hardProbability(arr[i - 1], 100)),
    JSON.stringify([61, 70, 80, 90, 99].map((sc) => hardProbability(sc, 100))));

  // The fraction exists so a mode with a different target still ramps (PBI 9).
  r.check('The ramp scales to a 50-point threshold (Fast mode)',
    hardProbability(30, 50) === 0 &&
      Math.abs(hardProbability(40, 50) - 0.5) < 1e-9 &&
      hardProbability(50, 50) === 1,
    `${hardProbability(30, 50)}/${hardProbability(40, 50)}/${hardProbability(50, 50)}`);

  // =====================================================================
  // 3. The distribution shifts in the right direction
  // =====================================================================
  r.section('3. Distribution by score');

  const at0 = distributionAt(0);
  const at30 = distributionAt(30);
  const at65 = distributionAt(65);
  const at95 = distributionAt(95);

  r.check('Score 0 draws no hard questions', at0.hardPct === 0, JSON.stringify(at0));
  r.check('Score 0 is essentially all easy', at0.easyPct > 0.97, JSON.stringify(at0));
  r.check('Score 30 is a roughly even easy/medium mix',
    at30.easyPct > 0.35 && at30.easyPct < 0.65 && at30.hardPct === 0,
    JSON.stringify(at30));
  r.check('Score 65 has started drawing hard questions but rarely',
    at65.hardPct > 0 && at65.hardPct < 0.25, JSON.stringify(at65));
  r.check('Score 95 is mostly hard', at95.hardPct > 0.8, JSON.stringify(at95));
  r.check('Hard share rises monotonically with score',
    at0.hardPct <= at30.hardPct && at30.hardPct < at65.hardPct && at65.hardPct < at95.hardPct,
    `${at0.hardPct} ${at30.hardPct} ${at65.hardPct} ${at95.hardPct}`);
  r.check('Easy share falls as the score rises', at0.easyPct > at30.easyPct,
    `${at0.easyPct} > ${at30.easyPct}`);

  // =====================================================================
  // 4. Fallback when a bucket is empty
  // =====================================================================
  r.section('4. Fallback');

  r.check('Fallback from hard steps down through medium',
    JSON.stringify(fallbackOrder(3)) === JSON.stringify([3, 2, 1]),
    JSON.stringify(fallbackOrder(3)));
  r.check('Fallback from easy steps up through medium',
    JSON.stringify(fallbackOrder(1)) === JSON.stringify([1, 2, 3]),
    JSON.stringify(fallbackOrder(1)));
  r.check('Fallback from medium prefers easy over hard on a tie',
    JSON.stringify(fallbackOrder(2)) === JSON.stringify([2, 1, 3]),
    JSON.stringify(fallbackOrder(2)));

  const mediumOnly = [
    { id: 'm1', difficulty: 2 },
    { id: 'm2', difficulty: 2 },
  ];
  const pickedHard = selectQuestion(mediumOnly, [], 3, seqRng([0.1]));
  r.check('Asking for hard in a medium-only pool returns a medium question',
    pickedHard !== null && pickedHard.difficulty === 2, JSON.stringify(pickedHard));

  const hardOnly = [{ id: 'h1', difficulty: 3 }];
  const pickedEasy = selectQuestion(hardOnly, [], 1, seqRng([0.1]));
  r.check('Asking for easy in a hard-only pool returns the hard question',
    pickedEasy !== null && pickedEasy.difficulty === 3, JSON.stringify(pickedEasy));

  r.check('An exhausted pool returns null (the caller rotates category)',
    selectQuestion(mediumOnly, ['m1', 'm2'], 2, seqRng([0.1])) === null);

  r.check('A partially used pool never returns a used question',
    selectQuestion(mediumOnly, ['m1'], 2, seqRng([0.9])).id === 'm2');

  // No difficulty request can ever strand a non-empty pool.
  let stranded = 0;
  for (const target of [1, 2, 3]) {
    for (const [, pool] of Object.entries(QUESTIONS)) {
      if (selectQuestion(pool, [], target) === null) stranded++;
    }
  }
  r.check('No target difficulty strands any real category', stranded === 0, `${stranded}`);

  // =====================================================================
  // 5. Wiring and untouched scoring
  // =====================================================================
  r.section('5. Wiring and scoring');

  const { clients } = await setupMatch({ category: 'general', names: ['D1', 'D2'] });

  r.check('Win threshold is on the room', clients[0].room.winThreshold === 100,
    `${clients[0].room.winThreshold}`);

  const served = clients[0].room.activeQuestion;
  r.check('A served question carries its difficulty', [1, 2, 3].includes(served.difficulty),
    `${served.difficulty}`);
  r.check('An early question is not hard', served.difficulty !== 3,
    `score=0 difficulty=${served.difficulty}`);

  // Scoring must be flat regardless of difficulty — that is the whole point.
  const team = clients[0].room.activeTeam;
  const before = clients[0].room.teams[team].score;
  const qid = served.question.id;
  await submit(clients, answerFor(clients[0].room));
  await waitFor(
    () => clients[0].room.activeQuestion?.question?.id !== qid ||
      clients[0].room.phase !== 'question',
    'question resolved',
    15000,
  );
  r.check('A correct answer is +5 regardless of difficulty',
    clients[0].room.teams[team].score === before + 5,
    `${before} -> ${clients[0].room.teams[team].score} (difficulty ${served.difficulty})`);

  // Over several questions the served difficulties must all be legitimate.
  const seen = new Set([served.difficulty]);
  for (let i = 0; i < 3; i++) {
    const id = clients[0].room.activeQuestion?.question?.id;
    if (!id) break;
    seen.add(clients[0].room.activeQuestion.difficulty);
    await submit(clients, answerFor(clients[0].room));
    await waitFor(
      () => clients[0].room.activeQuestion?.question?.id !== id ||
        clients[0].room.phase !== 'question',
      'next question',
      15000,
    );
    await sleep(150);
  }
  r.check('Every served difficulty is 1, 2 or 3',
    [...seen].every((d) => [1, 2, 3].includes(d)), JSON.stringify([...seen]));

  teardown(clients);
}

main()
  .then(() => process.exit(r.finish()))
  .catch((err) => {
    console.error(`\n[ERROR] ${err.message}`);
    r.check(`Test run completed without throwing (${err.message})`, false);
    process.exit(r.finish() || 1);
  });
