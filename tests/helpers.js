'use strict';

/**
 * Shared scaffolding for the socket-level integration tests.
 *
 * Every test under tests/*_test.js drives real socket.io clients against a
 * running server, so they all need the same handful of primitives: an assertion
 * counter, a poll-until-true helper, a client wrapper that mirrors room state,
 * and the answer-key lookup that lets a test deliberately answer wrong.
 *
 * Extracted from steal_flow_test.js, which had all of this inline.
 */

const { io } = require('socket.io-client');
const { QUESTIONS } = require('../server/questions');

const URL = process.env.QUIZZY_SOCKET_URL || 'http://localhost:3001';
const OPTS = ['A', 'B', 'C', 'D', 'E'];

/** Rate limiter is 500 ms per player — stay clear of it between emits. */
const RATE_GAP = 650;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Creates an independent pass/fail tally so each test file reports its own. */
function createReporter(title) {
  let pass = 0;
  let fail = 0;
  const failures = [];

  return {
    banner() {
      console.log('='.repeat(62));
      console.log(`  ${title}`);
      console.log('='.repeat(62));
    },
    section(label) {
      console.log(`\n--- ${label} ---`);
    },
    check(label, cond, detail = '') {
      if (cond) {
        pass++;
        console.log(`  [PASS] ${label}`);
      } else {
        fail++;
        failures.push(label);
        console.log(`  [FAIL] ${label} ${detail}`);
      }
    },
    /** Prints the summary and returns the process exit code. */
    finish() {
      console.log(`\n${'='.repeat(62)}`);
      console.log(`  ${pass} passed / ${fail} failed`);
      if (failures.length) {
        console.log('  Failed:');
        failures.forEach((f) => console.log(`    - ${f}`));
      }
      console.log('='.repeat(62));
      return fail === 0 ? 0 : 1;
    },
    get counts() {
      return { pass, fail };
    },
  };
}

async function waitFor(fn, label, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return true;
    await sleep(60);
  }
  throw new Error(`TIMEOUT waiting for: ${label}`);
}

/**
 * A socket client that keeps the latest room snapshot and every event it saw.
 * Tests assert against `c.room` rather than re-requesting state.
 */
function makeClient(name) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = {
    name,
    s,
    playerId: null,
    room: null,
    reveals: [],
    errors: [],
    emojis: [],
    events: [],
  };
  s.on('room:created', (p) => { c.playerId = p.playerId; c.room = p.room; });
  s.on('room:joined', (p) => { if (p.playerId) c.playerId = p.playerId; c.room = p.room; });
  s.on('room:update', (r) => { c.room = r; });
  s.on('answer_reveal', (p) => { c.reveals.push(p); });
  s.on('emoji:reaction', (p) => { c.emojis.push(p); });
  s.on('game:error', (e) => { c.errors.push(e.message); });
  s.on('room:error', (e) => { c.errors.push(e.message); });
  return c;
}

const myTeam = (c) => c.room?.players?.[c.playerId]?.team ?? null;
const clientOnTeam = (clients, team) => clients.find((c) => myTeam(c) === team);

/** Reads the answer key straight from the question bank. */
function answerFor(room) {
  const aq = room.activeQuestion;
  if (!aq) return null;
  const pool = QUESTIONS[room.selectedCategory];
  return pool.find((q) => q.id === aq.question.id)?.answer ?? null;
}

function wrongOption(room) {
  const correct = answerFor(room);
  const disabled = room.activeQuestion?.disabledOptions ?? [];
  return OPTS.find((o) => o !== correct && !disabled.includes(o));
}

/** Submits `optionKey` as whichever client owns the current activeTeam. */
async function submit(clients, optionKey) {
  const actor = clientOnTeam(clients, clients[0].room.activeTeam);
  actor.s.emit('vote:cast', { optionKey });
  await sleep(RATE_GAP);
  actor.s.emit('vote:finalize', {});
  return actor;
}

const answerCorrect = (clients) => submit(clients, answerFor(clients[0].room));
const answerWrong = (clients) => submit(clients, wrongOption(clients[0].room));

/**
 * Stands up a room with one player per team, locks it and picks `category`.
 * Returns the clients plus the room code. Covers the boilerplate every test
 * needs before it can exercise anything interesting.
 */
async function setupMatch({ category = 'general', names = ['P1', 'P2'], createPayload = {} } = {}) {
  const p1 = makeClient(names[0]);
  const p2 = makeClient(names[1]);
  const clients = [p1, p2];

  p1.s.emit('room:create', { playerName: names[0], ...createPayload });
  await waitFor(() => p1.room, 'room created');
  const code = p1.room.code;

  p2.s.emit('room:join', { roomCode: code, playerName: names[1] });
  await waitFor(() => p2.room && p2.playerId, 'p2 joined');

  await sleep(RATE_GAP);
  p1.s.emit('team:join', { roomCode: code, team: 'blue' });
  await sleep(RATE_GAP);
  p2.s.emit('team:join', { roomCode: code, team: 'red' });
  await waitFor(() => myTeam(p1) === 'blue' && myTeam(p2) === 'red', 'teams assigned');

  await sleep(RATE_GAP);
  p1.s.emit('teams:lock', { roomCode: code });
  await waitFor(() => p1.room.phase === 'category_pick', 'category_pick phase', 12000);

  if (category) {
    await pickCategory(clients, category);
  }

  return { p1, p2, clients, code };
}

/** Has the currently-designated picking captain select `category`. */
async function pickCategory(clients, category) {
  const room = clients[0].room;
  const pickTeam = room.categoryPickTeam ?? room.coinTossWinner;
  const picker = clientOnTeam(clients, pickTeam);
  await sleep(RATE_GAP);
  picker.s.emit('category:pick', { roomCode: room.code, category });
  await waitFor(
    () => clients[0].room.phase === 'question' && clients[0].room.activeQuestion,
    `question after picking ${category}`,
  );
  return picker;
}

function teardown(clients) {
  clients.forEach((c) => c.s.close());
}

module.exports = {
  URL,
  OPTS,
  RATE_GAP,
  sleep,
  createReporter,
  waitFor,
  makeClient,
  myTeam,
  clientOnTeam,
  answerFor,
  wrongOption,
  submit,
  answerCorrect,
  answerWrong,
  setupMatch,
  pickCategory,
  teardown,
};
