'use strict';

/**
 * Category rotation test (PBI 3).
 *
 *   node tests/category_rotation_test.js
 *
 * Requires the Socket.io server to be running (default http://localhost:3001,
 * override with QUIZZY_SOCKET_URL).
 *
 * The half of PBI 3 this covers was missing entirely: rotation only fired when a
 * pool ran dry, and every pool holds 230 questions, so in practice a match never
 * left its first category. Now both teams answer a quota of fresh questions and
 * the lower-scoring team picks next.
 *
 * The non-obvious case is a steal: it resolves the SAME question the active team
 * already had, so it must NOT count as a second question against the quota.
 */

const {
  sleep, createReporter, waitFor, answerFor, wrongOption, submit,
  setupMatch, pickCategory, clientOnTeam, teardown,
} = require('./helpers');

const { QUESTIONS_PER_CATEGORY_PER_TEAM } = require('../server/gameLogic');

const r = createReporter('CATEGORY ROTATION — PBI 3');

/** Answers the current question correctly and waits until the room settles. */
async function playCorrect(clients) {
  const before = clients[0].room.activeQuestion?.question?.id;
  await submit(clients, answerFor(clients[0].room));
  await waitFor(
    () => {
      const room = clients[0].room;
      if (room.phase !== 'question') return true; // rotated or finished
      return room.activeQuestion && room.activeQuestion.question.id !== before;
    },
    'question resolved',
    15000,
  );
  await sleep(200);
}

async function main() {
  r.banner();

  // =====================================================================
  // 1. The quota drives rotation
  // =====================================================================
  r.section('1. Quota drives rotation');

  const { clients, code } = await setupMatch({ category: 'general' });

  r.check(
    'Counter starts at 0/0 for the picked category',
    clients[0].room.categoryAnswerCount?.blue === 0 &&
      clients[0].room.categoryAnswerCount?.red === 0,
    JSON.stringify(clients[0].room.categoryAnswerCount),
  );
  r.check('Quota is 5 questions per team', QUESTIONS_PER_CATEGORY_PER_TEAM === 5,
    `got ${QUESTIONS_PER_CATEGORY_PER_TEAM}`);

  const totalQuestions = QUESTIONS_PER_CATEGORY_PER_TEAM * 2;

  // Answer correctly throughout: no steal windows to wait on, and 5 correct
  // answers per team is 25 points each — nowhere near the 100-point win.
  for (let i = 1; i <= totalQuestions - 1; i++) {
    await playCorrect(clients);
    const counts = clients[0].room.categoryAnswerCount;
    const seen = (counts?.blue ?? 0) + (counts?.red ?? 0);
    if (i === 1) {
      r.check('First resolved question increments the counter by exactly 1', seen === 1,
        JSON.stringify(counts));
    }
    if (i === totalQuestions - 1) {
      r.check(
        `Still in the question phase after ${i} questions (quota not yet met)`,
        clients[0].room.phase === 'question',
        `phase=${clients[0].room.phase}`,
      );
      r.check(
        `Counter reads ${i} total before the last question`,
        seen === i,
        JSON.stringify(counts),
      );
    }
  }

  const scoresBefore = {
    blue: clients[0].room.teams.blue.score,
    red: clients[0].room.teams.red.score,
  };

  // The question that completes the quota
  await playCorrect(clients);
  await waitFor(() => clients[0].room.phase === 'category_pick', 'rotation to category_pick', 12000);

  const room = clients[0].room;
  r.check(`Phase rotates to category_pick after ${totalQuestions} questions`,
    room.phase === 'category_pick', `phase=${room.phase}`);
  r.check('Counter is reset to 0/0 on rotation',
    room.categoryAnswerCount.blue === 0 && room.categoryAnswerCount.red === 0,
    JSON.stringify(room.categoryAnswerCount));
  r.check('No active question is left hanging', room.activeQuestion === null);
  r.check('Scores survive the rotation',
    room.teams.blue.score >= scoresBefore.blue && room.teams.red.score >= scoresBefore.red,
    `${room.teams.blue.score}/${room.teams.red.score}`);
  r.check('Nobody won by accident (quota reached before 100 pts)',
    room.teams.blue.score < 100 && room.teams.red.score < 100,
    `${room.teams.blue.score}/${room.teams.red.score}`);

  // =====================================================================
  // 2. The lower-scoring team picks, and the spent category is inactive
  // =====================================================================
  r.section('2. Picker and inactive category');

  const blueScore = room.teams.blue.score;
  const redScore = room.teams.red.score;
  const expectedPicker = blueScore <= redScore ? 'blue' : 'red';
  r.check(`Lower-scoring team picks next (expected ${expectedPicker})`,
    room.categoryPickTeam === expectedPicker,
    `got ${room.categoryPickTeam} for ${blueScore}/${redScore}`);

  r.check('Spent category stays in usedCategories',
    room.usedCategories.includes('general'), JSON.stringify(room.usedCategories));

  // Re-picking the spent category must be refused
  const picker = clientOnTeam(clients, room.categoryPickTeam);
  picker.errors.length = 0;
  await sleep(700);
  picker.s.emit('category:pick', { roomCode: code, category: 'general' });
  await sleep(700);
  r.check('Re-picking the spent category is refused',
    picker.errors.some((e) => /already been used/i.test(e)),
    JSON.stringify(picker.errors));
  r.check('Still in category_pick after the refused pick',
    clients[0].room.phase === 'category_pick', `phase=${clients[0].room.phase}`);

  // A player who is not the picking captain must be refused too
  const other = clients.find((c) => c !== picker);
  other.errors.length = 0;
  await sleep(700);
  other.s.emit('category:pick', { roomCode: code, category: 'cinema' });
  await sleep(700);
  r.check('Only the picking captain may choose',
    other.errors.some((e) => /captain/i.test(e)),
    JSON.stringify(other.errors));

  // =====================================================================
  // 3. A fresh category restarts the counter
  // =====================================================================
  r.section('3. Fresh category restarts the counter');

  // Deliberately 'philosophy': it shipped in the bank and in the UI picker but
  // was absent from gameLogic's own copy of the allow-list, so picking it used
  // to answer "Invalid category." (PBI 4 regression guard.)
  await pickCategory(clients, 'philosophy');
  const fresh = clients[0].room;
  r.check('New category is active', fresh.selectedCategory === 'philosophy',
    `got ${fresh.selectedCategory}`);
  r.check('Counter restarts at 0/0',
    fresh.categoryAnswerCount.blue === 0 && fresh.categoryAnswerCount.red === 0,
    JSON.stringify(fresh.categoryAnswerCount));
  r.check('Both spent categories are now inactive',
    fresh.usedCategories.includes('general') && fresh.usedCategories.includes('philosophy'),
    JSON.stringify(fresh.usedCategories));
  r.check('A question was served from the new category',
    Boolean(fresh.activeQuestion), `activeQuestion=${fresh.activeQuestion}`);

  teardown(clients);

  // =====================================================================
  // 4. A steal does not double-count against the quota
  // =====================================================================
  r.section('4. A steal counts as one question, not two');

  const second = await setupMatch({ category: 'general', names: ['S1', 'S2'] });
  const sc = second.clients;

  const turnTeamBefore = sc[0].room.turnTeam;
  const qidBefore = sc[0].room.activeQuestion.question.id;

  // Miss on purpose so the opponent gets the same question as a steal.
  await submit(sc, wrongOption(sc[0].room));
  await waitFor(() => sc[0].room.activeQuestion?.isSteal === true, 'steal window opened', 12000);

  r.check('Steal reuses the same question',
    sc[0].room.activeQuestion.question.id === qidBefore);
  r.check('turnTeam is unchanged during the steal',
    sc[0].room.turnTeam === turnTeamBefore,
    `${sc[0].room.turnTeam} vs ${turnTeamBefore}`);
  r.check('Counter has not moved yet — the question is not finished',
    (sc[0].room.categoryAnswerCount.blue + sc[0].room.categoryAnswerCount.red) === 0,
    JSON.stringify(sc[0].room.categoryAnswerCount));

  // Resolve the steal correctly, then check the attribution.
  await submit(sc, answerFor(sc[0].room));
  await waitFor(
    () => sc[0].room.activeQuestion?.question?.id !== qidBefore || sc[0].room.phase !== 'question',
    'steal resolved',
    15000,
  );
  await sleep(300);

  const counts = sc[0].room.categoryAnswerCount;
  r.check('One question, one increment (steal did not double-count)',
    counts.blue + counts.red === 1, JSON.stringify(counts));
  r.check('The increment is credited to the team that owned the turn',
    counts[turnTeamBefore] === 1,
    `turnTeam=${turnTeamBefore} counts=${JSON.stringify(counts)}`);

  teardown(sc);
}

main()
  .then(() => process.exit(r.finish()))
  .catch((err) => {
    console.error(`\n[ERROR] ${err.message}`);
    r.check(`Test run completed without throwing (${err.message})`, false);
    process.exit(r.finish() || 1);
  });
