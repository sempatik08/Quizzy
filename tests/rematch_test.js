'use strict';

/**
 * Rematch test (PBI 8).
 *
 *   node tests/rematch_test.js
 *
 * Requires the Socket.io server to be running.
 *
 * The match is ended by surrender rather than by playing to 100 points: the
 * outcome is identical for rematch purposes and it takes one emit instead of
 * twenty questions.
 */

const {
  sleep, RATE_GAP, createReporter, waitFor, setupMatch, pickCategory,
  clientOnTeam, myTeam, teardown,
} = require('./helpers');

const r = createReporter('REMATCH — PBI 8');

async function main() {
  r.banner();

  const { p1, p2, clients, code } = await setupMatch({ category: 'general', names: ['R1', 'R2'] });

  // =====================================================================
  // 1. A rematch cannot be requested mid-match
  // =====================================================================
  r.section('1. Only after the match ends');

  p1.errors.length = 0;
  p1.s.emit('rematch:request', {});
  await sleep(900);
  r.check('Requesting a rematch during play is refused',
    p1.errors.some((e) => /after the match ends/i.test(e)),
    JSON.stringify(p1.errors));

  r.check('Rematch state starts empty',
    p1.room.rematch?.blue === false && p1.room.rematch?.red === false,
    JSON.stringify(p1.room.rematch));

  // Capture what a rematch must preserve
  const before = {
    code: p1.room.code,
    playerIds: Object.keys(p1.room.players).sort(),
    blueTeam: [...p1.room.teams.blue.players],
    redTeam: [...p1.room.teams.red.players],
    blueCaptain: p1.room.teams.blue.captain,
    redCaptain: p1.room.teams.red.captain,
    hostId: p1.room.hostId,
    usedQuestionIds: p1.room.usedQuestionIds.length,
  };
  r.check('Some questions were used before the rematch', before.usedQuestionIds > 0,
    `${before.usedQuestionIds}`);

  // =====================================================================
  // 2. End the match, then one-sided consent must not restart it
  // =====================================================================
  r.section('2. One-sided consent does not restart');

  await sleep(RATE_GAP);
  p1.s.emit('surrender:initiate', {});
  await waitFor(() => p1.room.phase === 'finished', 'match finished by surrender', 12000);

  const surrenderTeam = myTeam(p1);
  const winnerTeam = surrenderTeam === 'blue' ? 'red' : 'blue';
  r.check('Surrender ended the match', p1.room.phase === 'finished');
  r.check('Winner was pushed to the win threshold',
    p1.room.teams[winnerTeam].score >= 100,
    `${winnerTeam}=${p1.room.teams[winnerTeam].score}`);

  await sleep(RATE_GAP);
  p1.errors.length = 0;
  p1.s.emit('rematch:request', {});
  await waitFor(() => p1.room.rematch?.[surrenderTeam] === true, 'first team consented');

  r.check('Requesting team is recorded',
    p1.room.rematch[surrenderTeam] === true, JSON.stringify(p1.room.rematch));
  r.check('Opposing team is still undecided',
    p1.room.rematch[winnerTeam] === false, JSON.stringify(p1.room.rematch));
  r.check('Match has NOT restarted on one-sided consent',
    p1.room.phase === 'finished', `phase=${p1.room.phase}`);
  r.check('Both clients see the same pending consent',
    p2.room.rematch?.[surrenderTeam] === true, JSON.stringify(p2.room.rematch));
  r.check('Scores are untouched while waiting',
    p1.room.teams[winnerTeam].score >= 100,
    `${p1.room.teams[winnerTeam].score}`);

  // Double-voting is refused rather than silently ignored
  await sleep(RATE_GAP);
  p1.errors.length = 0;
  p1.s.emit('rematch:request', {});
  await sleep(900);
  r.check('The same team cannot consent twice',
    p1.errors.some((e) => /already agreed/i.test(e)),
    JSON.stringify(p1.errors));

  // =====================================================================
  // 3. Both sides agree — the match restarts in the same room
  // =====================================================================
  r.section('3. Both sides agree');

  await sleep(RATE_GAP);
  p2.s.emit('rematch:request', {});
  await waitFor(() => p1.room.phase === 'coin_toss', 'rematch coin toss', 12000);

  r.check('Phase returns to coin_toss', p1.room.phase === 'coin_toss');

  const after = p1.room;
  r.check('Room code is unchanged', after.code === before.code,
    `${after.code} vs ${before.code}`);
  r.check('Both scores are back to 0',
    after.teams.blue.score === 0 && after.teams.red.score === 0,
    `${after.teams.blue.score}/${after.teams.red.score}`);
  r.check('Question pool is cleared', after.usedQuestionIds.length === 0,
    `${after.usedQuestionIds.length}`);
  r.check('Category history is cleared', (after.usedCategories ?? []).length === 0,
    JSON.stringify(after.usedCategories));
  r.check('Selected category is cleared', after.selectedCategory === null,
    `${after.selectedCategory}`);
  r.check('Steal charges are restored to 2 each',
    after.stealCharges.blue === 2 && after.stealCharges.red === 2,
    JSON.stringify(after.stealCharges));
  r.check('Per-category counter is cleared',
    after.categoryAnswerCount.blue === 0 && after.categoryAnswerCount.red === 0,
    JSON.stringify(after.categoryAnswerCount));
  r.check('Rematch consent is cleared for the new match',
    after.rematch.blue === false && after.rematch.red === false,
    JSON.stringify(after.rematch));
  r.check('No stale active question survives', after.activeQuestion === null);
  r.check('No stale surrender vote survives', after.surrenderVote === null);

  r.check('Players are preserved',
    JSON.stringify(Object.keys(after.players).sort()) === JSON.stringify(before.playerIds),
    JSON.stringify(Object.keys(after.players).sort()));
  r.check('Team assignments are preserved',
    JSON.stringify(after.teams.blue.players) === JSON.stringify(before.blueTeam) &&
      JSON.stringify(after.teams.red.players) === JSON.stringify(before.redTeam));
  r.check('Captains are preserved',
    after.teams.blue.captain === before.blueCaptain &&
      after.teams.red.captain === before.redCaptain);
  r.check('Host is preserved', after.hostId === before.hostId);

  // =====================================================================
  // 4. The new match is actually playable
  // =====================================================================
  r.section('4. The new match is playable');

  await waitFor(() => p1.room.phase === 'category_pick', 'fresh category pick', 12000);
  r.check('A fresh coin toss ran', Boolean(p1.room.coinTossWinner),
    `${p1.room.coinTossWinner}`);
  r.check('Previously spent category is selectable again',
    !(p1.room.usedCategories ?? []).includes('general'),
    JSON.stringify(p1.room.usedCategories));

  await pickCategory(clients, 'general');
  r.check('A question is served in the new match',
    Boolean(p1.room.activeQuestion) && p1.room.phase === 'question',
    `phase=${p1.room.phase}`);
  r.check('The new match starts with a full 60s window',
    p1.room.activeQuestion.duration === 60,
    `${p1.room.activeQuestion.duration}`);
  r.check('The new question is not a steal',
    p1.room.activeQuestion.isSteal === false);

  teardown(clients);
}

main()
  .then(() => process.exit(r.finish()))
  .catch((err) => {
    console.error(`\n[ERROR] ${err.message}`);
    r.check(`Test run completed without throwing (${err.message})`, false);
    process.exit(r.finish() || 1);
  });
