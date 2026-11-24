'use strict';

/**
 * Open rooms test (PBI 30).
 *
 *   node tests/public_rooms_test.js
 *
 * Runs its own server with short timers: a 1.5 s auto-start, a 0.6 s category
 * pick window and a 0.4 s reveal, so a whole match flow fits in a few seconds.
 *
 *  - Quick Play opens an open room, and the next Quick Play lands in it.
 *  - Private rooms are never handed to strangers.
 *  - An open lobby with two players starts by itself.
 *  - Quick Play into a running open match seats the player from the NEXT
 *    question, never halfway through the current one.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');

const { createReporter, waitFor, sleep } = require('./helpers');

const r = createReporter('OPEN ROOMS — PBI 30');

const PORT = 3094;
const URL = `http://localhost:${PORT}`;
const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizzy-public-'));

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        SOCKET_PORT: String(PORT),
        QUIZZY_STORE_FILE: path.join(storeDir, 'rooms.json'),
        REDIS_URL: '',
        QUIZZY_PUBLIC_AUTOSTART_MS: '1500',
        QUIZZY_FFA_PICK_MS: '600',
        QUIZZY_FFA_REVEAL_MS: '400',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (b) => {
      out += b.toString();
      if (out.includes('Room persistence:')) resolve(proc);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (c) => reject(new Error(`server exited (${c}): ${out.slice(0, 400)}`)));
    setTimeout(() => reject(new Error(`server did not start: ${out.slice(0, 300)}`)), 15000);
  });
}

function stopServer(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode !== null) return resolve();
    proc.once('exit', () => resolve());
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (proc.exitCode === null) proc.kill('SIGKILL');
      resolve();
    }, 4000);
  });
}

function makeClient(name) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, s, playerId: null, room: null, created: false, errors: [] };
  s.on('room:created', (p) => { c.playerId = p.playerId; c.room = p.room; c.created = true; });
  s.on('room:joined', (p) => { c.playerId = p.playerId; c.room = p.room; });
  s.on('room:update', (room) => { c.room = room; });
  s.on('room:error', (e) => c.errors.push(e.message));
  s.on('game:error', (e) => c.errors.push(e.message));
  return c;
}

const quickPlay = (c) => c.s.emit('room:quickPlay', { playerName: c.name });

async function main() {
  const proc = await startServer();
  const clients = [];
  try {
    // -------------------------------------------------------------------------
    r.section('1. Quick Play finds or opens an open room');

    const a = makeClient('Ayla');
    clients.push(a);
    quickPlay(a);
    await waitFor(() => a.room, 'A room');
    r.check('First Quick Play opens a new room', a.created === true);
    r.check('…marked open, free-for-all', a.room.isPublic === true && a.room.mode === 'ffa');

    // A private free-for-all room must never be offered to strangers.
    const priv = makeClient('Private');
    clients.push(priv);
    priv.s.emit('room:create', { playerName: 'Private', mode: 'ffa' });
    await waitFor(() => priv.room, 'private room');

    const b = makeClient('Bora');
    clients.push(b);
    quickPlay(b);
    await waitFor(() => b.room, 'B room');
    r.check('Second Quick Play joins the open room', b.created === false && b.room.code === a.room.code);
    r.check('…not the private one', b.room.code !== priv.room.code);

    await waitFor(() => a.room.autoStartAt, 'autoStartAt on A');
    r.check('Two players arm the auto-start countdown', typeof a.room.autoStartAt === 'number');

    // -------------------------------------------------------------------------
    r.section('2. Auto-start');

    await waitFor(() => a.room.phase !== 'lobby', 'auto start', 6000);
    r.check('The open lobby starts without the host pressing Start', a.room.phase !== 'lobby');
    r.check('Both players are in the match roster',
      Boolean(a.room.ffa?.players[a.playerId] && a.room.ffa?.players[b.playerId]));

    // Let the pick window lapse so a question is on.
    await waitFor(() => a.room.phase === 'question', 'first question', 6000);
    const q1 = a.room.ffa.questionNumber;

    // -------------------------------------------------------------------------
    r.section('3. Late join from the next question');

    const c = makeClient('Cem');
    clients.push(c);
    quickPlay(c);
    await waitFor(() => c.room, 'C room');
    r.check('Quick Play during a match joins that open match', c.room.code === a.room.code && !c.created);
    r.check('…queued for the next question, not this one',
      !c.room.ffa.players[c.playerId] && (c.room.ffa.pending ?? []).includes(c.playerId));

    c.errors.length = 0;
    c.s.emit('vote:cast', { optionKey: 'A' });
    await waitFor(() => c.errors.length > 0, 'late vote refused');
    r.check('A late joiner cannot answer the current question', c.errors.length > 0);

    // Everyone in the roster answers, so the round closes and the next starts.
    a.s.emit('vote:cast', { optionKey: 'A' });
    b.s.emit('vote:cast', { optionKey: 'B' });
    await waitFor(() => a.room.ffa.questionNumber > q1 && a.room.phase === 'question', 'next question', 8000);
    r.check('From the next question the late joiner is playing', Boolean(a.room.ffa.players[c.playerId]));
    r.check('…starting from zero', a.room.ffa.players[c.playerId]?.score === 0);

    c.errors.length = 0;
    c.s.emit('vote:cast', { optionKey: 'C' });
    await sleep(400);
    r.check('…and can answer it', c.errors.length === 0, c.errors.join('; '));

    // -------------------------------------------------------------------------
    r.section('4. A lone open room does not auto-start');

    const solo = makeClient('Solo');
    clients.push(solo);
    // The running match above is still open for late joins, so close it first:
    // everyone leaves, and Quick Play must then open a fresh room.
    [a, b, c].forEach((x) => x.s.close());
    await sleep(300);
    quickPlay(solo);
    await waitFor(() => solo.room, 'solo room');
    r.check('With nobody connected elsewhere, Quick Play opens a fresh room', solo.created === true);
    await sleep(2000);
    r.check('One player alone is not auto-started', solo.room.phase === 'lobby' && !solo.room.autoStartAt);
  } finally {
    clients.forEach((x) => x.s.close());
    await stopServer(proc);
    fs.rmSync(storeDir, { recursive: true, force: true });
  }
  process.exit(r.finish());
}

main().catch((err) => {
  console.error(`\nTEST HATASI: ${err.message}`);
  process.exit(1);
});
