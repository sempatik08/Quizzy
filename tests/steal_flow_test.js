'use strict';

/**
 * Socket-level integration test for the steal mechanic.
 *
 *   node tests/steal_flow_test.js
 *
 * Requires the Socket.io server to be running (default http://localhost:3001,
 * override with QUIZZY_SOCKET_URL). Exits non-zero on failure so CI can gate on it.
 */

const { io } = require('socket.io-client');
const { QUESTIONS } = require('../server/questions');

const URL = process.env.QUIZZY_SOCKET_URL || 'http://localhost:3001';
const OPTS = ['A', 'B', 'C', 'D', 'E'];

let pass = 0;
let fail = 0;
const failures = [];

function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; failures.push(label); console.log(`  [FAIL] ${label} ${detail}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return true;
    await sleep(60);
  }
  throw new Error(`TIMEOUT waiting for: ${label}`);
}

function makeClient(name) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, s, playerId: null, room: null, reveals: [], errors: [] };
  s.on('room:created', (p) => { c.playerId = p.playerId; c.room = p.room; });
  s.on('room:joined',  (p) => { if (p.playerId) c.playerId = p.playerId; c.room = p.room; });
  s.on('room:update',  (r) => { c.room = r; });
  s.on('answer_reveal',(p) => c.reveals.push(p));
  s.on('game:error',   (e) => c.errors.push(e.message));
  s.on('room:error',   (e) => c.errors.push(e.message));
  return c;
}

const myTeam = (c) => c.room?.players?.[c.playerId]?.team ?? null;
const clientOnTeam = (clients, team) => clients.find((c) => myTeam(c) === team);

function answerFor(room) {
  const aq = room.activeQuestion;
  const pool = QUESTIONS[room.selectedCategory];
  return pool.find((q) => q.id === aq.question.id).answer;
}

/** Submit an answer for whichever client owns the current activeTeam. */
async function submit(clients, optionKey) {
  const actor = clientOnTeam(clients, clients[0].room.activeTeam);
  actor.s.emit('vote:cast', { optionKey });
  await sleep(650);
  actor.s.emit('vote:finalize', {});
}

function wrongOption(room) {
  const correct = answerFor(room);
  const disabled = room.activeQuestion.disabledOptions ?? [];
  return OPTS.find((o) => o !== correct && !disabled.includes(o));
}

async function main() {
  console.log('='.repeat(62));
  console.log('  STEAL MECHANIC — INTEGRATION TEST');
  console.log('='.repeat(62));

  const p1 = makeClient('P1');
  const p2 = makeClient('P2');
  const clients = [p1, p2];

  // ---- Setup: room, teams, lock, category ----
  p1.s.emit('room:create', { playerName: 'P1' });
  await waitFor(() => p1.room, 'room created');
  const code = p1.room.code;

  p2.s.emit('room:join', { roomCode: code, playerName: 'P2' });
  await waitFor(() => p2.room && p2.playerId, 'p2 joined');

  await sleep(600);
  p1.s.emit('team:join', { roomCode: code, team: 'blue' });
  await sleep(600);
  p2.s.emit('team:join', { roomCode: code, team: 'red' });
  await waitFor(() => myTeam(p1) === 'blue' && myTeam(p2) === 'red', 'teams assigned');

  console.log('\n--- Setup ---');
  check('Both teams start with 2 steal charges',
    p1.room.stealCharges?.blue === 2 && p1.room.stealCharges?.red === 2,
    JSON.stringify(p1.room.stealCharges));

  await sleep(600);
  p1.s.emit('teams:lock', { roomCode: code });
  await waitFor(() => p1.room.phase === 'category_pick', 'category_pick phase', 12000);

  const pickTeam = p1.room.categoryPickTeam ?? p1.room.coinTossWinner;
  const picker = clientOnTeam(clients, pickTeam);
  await sleep(600);
  picker.s.emit('category:pick', { roomCode: code, category: 'general' });
  await waitFor(() => p1.room.phase === 'question' && p1.room.activeQuestion, 'first question');

  check('Question window is 60s', p1.room.activeQuestion.duration === 60,
    `got ${p1.room.activeQuestion.duration}`);
  check('Question does not start as a steal', p1.room.activeQuestion.isSteal === false);

  // =====================================================================
  // 1. Wrong answer opens a steal for the opponent
  // =====================================================================
  console.log('\n--- 1. Wrong answer opens the steal window ---');
  let missTeam = p1.room.activeTeam;
  let stealTeam = missTeam === 'blue' ? 'red' : 'blue';
  let turnTeamBefore = p1.room.turnTeam;
  let badOption = wrongOption(p1.room);
  p1.reveals.length = 0;

  await submit(clients, badOption);
  await waitFor(() => p1.room.activeQuestion?.isSteal === true, 'steal window opens', 8000);

  const missReveal = p1.reveals[0];
  check('Miss reveal flags stealOpens', missReveal?.stealOpens === true);
  check('ANTI-CHEAT: correct answer withheld while steal is possible',
    missReveal?.correctAnswer === undefined, `got ${missReveal?.correctAnswer}`);
  check('Steal is assigned to the opposing team',
    p1.room.activeQuestion.stealTeam === stealTeam, `got ${p1.room.activeQuestion.stealTeam}`);
  check('activeTeam swapped to the stealing team',
    p1.room.activeTeam === stealTeam, `got ${p1.room.activeTeam}`);
  check('turnTeam did NOT move during the steal',
    p1.room.turnTeam === turnTeamBefore, `got ${p1.room.turnTeam}`);
  check('Missed option is disabled',
    p1.room.activeQuestion.disabledOptions.includes(badOption),
    JSON.stringify(p1.room.activeQuestion.disabledOptions));
  check('Steal window is 20s', p1.room.activeQuestion.duration === 20,
    `got ${p1.room.activeQuestion.duration}`);
  check('Charge not spent merely by opening the steal',
    p1.room.stealCharges[stealTeam] === 2, `got ${p1.room.stealCharges[stealTeam]}`);

  // =====================================================================
  // 2. Successful steal: +10 and one charge spent
  // =====================================================================
  console.log('\n--- 2. Successful steal ---');
  const scoreBefore = p1.room.teams[stealTeam].score;
  const rightOption = answerFor(p1.room);
  p1.reveals.length = 0;

  await submit(clients, rightOption);
  await waitFor(() => p1.room.activeQuestion?.isSteal === false, 'next fresh question', 9000);

  check('Successful steal awards +10',
    p1.room.teams[stealTeam].score === scoreBefore + 10,
    `${scoreBefore} -> ${p1.room.teams[stealTeam].score}`);
  check('Successful steal spends one charge',
    p1.room.stealCharges[stealTeam] === 1, `got ${p1.room.stealCharges[stealTeam]}`);
  check('Steal reveal is flagged isSteal', p1.reveals[0]?.isSteal === true);
  check('Steal reveal exposes the correct answer',
    p1.reveals[0]?.correctAnswer !== undefined);
  check('Turn passed to the team that stole',
    p1.room.turnTeam === stealTeam, `got ${p1.room.turnTeam}`);

  // =====================================================================
  // 3. Passing a steal costs nothing
  // =====================================================================
  console.log('\n--- 3. Passing a steal ---');
  missTeam = p1.room.activeTeam;
  stealTeam = missTeam === 'blue' ? 'red' : 'blue';
  const chargesBeforePass = p1.room.stealCharges[stealTeam];
  const scoreBeforePass = p1.room.teams[stealTeam].score;

  await submit(clients, wrongOption(p1.room));
  await waitFor(() => p1.room.activeQuestion?.isSteal === true, 'steal window (pass case)', 8000);

  const stealer = clientOnTeam(clients, stealTeam);
  p1.reveals.length = 0;
  await sleep(600);
  stealer.s.emit('steal:pass', { roomCode: code });
  await waitFor(() => p1.room.activeQuestion?.isSteal === false, 'question after pass', 9000);

  check('Passing spends NO charge',
    p1.room.stealCharges[stealTeam] === chargesBeforePass,
    `${chargesBeforePass} -> ${p1.room.stealCharges[stealTeam]}`);
  check('Passing awards no points',
    p1.room.teams[stealTeam].score === scoreBeforePass);
  check('Pass reveal has no selected option',
    p1.reveals[0]?.selectedOption === null, `got ${p1.reveals[0]?.selectedOption}`);
  check('Turn advances after a pass',
    p1.room.turnTeam === stealTeam, `got ${p1.room.turnTeam}`);

  // =====================================================================
  // 4. Failed steal burns the charge
  // =====================================================================
  console.log('\n--- 4. Failed steal burns a charge ---');
  missTeam = p1.room.activeTeam;
  stealTeam = missTeam === 'blue' ? 'red' : 'blue';
  const chargesBeforeFail = p1.room.stealCharges[stealTeam];
  const scoreBeforeFail = p1.room.teams[stealTeam].score;

  await submit(clients, wrongOption(p1.room));
  await waitFor(() => p1.room.activeQuestion?.isSteal === true, 'steal window (fail case)', 8000);

  await submit(clients, wrongOption(p1.room));
  await waitFor(() => p1.room.activeQuestion?.isSteal === false, 'question after failed steal', 9000);

  check('Failed steal spends a charge',
    p1.room.stealCharges[stealTeam] === chargesBeforeFail - 1,
    `${chargesBeforeFail} -> ${p1.room.stealCharges[stealTeam]}`);
  check('Failed steal awards no points',
    p1.room.teams[stealTeam].score === scoreBeforeFail);

  // =====================================================================
  // 5. With 0 charges left, no steal window opens
  // =====================================================================
  console.log('\n--- 5. Exhausted charges: no steal ---');
  // Drain the remaining charges of whichever team still has them
  let guard = 0;
  while ((p1.room.stealCharges.blue > 0 || p1.room.stealCharges.red > 0) && guard < 8) {
    guard++;
    const miss = p1.room.activeTeam;
    const opp = miss === 'blue' ? 'red' : 'blue';
    await submit(clients, wrongOption(p1.room));

    if (p1.room.stealCharges[opp] > 0) {
      await waitFor(() => p1.room.activeQuestion?.isSteal === true, `steal opens (drain ${guard})`, 8000);
      await submit(clients, wrongOption(p1.room)); // fail it to burn the charge
      await waitFor(() => p1.room.activeQuestion?.isSteal === false, `drained ${guard}`, 9000);
    } else {
      await sleep(3200);
    }
  }

  check('All charges drained',
    p1.room.stealCharges.blue === 0 && p1.room.stealCharges.red === 0,
    JSON.stringify(p1.room.stealCharges));

  const turnBeforeNoSteal = p1.room.turnTeam;
  p1.reveals.length = 0;
  await submit(clients, wrongOption(p1.room));
  await sleep(3200);

  check('No steal window opens when charges are exhausted',
    p1.room.activeQuestion?.isSteal === false, `got ${p1.room.activeQuestion?.isSteal}`);
  check('Reveal exposes the answer when no steal is possible',
    p1.reveals[0]?.correctAnswer !== undefined);
  check('Turn alternates normally with no charges',
    p1.room.turnTeam !== turnBeforeNoSteal,
    `${turnBeforeNoSteal} -> ${p1.room.turnTeam}`);

  // ---- Errors ----
  console.log('\n--- Server-side errors ---');
  const allErrors = [...p1.errors, ...p2.errors];
  check('No unexpected server errors', allErrors.length === 0, JSON.stringify(allErrors));

  p1.s.close();
  p2.s.close();

  console.log('\n' + '='.repeat(62));
  console.log(`  SONUC: ${pass} GECTI / ${fail} BASARISIZ`);
  if (failures.length) failures.forEach((f) => console.log(`    ! ${f}`));
  console.log('='.repeat(62));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nTEST HATASI:', e.message);
  process.exit(1);
});
