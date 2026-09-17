'use strict';

/**
 * Joker test (PBI 6).
 *
 *   node tests/joker_test.js
 *
 * Requires the Socket.io server to be running.
 *
 * The assertion that matters most is that 50/50 never strikes out the correct
 * answer. The test reads the answer key straight from the question bank, so it
 * can check that directly rather than inferring it from the outcome.
 */

const {
  sleep, RATE_GAP, OPTS, createReporter, waitFor, setupMatch, answerFor,
  wrongOption, clientOnTeam, myTeam, submit, teardown,
} = require('./helpers');

const { JOKER_EXTRA_SECONDS, JOKER_FIFTY_FIFTY_REMOVES } = require('../server/gameLogic');

const r = createReporter('JOKERS — PBI 6');

/** The client whose team is on turn, and its captain status. */
function activeClient(clients) {
  return clientOnTeam(clients, clients[0].room.activeTeam);
}

async function main() {
  r.banner();

  const { clients, code } = await setupMatch({ category: 'general', names: ['J1', 'J2'] });

  // =====================================================================
  // 1. Fresh allocation
  // =====================================================================
  r.section('1. Allocation');

  r.check('Both teams start with a 50/50 joker',
    clients[0].room.jokers?.blue?.fiftyFifty === true &&
      clients[0].room.jokers?.red?.fiftyFifty === true,
    JSON.stringify(clients[0].room.jokers));
  r.check('Both teams start with an extra-time joker',
    clients[0].room.jokers?.blue?.extraTime === true &&
      clients[0].room.jokers?.red?.extraTime === true,
    JSON.stringify(clients[0].room.jokers));
  r.check('50/50 is configured to remove 2 options', JOKER_FIFTY_FIFTY_REMOVES === 2,
    `${JOKER_FIFTY_FIFTY_REMOVES}`);
  r.check('Extra time is configured at 15s', JOKER_EXTRA_SECONDS === 15,
    `${JOKER_EXTRA_SECONDS}`);

  // =====================================================================
  // 2. Only the captain of the team on turn may spend one
  // =====================================================================
  r.section('2. Authorisation');

  const active = activeClient(clients);
  const idle = clients.find((c) => c !== active);

  // In a 1v1 both players are solo captains, so the idle client is a captain of
  // its own team — which makes it exactly the right probe for "wrong turn".
  idle.errors.length = 0;
  await sleep(RATE_GAP);
  idle.s.emit('joker:use', { type: 'fifty_fifty' });
  await sleep(900);
  r.check('A captain whose turn it is not is refused',
    idle.errors.some((e) => /not your turn/i.test(e)),
    JSON.stringify(idle.errors));
  r.check('The refused request spent nothing',
    clients[0].room.jokers[myTeam(idle)].fiftyFifty === true,
    JSON.stringify(clients[0].room.jokers));

  active.errors.length = 0;
  await sleep(RATE_GAP);
  active.s.emit('joker:use', { type: 'nonsense' });
  await sleep(900);
  r.check('An unknown joker type is refused',
    active.errors.some((e) => /invalid joker/i.test(e)),
    JSON.stringify(active.errors));

  // =====================================================================
  // 3. 50/50 strikes out two WRONG options
  // =====================================================================
  r.section('3. 50/50');

  const activeTeam = clients[0].room.activeTeam;
  const correct = answerFor(clients[0].room);
  r.check('Question starts with no options disabled',
    clients[0].room.activeQuestion.disabledOptions.length === 0,
    JSON.stringify(clients[0].room.activeQuestion.disabledOptions));

  await sleep(RATE_GAP);
  active.s.emit('joker:use', { type: 'fifty_fifty' });
  await waitFor(
    () => clients[0].room.activeQuestion?.disabledOptions.length === 2,
    'two options disabled',
  );

  const disabled = clients[0].room.activeQuestion.disabledOptions;
  r.check('Exactly two options are struck out', disabled.length === 2, JSON.stringify(disabled));
  r.check('The correct answer is NOT struck out', !disabled.includes(correct),
    `answer=${correct} disabled=${JSON.stringify(disabled)}`);
  r.check('Both struck-out options are real option keys',
    disabled.every((d) => OPTS.includes(d)), JSON.stringify(disabled));
  r.check('50/50 is now spent for that team',
    clients[0].room.jokers[activeTeam].fiftyFifty === false,
    JSON.stringify(clients[0].room.jokers));
  r.check('The opponent still holds its own 50/50',
    clients[0].room.jokers[activeTeam === 'blue' ? 'red' : 'blue'].fiftyFifty === true,
    JSON.stringify(clients[0].room.jokers));

  // ANTI-CHEAT: disabling options must not leak the answer into room state.
  r.check('Room state still hides the answer after 50/50',
    clients[0].room.activeQuestion.question.answer === undefined,
    `answer=${clients[0].room.activeQuestion.question.answer}`);

  active.errors.length = 0;
  await sleep(RATE_GAP);
  active.s.emit('joker:use', { type: 'fifty_fifty' });
  await sleep(900);
  r.check('Spending the same joker twice is refused',
    active.errors.some((e) => /already used/i.test(e)),
    JSON.stringify(active.errors));
  r.check('The refused second attempt disabled nothing more',
    clients[0].room.activeQuestion.disabledOptions.length === 2,
    JSON.stringify(clients[0].room.activeQuestion.disabledOptions));

  // =====================================================================
  // 4. Extra time extends the running window
  // =====================================================================
  r.section('4. Extra time');

  const durationBefore = clients[0].room.activeQuestion.duration;
  const leftBefore = clients[0].room.activeQuestion.timeLeft;

  await sleep(RATE_GAP);
  active.s.emit('joker:use', { type: 'extra_time' });
  await waitFor(
    () => clients[0].room.activeQuestion?.duration === durationBefore + JOKER_EXTRA_SECONDS,
    'duration extended',
  );

  const aq = clients[0].room.activeQuestion;
  r.check(`Duration grew by ${JOKER_EXTRA_SECONDS}s`,
    aq.duration === durationBefore + JOKER_EXTRA_SECONDS,
    `${durationBefore} -> ${aq.duration}`);
  r.check('timeLeft went up rather than down', aq.timeLeft > leftBefore,
    `${leftBefore} -> ${aq.timeLeft}`);
  r.check('Extra time is now spent',
    clients[0].room.jokers[activeTeam].extraTime === false,
    JSON.stringify(clients[0].room.jokers));
  r.check('The extended clock is still counting',
    aq.timeLeft <= aq.duration, `${aq.timeLeft}/${aq.duration}`);

  // The extension re-arms the tick interval and the resolve timeout. An
  // extension that dropped either would leave the question hanging forever, and
  // room.activeQuestion.timeLeft would not catch it — that only refreshes on a
  // room:update, so the live clock has to be read from the tick stream.
  active.ticks.length = 0;
  await sleep(3200);
  const ticks = [...active.ticks];
  r.check('Ticks keep arriving after the extension', ticks.length >= 2,
    `got ${ticks.length}: ${JSON.stringify(ticks)}`);
  r.check('The extended clock counts down monotonically',
    ticks.length >= 2 && ticks[ticks.length - 1] < ticks[0],
    JSON.stringify(ticks));
  r.check('Ticks stay within the extended duration',
    ticks.every((v) => v <= durationBefore + JOKER_EXTRA_SECONDS),
    JSON.stringify(ticks));

  await sleep(RATE_GAP);
  active.errors.length = 0;
  active.s.emit('joker:use', { type: 'extra_time' });
  await sleep(900);
  r.check('Spending extra time twice is refused',
    active.errors.some((e) => /already used/i.test(e)),
    JSON.stringify(active.errors));

  // =====================================================================
  // 5. A question can still be answered normally after jokers
  // =====================================================================
  r.section('5. Answering after a joker');

  const scoreBefore = clients[0].room.teams[activeTeam].score;
  const qid = clients[0].room.activeQuestion.question.id;
  await submit(clients, correct);
  await waitFor(
    () => clients[0].room.activeQuestion?.question?.id !== qid ||
      clients[0].room.phase !== 'question',
    'question resolved',
    15000,
  );
  r.check('A correct answer after 50/50 still scores +5',
    clients[0].room.teams[activeTeam].score === scoreBefore + 5,
    `${scoreBefore} -> ${clients[0].room.teams[activeTeam].score}`);

  r.check('The new question starts with a clean slate',
    clients[0].room.activeQuestion.disabledOptions.length === 0 &&
      clients[0].room.activeQuestion.duration === 60,
    JSON.stringify({
      disabled: clients[0].room.activeQuestion.disabledOptions,
      duration: clients[0].room.activeQuestion.duration,
    }));
  r.check('Spent jokers do NOT come back on the next question',
    clients[0].room.jokers[activeTeam].fiftyFifty === false &&
      clients[0].room.jokers[activeTeam].extraTime === false,
    JSON.stringify(clients[0].room.jokers));

  teardown(clients);

  // =====================================================================
  // 6. Jokers are blocked during a steal window
  // =====================================================================
  r.section('6. Blocked during a steal');

  const second = await setupMatch({ category: 'general', names: ['K1', 'K2'] });
  const sc = second.clients;

  await submit(sc, wrongOption(sc[0].room));
  await waitFor(() => sc[0].room.activeQuestion?.isSteal === true, 'steal opened', 12000);

  const stealTeam = sc[0].room.activeQuestion.stealTeam;
  const stealer = clientOnTeam(sc, stealTeam);
  stealer.errors.length = 0;
  await sleep(RATE_GAP);
  stealer.s.emit('joker:use', { type: 'fifty_fifty' });
  await sleep(900);

  r.check('The stealing team cannot spend a joker mid-steal',
    stealer.errors.some((e) => /during a steal/i.test(e)),
    JSON.stringify(stealer.errors));
  r.check('The blocked attempt left the joker intact',
    sc[0].room.jokers[stealTeam].fiftyFifty === true,
    JSON.stringify(sc[0].room.jokers));

  teardown(sc);

  // =====================================================================
  // 7. A rematch restores both jokers
  // =====================================================================
  r.section('7. Rematch restores jokers');

  const third = await setupMatch({ category: 'general', names: ['M1', 'M2'] });
  const tc = third.clients;
  const tActive = activeClient(tc);
  const tTeam = tc[0].room.activeTeam;

  await sleep(RATE_GAP);
  tActive.s.emit('joker:use', { type: 'fifty_fifty' });
  await waitFor(() => tc[0].room.jokers[tTeam].fiftyFifty === false, 'joker spent');

  await sleep(RATE_GAP);
  tc[0].s.emit('surrender:initiate', {});
  await waitFor(() => tc[0].room.phase === 'finished', 'match finished', 12000);

  await sleep(RATE_GAP);
  tc[0].s.emit('rematch:request', {});
  await sleep(RATE_GAP);
  tc[1].s.emit('rematch:request', {});
  await waitFor(() => tc[0].room.phase === 'coin_toss', 'rematch started', 12000);

  r.check('Both jokers are restored for both teams after a rematch',
    tc[0].room.jokers.blue.fiftyFifty && tc[0].room.jokers.blue.extraTime &&
      tc[0].room.jokers.red.fiftyFifty && tc[0].room.jokers.red.extraTime,
    JSON.stringify(tc[0].room.jokers));

  teardown(tc);
}

main()
  .then(() => process.exit(r.finish()))
  .catch((err) => {
    console.error(`\n[ERROR] ${err.message}`);
    r.check(`Test run completed without throwing (${err.message})`, false);
    process.exit(r.finish() || 1);
  });
