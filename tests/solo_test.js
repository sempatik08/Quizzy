'use strict';

/**
 * "Friend didn't come? Start alone" — PBI 24.
 *
 * Starts its own server (own port, own store, analytics on) and drives real
 * socket clients: a host alone in a classic lobby turns the room into a
 * free-for-all and starts; anyone else in the room, a non-host or a started
 * match blocks it; spectators don't count as company; an ffa room starts the
 * same way; and every solo start lands in the analytics funnel.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3096;
process.env.QUIZZY_SOCKET_URL = `http://localhost:${PORT}`;

const { createReporter, sleep, waitFor, makeClient, RATE_GAP } = require('./helpers');

const r = createReporter('START ALONE — PBI 24');

const TOKEN = 'test-solo-token-1234';
const storeFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quizzy-solo-')), 'rooms.json');

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

const lastError = (c) => c.errors[c.errors.length - 1] ?? '';

async function report() {
  const res = await fetch(`http://localhost:${PORT}/analytics?token=${TOKEN}`);
  return res.json();
}

async function run() {
  r.banner();
  const server = await startServer();
  const clients = [];
  const track = (c) => { clients.push(c); return c; };

  try {
    // -----------------------------------------------------------------------
    r.section('Alone in a classic lobby');
    const host = track(makeClient('Yalniz'));
    host.s.emit('room:create', { playerName: 'Yalniz' });
    await waitFor(() => host.room, 'room created');
    r.check('room starts in a team mode', host.room.mode === 'classic');

    host.s.emit('team:join', { team: 'blue' });
    await waitFor(() => host.room.teams.blue.players.length === 1, 'host on blue');

    await sleep(RATE_GAP);
    host.s.emit('room:goSolo');
    await waitFor(() => host.room.phase === 'category_pick', 'solo start');
    r.check('the room switches to free-for-all', host.room.mode === 'ffa');
    r.check('it carries the ffa match length', host.room.totalQuestions === 15);
    r.check('it goes straight to the category pick', host.room.phase === 'category_pick');
    r.check('the host is the only player on the roster',
      Object.keys(host.room.ffa.players).length === 1 && host.room.ffa.players[host.playerId]);
    r.check('the host picks the first category', host.room.ffa.picker === host.playerId);
    r.check('team seats are cleared',
      host.room.teams.blue.players.length === 0 && host.room.players[host.playerId].team === null);

    await sleep(RATE_GAP);
    host.s.emit('room:goSolo');
    await waitFor(() => host.errors.length > 0, 'second start refused');
    r.check('a started match cannot be started again', /already started/i.test(lastError(host)));

    // -----------------------------------------------------------------------
    r.section('Not alone');
    const h2 = track(makeClient('Ev'));
    const guest = track(makeClient('Misafir'));
    h2.s.emit('room:create', { playerName: 'Ev' });
    await waitFor(() => h2.room, 'room 2 created');
    guest.s.emit('room:join', { roomCode: h2.room.code, playerName: 'Misafir' });
    await waitFor(() => guest.playerId, 'guest joined');

    await sleep(RATE_GAP);
    guest.s.emit('room:goSolo');
    await waitFor(() => guest.errors.length > 0, 'guest refused');
    r.check('only the host can start alone', /host/i.test(lastError(guest)));

    await sleep(RATE_GAP);
    h2.s.emit('room:goSolo');
    await waitFor(() => h2.errors.length > 0, 'host with company refused');
    r.check('a host with another player in the room is refused', /other players/i.test(lastError(h2)));
    await sleep(300);
    r.check('the room stays in its team mode', h2.room.mode === 'classic' && h2.room.phase === 'lobby');

    // -----------------------------------------------------------------------
    r.section('Spectators are not company');
    const h3 = track(makeClient('Tek'));
    const watcher = track(makeClient('Izleyici'));
    h3.s.emit('room:create', { playerName: 'Tek' });
    await waitFor(() => h3.room, 'room 3 created');
    watcher.s.emit('room:join', { roomCode: h3.room.code, playerName: 'Izleyici', asSpectator: true });
    await waitFor(() => watcher.playerId, 'spectator joined');

    await sleep(RATE_GAP);
    h3.s.emit('room:goSolo');
    await waitFor(() => h3.room.phase === 'category_pick', 'solo start with a spectator');
    r.check('a spectator does not block starting alone', h3.room.mode === 'ffa');
    r.check('the spectator is not on the roster', !h3.room.ffa.players[watcher.playerId]);

    // -----------------------------------------------------------------------
    r.section('Already free-for-all');
    const h4 = track(makeClient('Hizli'));
    h4.s.emit('room:create', { playerName: 'Hizli', mode: 'ffa' });
    await waitFor(() => h4.room, 'ffa room created');
    await sleep(RATE_GAP);
    h4.s.emit('room:goSolo');
    await waitFor(() => h4.room.phase === 'category_pick', 'ffa solo start');
    r.check('an ffa room starts alone the same way', h4.room.mode === 'ffa');

    // -----------------------------------------------------------------------
    r.section('Analytics');
    const rep = await report();
    r.check('the funnel counts every solo start', rep.funnel?.soloStarts === 3,
      JSON.stringify(rep.funnel));
  } catch (err) {
    r.check(`unexpected error: ${err.message}`, false, clients.map((c) => `${c.name}: ${c.errors.join(' | ')}`).join(' || '));
  } finally {
    clients.forEach((c) => c.s.close());
    server.kill('SIGKILL');
  }

  process.exit(r.finish());
}

run();
