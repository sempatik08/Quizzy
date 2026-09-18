'use strict';

/**
 * Game modes test (PBI 9).
 *
 *   node tests/game_modes_test.js
 *
 * Requires the Socket.io server to be running.
 *
 * One section per mode, each checking the thing that mode actually changes,
 * plus the two rules that must NOT change: the anti-cheat withholding and the
 * mode being refused rather than silently downgraded.
 */

const {
  sleep, RATE_GAP, createReporter, waitFor, makeClient, myTeam, clientOnTeam,
  answerFor, wrongOption, submit, setupMatch, pickCategory, teardown,
} = require('./helpers');

const { GAME_MODES, MODE_KEYS, getMode, DEFAULT_MODE } = require('../server/gameModes');
const { lostWagerCost } = require('../server/gameLogic');

const r = createReporter('GAME MODES — PBI 9');

const created = [];
function client(name) {
  const c = makeClient(name);
  created.push(c);
  return c;
}

/** Builds a room in `mode` with `perTeam` players on each side, then starts it. */
async function startMatch(mode, perTeam, prefix, category = 'general') {
  const host = client(`${prefix}Host`);
  host.s.emit('room:create', { playerName: `${prefix}Host`, mode });
  await waitFor(() => host.room, `${mode} room created`);
  const code = host.room.code;

  const all = [host];
  for (let i = 1; i < perTeam * 2; i++) {
    const c = client(`${prefix}P${i}`);
    c.s.emit('room:join', { roomCode: code, playerName: `${prefix}P${i}` });
    await waitFor(() => c.playerId, `${prefix}P${i} joined`);
    all.push(c);
  }

  for (let i = 0; i < all.length; i++) {
    await sleep(RATE_GAP);
    all[i].s.emit('team:join', { roomCode: code, team: i < perTeam ? 'blue' : 'red' });
  }
  await waitFor(
    () => host.room.teams.blue.players.length === perTeam &&
      host.room.teams.red.players.length === perTeam,
    'teams assigned',
  );

  await sleep(RATE_GAP);
  host.s.emit('teams:lock', { roomCode: code });
  return { host, all, code };
}

async function main() {
  r.banner();

  // =====================================================================
  // 1. Mode definitions and validation
  // =====================================================================
  r.section('1. Definitions');

  r.check('All four modes exist',
    ['classic', 'fast', 'survival', 'wager'].every((k) => MODE_KEYS.includes(k)),
    JSON.stringify(MODE_KEYS));
  r.check('Default mode is classic', DEFAULT_MODE === 'classic', DEFAULT_MODE);
  r.check('An unknown mode resolves to classic (never throws)',
    getMode('nope').key === 'classic' && getMode(undefined).key === 'classic');
  // Thresholds were halved on 2026-09-19 after a real 60-question match ended
  // 27-40 with a target of 100. See the note in gameModes.js.
  r.check('Classic is 60s / 50 points',
    GAME_MODES.classic.questionSeconds === 60 && GAME_MODES.classic.winThreshold === 50,
    `${GAME_MODES.classic.questionSeconds}s / ${GAME_MODES.classic.winThreshold}`);
  r.check('Fast is 30s / 30 points',
    GAME_MODES.fast.questionSeconds === 30 && GAME_MODES.fast.winThreshold === 30,
    `${GAME_MODES.fast.questionSeconds}s / ${GAME_MODES.fast.winThreshold}`);
  r.check('Every mode target is reachable in a party-game number of questions',
    Object.values(GAME_MODES).every((m) => m.winThreshold <= 50),
    JSON.stringify(Object.fromEntries(
      Object.entries(GAME_MODES).map(([k, m]) => [k, m.winThreshold]))));
  // Wager was a random walk with a full-stake loss: at realistic accuracy the
  // expected gain per question is ~0, so the score hovered and the match never
  // ended. Anything below 1 guarantees forward drift.
  r.check('A lost wager costs LESS than a won one pays',
    GAME_MODES.wager.lossFactor < 1, `${GAME_MODES.wager.lossFactor}`);
  r.check('A lost stake costs lossFactor x the stake',
    lostWagerCost(GAME_MODES.wager, 10) === 5 && lostWagerCost(GAME_MODES.wager, 3) === 2,
    `${lostWagerCost(GAME_MODES.wager, 10)} / ${lostWagerCost(GAME_MODES.wager, 3)}`);
  r.check('Non-wager modes have no stakes to lose',
    ['classic', 'fast', 'survival'].every((k) => GAME_MODES[k].wagerOptions === null));

  // The client ships its own copy of the targets, for copy that must name a
  // number before a room exists (the create form, the footer). Five call sites
  // hardcoded "100" and every one went stale when the thresholds changed, so the
  // client table is GENERATED from this one and pinned to it here.
  // Regenerate with: node scripts/sync-game-modes.js
  const clientModes = require('../src/data/game-modes.json');
  const drift = Object.entries(GAME_MODES)
    .filter(([k, m]) => clientModes.winThreshold[k] !== m.winThreshold)
    .map(([k, m]) => `${k}: client ${clientModes.winThreshold[k]} vs server ${m.winThreshold}`);
  r.check('Client and server win thresholds agree', drift.length === 0, drift.join(' | '));
  r.check('Client and server wager stakes agree',
    JSON.stringify(clientModes.wagerOptions) === JSON.stringify(GAME_MODES.wager.wagerOptions),
    JSON.stringify(clientModes.wagerOptions));
  r.check('Survival eliminates on a wrong answer and needs 2 per team',
    GAME_MODES.survival.eliminateOnWrong === true &&
      GAME_MODES.survival.minPlayersPerTeam === 2);
  r.check('Wager offers 3 / 5 / 10',
    JSON.stringify(GAME_MODES.wager.wagerOptions) === JSON.stringify([3, 5, 10]));

  const bad = client('BadMode');
  bad.s.emit('room:create', { playerName: 'BadMode', mode: 'ultra' });
  await sleep(900);
  r.check('An unknown mode is REFUSED, not downgraded',
    bad.room === null && bad.errors.some((e) => /unknown game mode/i.test(e)),
    JSON.stringify(bad.errors));

  // =====================================================================
  // 2. Classic is unchanged
  // =====================================================================
  r.section('2. Classic');

  const classic = await setupMatch({ category: 'general', names: ['C1', 'C2'] });
  created.push(...classic.clients);

  r.check('Classic room reports its mode', classic.p1.room.mode === 'classic',
    classic.p1.room.mode);
  r.check('Classic serves a 60s window', classic.p1.room.activeQuestion.duration === 60,
    `${classic.p1.room.activeQuestion.duration}`);
  r.check('Classic wins at 50', classic.p1.room.winThreshold === 50,
    `${classic.p1.room.winThreshold}`);
  r.check('Classic has no wager step', classic.p1.room.activeQuestion.wagerPending === false);
  r.check('Classic shows the question immediately',
    typeof classic.p1.room.activeQuestion.question.text === 'string',
    `${classic.p1.room.activeQuestion.question.text}`);

  const cTeam = classic.p1.room.activeTeam;
  const cBefore = classic.p1.room.teams[cTeam].score;
  const cQid = classic.p1.room.activeQuestion.question.id;
  await submit(classic.clients, answerFor(classic.p1.room));
  await waitFor(
    () => classic.p1.room.activeQuestion?.question?.id !== cQid ||
      classic.p1.room.phase !== 'question',
    'classic question resolved', 15000,
  );
  r.check('Classic correct answer is +5',
    classic.p1.room.teams[cTeam].score === cBefore + 5,
    `${cBefore} -> ${classic.p1.room.teams[cTeam].score}`);
  teardown(classic.clients);

  // =====================================================================
  // 3. Fast: half the clock, half the target
  // =====================================================================
  r.section('3. Fast');

  const fast = await startMatch('fast', 1, 'F');
  await waitFor(() => fast.host.room.phase === 'category_pick', 'fast category_pick', 12000);
  await pickCategory(fast.all, 'general');

  r.check('Fast room reports its mode', fast.host.room.mode === 'fast', fast.host.room.mode);
  r.check('Fast serves a 30s window', fast.host.room.activeQuestion.duration === 30,
    `${fast.host.room.activeQuestion.duration}`);
  r.check('Fast wins at 30', fast.host.room.winThreshold === 30,
    `${fast.host.room.winThreshold}`);

  // The clock must actually run at the shorter length, not just report it.
  const actor = clientOnTeam(fast.all, fast.host.room.activeTeam);
  actor.ticks.length = 0;
  await sleep(2400);
  r.check('Fast ticks start from the 30s window',
    actor.ticks.length > 0 && actor.ticks[0] <= 30,
    JSON.stringify(actor.ticks.slice(0, 3)));

  // A steal in Fast gets the shorter steal window too.
  await submit(fast.all, wrongOption(fast.host.room));
  await waitFor(() => fast.host.room.activeQuestion?.isSteal === true, 'fast steal', 12000);
  r.check('Fast steal window is 12s', fast.host.room.activeQuestion.duration === 12,
    `${fast.host.room.activeQuestion.duration}`);
  teardown(fast.all);

  // =====================================================================
  // 4. Survival
  // =====================================================================
  r.section('4. Survival');

  // A 1v1 Survival match must be refused rather than started as a coin flip.
  const solo = await startMatch('survival', 1, 'S1');
  await sleep(1200);
  r.check('Survival refuses to start 1v1',
    solo.host.room.phase === 'lobby' &&
      solo.host.errors.some((e) => /at least 2 players per team/i.test(e)),
    `phase=${solo.host.room.phase} errors=${JSON.stringify(solo.host.errors)}`);
  teardown(solo.all);

  const surv = await startMatch('survival', 2, 'S2');
  await waitFor(() => surv.host.room.phase === 'category_pick', 'survival started', 14000);
  r.check('Survival starts with 2 per team', surv.host.room.phase === 'category_pick');
  await pickCategory(surv.all, 'general');

  const sTeam = surv.host.room.activeTeam;
  const rosterBefore = surv.host.room.teams[sTeam].players
    .filter((id) => !surv.host.room.players[id].isEliminated);
  r.check('Nobody starts eliminated', rosterBefore.length === 2, `${rosterBefore.length}`);

  // One member deliberately picks a wrong option and finalizes.
  const wrong = wrongOption(surv.host.room);
  const voter = surv.all.find((c) => myTeam(c) === sTeam);
  voter.s.emit('vote:cast', { optionKey: wrong });
  await sleep(RATE_GAP);
  voter.s.emit('vote:finalize', {});
  await waitFor(
    () => surv.host.room.teams[sTeam].players
      .some((id) => surv.host.room.players[id].isEliminated),
    'a player was eliminated', 15000,
  );

  const eliminated = surv.host.room.teams[sTeam].players
    .filter((id) => surv.host.room.players[id].isEliminated);
  r.check('A wrong answer eliminates exactly one player', eliminated.length === 1,
    JSON.stringify(eliminated));
  r.check('The player eliminated is the one who chose the wrong option',
    eliminated[0] === voter.playerId,
    `${eliminated[0]} vs ${voter.playerId}`);
  r.check('The match is still live after one elimination',
    surv.host.room.phase !== 'finished', `phase=${surv.host.room.phase}`);

  // An eliminated player must not be able to vote.
  await sleep(RATE_GAP);
  voter.errors.length = 0;
  voter.s.emit('vote:cast', { optionKey: 'A' });
  await sleep(800);
  r.check('An eliminated player cannot vote',
    voter.errors.some((e) => /eliminated/i.test(e)), JSON.stringify(voter.errors));

  // Captaincy must not be stranded on an eliminated player.
  const captain = surv.host.room.teams[sTeam].captain;
  r.check('Captaincy does not stay on an eliminated player',
    captain === null || surv.host.room.players[captain]?.isEliminated === false,
    `captain=${captain}`);
  teardown(surv.all);

  // =====================================================================
  // 5. Wager
  // =====================================================================
  r.section('5. Wager');

  const wager = await startMatch('wager', 1, 'W');
  await waitFor(() => wager.host.room.phase === 'category_pick', 'wager started', 12000);
  await pickCategory(wager.all, 'general');

  const wq = wager.host.room.activeQuestion;
  r.check('Wager mode opens with a pending stake', wq.wagerPending === true,
    `${wq.wagerPending}`);

  // ANTI-CHEAT: the question must be absent from the payload, not merely hidden
  // in the UI. This is the assertion the whole mode rests on.
  r.check('The question TEXT is withheld before the stake', wq.question.text === null,
    `${JSON.stringify(wq.question.text)}`);
  r.check('The OPTIONS are withheld before the stake', wq.question.options === null,
    `${JSON.stringify(wq.question.options)}`);
  r.check('The Turkish text is withheld too', wq.question.text_tr === null,
    `${JSON.stringify(wq.question.text_tr)}`);
  r.check('The answer key is withheld (as always)', wq.question.answer === undefined);
  r.check('No clock runs while the stake is outstanding',
    wq.timeLeft === wq.duration, `${wq.timeLeft}/${wq.duration}`);

  const wTeam = wager.host.room.activeTeam;
  const wActor = clientOnTeam(wager.all, wTeam);
  const wIdle = wager.all.find((c) => c !== wActor);

  // Voting before the stake must be refused.
  await sleep(RATE_GAP);
  wActor.errors.length = 0;
  wActor.s.emit('vote:cast', { optionKey: 'A' });
  await sleep(800);
  r.check('Voting before the stake is refused',
    wActor.errors.some((e) => /wager first/i.test(e)), JSON.stringify(wActor.errors));

  // Only the captain on turn may stake, and only an offered amount.
  await sleep(RATE_GAP);
  wIdle.errors.length = 0;
  wIdle.s.emit('wager:place', { amount: 5 });
  await sleep(800);
  r.check('The other team cannot place the stake',
    wIdle.errors.some((e) => /not your turn/i.test(e)), JSON.stringify(wIdle.errors));

  await sleep(RATE_GAP);
  wActor.errors.length = 0;
  wActor.s.emit('wager:place', { amount: 7 });
  await sleep(800);
  r.check('An off-menu stake is refused',
    wActor.errors.some((e) => /must be one of/i.test(e)), JSON.stringify(wActor.errors));
  r.check('The refused stake left the question hidden',
    wager.host.room.activeQuestion.wagerPending === true &&
      wager.host.room.activeQuestion.question.text === null);

  // A valid stake reveals the question and starts the clock.
  await sleep(RATE_GAP);
  wActor.s.emit('wager:place', { amount: 10 });
  await waitFor(
    () => wager.host.room.activeQuestion?.wagerPending === false,
    'stake accepted',
  );
  const revealed = wager.host.room.activeQuestion;
  r.check('The stake is recorded', revealed.wager === 10, `${revealed.wager}`);
  r.check('The question text appears once the stake is in',
    typeof revealed.question.text === 'string' && revealed.question.text.length > 0,
    `${revealed.question.text}`);
  r.check('The options appear once the stake is in',
    revealed.question.options !== null &&
      Object.keys(revealed.question.options).length === 5);
  r.check('The answer key is STILL withheld after the reveal',
    revealed.question.answer === undefined);

  await sleep(RATE_GAP);
  wActor.errors.length = 0;
  wActor.s.emit('wager:place', { amount: 3 });
  await sleep(800);
  r.check('The stake cannot be changed once placed',
    wActor.errors.some((e) => /already set/i.test(e)), JSON.stringify(wActor.errors));

  // A wrong answer must cost the stake, floored at zero.
  const scoreBeforeWrong = wager.host.room.teams[wTeam].score;
  r.check('Score is 0 before the first wrong wager', scoreBeforeWrong === 0,
    `${scoreBeforeWrong}`);
  await submit(wager.all, wrongOption(wager.host.room));
  await waitFor(
    () => wager.host.room.activeQuestion?.wager !== 10 ||
      wager.host.room.activeTeam !== wTeam ||
      wager.host.room.phase !== 'question',
    'wrong wager resolved', 18000,
  );
  r.check('A lost wager is floored at 0, never negative',
    wager.host.room.teams[wTeam].score === 0,
    `${wager.host.room.teams[wTeam].score}`);

  teardown(wager.all);
}

main()
  .then(() => process.exit(r.finish()))
  .catch((err) => {
    console.error(`
[ERROR] ${err.message}`);
    r.check(`Test run completed without throwing (${err.message})`, false);
    teardown(created);
    process.exit(r.finish() || 1);
  });
