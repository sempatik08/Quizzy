'use strict';

/**
 * Public rooms — PBI 30.
 *
 * "Find an opponent" first looks for an open public free-for-all room and
 * drops the player straight in: a lobby if there is one, otherwise a match in
 * progress, where they play from the next question. Rooms made by matchmaking
 * (a live pair, or the empty lobby of someone who found nobody) are public;
 * rooms made by hand and ghost matches never are. A public lobby with two
 * players starts by itself.
 *
 * Starts its own server with an empty ghost pool, so a lone searcher always
 * lands in an empty public lobby.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3095;
process.env.QUIZZY_SOCKET_URL = `http://localhost:${PORT}`;

const { createReporter, sleep, waitFor, makeClient, answerFor, RATE_GAP } = require('./helpers');
const ffa = require('../server/ffa');

const r = createReporter('PUBLIC ROOMS — PBI 30');

const TOKEN = 'test-public-token-1234';
const WAIT_MS = 1200;
const START_MS = 1500;
const storeFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quizzy-public-')), 'rooms.json');

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        SOCKET_PORT: String(PORT),
        QUIZZY_STORE_FILE: storeFile,
        ANALYTICS_TOKEN: TOKEN,
        REDIS_URL: '',
        QUIZZY_MATCH_WAIT_MS: String(WAIT_MS),
        QUIZZY_PUBLIC_START_MS: String(START_MS),
        QUIZZY_FFA_REVEAL_MS: '300',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (buf) => {
      out += buf.toString();
      if (out.includes('Room persistence:')) resolve(proc);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (code) => {
      if (!out.includes('Room persistence:')) reject(new Error(`server exited (${code}): ${out.slice(0, 400)}`));
    });
    setTimeout(() => reject(new Error(`server did not start: ${out.slice(0, 400)}`)), 15000);
  });
}

function matchClient(name) {
  const c = makeClient(name);
  c.found = null;
  c.searching = null;
  c.s.on('match:found', (p) => {
    c.found = p;
    c.playerId = p.playerId;
    c.room = p.room;
  });
  c.s.on('match:searching', (p) => { c.searching = p; });
  return c;
}

/** Reset what a client saw from its last search, before searching again. */
function search(c) {
  c.found = null;
  c.searching = null;
  c.s.emit('match:find', { playerName: c.name });
}

async function report() {
  const res = await fetch(`http://localhost:${PORT}/analytics?token=${TOKEN}`);
  return res.json();
}

/** A minimal room object for the pure open-room rules. */
function fakeRoom(over = {}) {
  const players = {
    a: { id: 'a', isConnected: true, isSpectator: false },
    b: { id: 'b', isConnected: true, isSpectator: false },
  };
  return {
    code: 'ABCDEF',
    mode: 'ffa',
    isPublic: true,
    phase: 'lobby',
    players,
    totalQuestions: 15,
    questionsPerCategory: 5,
    ffa: { questionNumber: 0, players: {} },
    createdAt: 1,
    ...over,
  };
}

async function run() {
  r.banner();

  // -------------------------------------------------------------------------
  r.section('Which rooms are open (pure)');
  r.check('a public free-for-all lobby is open', ffa.isOpenPublicRoom(fakeRoom()));
  r.check('a private room is not', !ffa.isOpenPublicRoom(fakeRoom({ isPublic: false })));
  r.check('a team-mode room is not', !ffa.isOpenPublicRoom(fakeRoom({ mode: 'classic' })));
  r.check('a ghost match is not', !ffa.isOpenPublicRoom(fakeRoom({ ghostMatch: { ghostId: 'g' } })));
  r.check('a finished match is not', !ffa.isOpenPublicRoom(fakeRoom({ phase: 'finished' })));
  r.check('a match in progress is',
    ffa.isOpenPublicRoom(fakeRoom({ phase: 'question', ffa: { questionNumber: 6, players: {} } })));
  r.check(`one with fewer than ${ffa.PUBLIC_MIN_QUESTIONS_LEFT} questions left is not`,
    !ffa.isOpenPublicRoom(fakeRoom({ phase: 'question', ffa: { questionNumber: 13, players: {} } })));
  const empty = fakeRoom();
  for (const p of Object.values(empty.players)) p.isConnected = false;
  r.check('a room nobody is connected to is not', !ffa.isOpenPublicRoom(empty));
  const full = fakeRoom({ players: {} });
  for (let i = 0; i < 30; i++) full.players[`p${i}`] = { id: `p${i}`, isConnected: true, isSpectator: false };
  r.check('a full room is not', !ffa.isOpenPublicRoom(full));

  const busy = fakeRoom({ code: 'BUSY01', phase: 'question', ffa: { questionNumber: 2, players: {} } });
  const lobby = fakeRoom({ code: 'LOBBY1', players: { a: { id: 'a', isConnected: true, isSpectator: false } } });
  r.check('a lobby is preferred to a match in progress', ffa.findOpenPublicRoom([busy, lobby]) === lobby);
  const small = fakeRoom({ code: 'SMALL1', phase: 'question', ffa: { questionNumber: 2, players: {} },
    players: { a: { id: 'a', isConnected: true, isSpectator: false } } });
  r.check('then the busier room', ffa.findOpenPublicRoom([small, busy]) === busy);
  r.check('nothing open → null', ffa.findOpenPublicRoom([fakeRoom({ isPublic: false })]) === null);

  const server = await startServer();
  const clients = [];
  const track = (c) => { clients.push(c); return c; };

  try {
    // -----------------------------------------------------------------------
    r.section('A room made by hand is never offered');
    const priv = track(matchClient('Ozel'));
    priv.s.emit('room:create', { playerName: 'Ozel', mode: 'ffa' });
    await waitFor(() => priv.room, 'private room');
    r.check('a created room is not public', !priv.room.isPublic);

    // -----------------------------------------------------------------------
    r.section('Nobody around: the empty lobby is public');
    const a = track(matchClient('Ayse'));
    search(a);
    await waitFor(() => a.found, 'a found', WAIT_MS + 4000);
    r.check('the lone searcher finds nobody (not the private room)',
      a.found.opponent.kind === 'none' && a.found.roomCode !== priv.room.code);
    r.check('their lobby is public', a.room.isPublic === true && a.room.phase === 'lobby');
    r.check('no countdown while alone', !a.room.publicStartAt);

    // -----------------------------------------------------------------------
    r.section('The next searcher joins that lobby at once');
    const b = track(matchClient('Bora'));
    const t0 = Date.now();
    search(b);
    await waitFor(() => b.found, 'b found', 3000);
    r.check('without queueing', b.searching === null && Date.now() - t0 < 1000);
    r.check('told it is a public room with one player, not started',
      b.found.opponent.kind === 'public' && b.found.opponent.players === 1 && b.found.opponent.inProgress === false);
    r.check('same room as the first player', b.found.roomCode === a.found.roomCode);
    await waitFor(() => a.room.publicStartAt, 'countdown on a', 2000);
    r.check('two players start the countdown', a.room.publicStartAt > Date.now());

    r.section('Leaving calls the countdown off');
    b.s.emit('room:leave');
    await waitFor(() => !a.room.publicStartAt, 'countdown cancelled', 2000);
    r.check('back under two players, no countdown', !a.room.publicStartAt && a.room.phase === 'lobby');
    await sleep(START_MS + 300);
    r.check('and the lobby did not start', a.room.phase === 'lobby');

    await sleep(RATE_GAP);
    search(b);
    await waitFor(() => b.found, 'b found again', 3000);
    r.check('after room:leave the same socket can search again', b.found.opponent.kind === 'public');

    r.section('Auto-start');
    await waitFor(() => a.room.phase === 'category_pick', 'auto-started', START_MS + 3000);
    r.check('the public lobby started by itself', a.room.phase === 'category_pick');
    r.check('both are on the roster',
      Boolean(a.room.ffa.players[a.playerId]) && Boolean(a.room.ffa.players[b.playerId]));
    r.check('the countdown is cleared', !a.room.publicStartAt);

    await sleep(RATE_GAP);
    const picker = a.room.ffa.picker === a.playerId ? a : b;
    picker.s.emit('category:pick', { category: 'general' });
    await waitFor(() => a.room.phase === 'question' && a.room.ffa.questionNumber === 1, 'question 1');

    // -----------------------------------------------------------------------
    r.section('Joining a match in progress');
    const d = track(matchClient('Deniz'));
    search(d);
    await waitFor(() => d.found, 'd found', 3000);
    r.check('a searcher joins the running match',
      d.found.roomCode === a.found.roomCode && d.found.opponent.kind === 'public' && d.found.opponent.inProgress === true);
    r.check('as a player, not a spectator', d.room.players[d.playerId]?.isSpectator === false);
    r.check('not on this question\'s roster yet', !d.room.ffa.players[d.playerId]);

    await sleep(RATE_GAP);
    d.s.emit('vote:cast', { optionKey: answerFor(d.room) });
    await waitFor(() => d.errors.length > 0, 'late vote refused');
    r.check('their answer to the current question is refused', /next question/i.test(d.errors.at(-1)));

    // Close round 1: the two players answer.
    const t1 = Date.now();
    a.s.emit('vote:cast', { optionKey: answerFor(a.room) });
    b.s.emit('vote:cast', { optionKey: answerFor(b.room) });
    await waitFor(() => a.room.ffa.lastRound?.questionNumber === 1, 'round 1 scored', 8000);
    r.check('the latecomer does not hold up the round', Date.now() - t1 < 3000);
    await waitFor(() => a.room.ffa.questionNumber === 2 && !a.room.activeQuestion?.revealed, 'question 2', 8000);
    r.check('from the next question they are on the roster at zero',
      a.room.ffa.players[d.playerId]?.score === 0);

    await sleep(RATE_GAP);
    d.s.emit('vote:cast', { optionKey: answerFor(d.room) });
    a.s.emit('vote:cast', { optionKey: answerFor(a.room) });
    b.s.emit('vote:cast', { optionKey: answerFor(b.room) });
    await waitFor(() => a.room.ffa.lastRound?.questionNumber === 2, 'round 2 scored', 8000);
    r.check('and are scored like everyone else',
      a.room.ffa.lastRound.results[d.playerId]?.isCorrect === true && a.room.ffa.lastRound.results[d.playerId].points > 500);

    // -----------------------------------------------------------------------
    r.section('A live pair is public');
    // Everyone leaves the running match so nothing else is open.
    for (const c of [a, b, d, priv]) c.s.emit('room:leave');
    await sleep(300);
    const p1 = track(matchClient('Canli1'));
    const p2 = track(matchClient('Canli2'));
    search(p1);
    await waitFor(() => p1.searching, 'p1 searching');
    search(p2);
    await waitFor(() => p1.found && p2.found, 'paired');
    r.check('the pair is live and their room is public',
      p1.found.opponent.kind === 'live' && p1.room.isPublic === true);
    const p3 = track(matchClient('Ucuncu'));
    search(p3);
    await waitFor(() => p3.found, 'p3 found', 3000);
    r.check('a third searcher joins them', p3.found.roomCode === p1.found.roomCode);

    // -----------------------------------------------------------------------
    r.section('Analytics');
    const rep = await report();
    const mm = rep.funnel?.matchmaking ?? {};
    r.check('public joins are counted (4), alongside none 1 and live 1',
      mm.public === 4 && mm.none === 1 && mm.live === 1, JSON.stringify(mm));
  } catch (err) {
    r.check(`unexpected error: ${err.message}`, false, clients.map((c) => `${c.name}: ${c.errors.join(' | ')}`).join(' || '));
  } finally {
    clients.forEach((c) => c.s.close());
    server.kill('SIGKILL');
  }

  process.exit(r.finish());
}

run();
