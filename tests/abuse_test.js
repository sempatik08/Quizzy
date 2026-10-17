'use strict';

/**
 * Abuse-limit test.
 *
 *   node tests/abuse_test.js
 *
 * Runs its own server on a spare port with deliberately tiny caps, so each limit
 * can be reached in a handful of calls without touching the shared dev server.
 * TRUST_PROXY=1 lets the test act as several different clients by sending its
 * own X-Forwarded-For header, the way the hosting proxy would.
 *
 * What it guards: before these limits one script could create rooms in a loop,
 * mint unlimited guest profiles, and hammer the leaderboard — see server/abuse.js.
 */

const { spawn } = require('child_process');
const path = require('path');
const { randomUUID } = require('crypto');
const { io } = require('socket.io-client');

const { createReporter, sleep, waitFor } = require('./helpers');
const { createLimiter, clientIp } = require('../server/abuse');

const PORT = 3097;
const URL = `http://localhost:${PORT}`;
const LIMITED = 'Too many requests. Please wait a moment and try again.';

const r = createReporter('ABUSE LIMITS');

// ---------------------------------------------------------------------------
// Server and client scaffolding
// ---------------------------------------------------------------------------

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        SOCKET_PORT: String(PORT),
        REDIS_URL: '',
        QUIZZY_STORE_FILE: '',
        TRUST_PROXY: '1',
        MAX_ROOMS: '4',
        MAX_PROFILES: '2',
        MAX_CONNECTIONS_PER_IP: '5',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (b) => {
      out += b.toString();
      if (out.includes('Abuse limits:')) resolve(proc);
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
    proc.kill('SIGKILL');
    setTimeout(resolve, 2000);
  });
}

/** A client that appears to come from `ip`, recording what the server sends. */
function client(ip) {
  const s = io(URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: { 'x-forwarded-for': ip },
  });
  const c = {
    s, ip, errors: [], created: [], joined: [], profiles: [], boards: [],
    connectError: null, disconnectReason: null, connected: false,
  };
  s.on('connect', () => { c.connected = true; });
  s.on('connect_error', (e) => { c.connectError = e.message; });
  s.on('disconnect', (reason) => { c.disconnectReason = reason; });
  s.on('room:error', (e) => c.errors.push(e.message));
  s.on('game:error', (e) => c.errors.push(e.message));
  s.on('room:created', (p) => c.created.push(p.roomCode));
  s.on('room:joined', (p) => c.joined.push(p));
  s.on('profile:data', (p) => c.profiles.push(p.profile));
  s.on('leaderboard:data', (b) => c.boards.push(b));
  return c;
}

async function connected(c) {
  await waitFor(() => c.connected || c.connectError, `connect ${c.ip}`, 5000);
  return c;
}

const close = (...cs) => cs.forEach((c) => c.s.close());

// ---------------------------------------------------------------------------

async function main() {
  r.banner();

  // =====================================================================
  // 1. Token bucket and IP resolution (pure)
  // =====================================================================
  r.section('1. Limiter and client IP');

  const lim = createLimiter({ capacity: 3, refillPerSec: 1 });
  const t0 = 1_000_000;
  const burst = [lim.take('k', t0), lim.take('k', t0), lim.take('k', t0), lim.take('k', t0)];
  r.check('A bucket allows its burst and then refuses', burst.join() === 'true,true,true,false',
    burst.join());
  r.check('Tokens refill over time', lim.take('k', t0 + 1100) === true);
  r.check('Keys are independent', lim.take('other', t0) === true);
  lim.sweep(t0 + 60_000);
  r.check('Idle full buckets are swept', lim.size() === 0, `size=${lim.size()}`);

  const fake = (xff, address = '10.0.0.1') => ({ handshake: { headers: { 'x-forwarded-for': xff }, address } });
  r.check('Behind a trusted proxy the LAST forwarded entry is used',
    clientIp(fake('6.6.6.6, 1.2.3.4'), true) === '1.2.3.4');
  r.check('Without a trusted proxy the header is ignored',
    clientIp(fake('1.2.3.4'), false) === '10.0.0.1');

  // =====================================================================
  // 2. room:create rate limit and detaching from the previous room
  // =====================================================================
  r.section('2. Room creation');

  const a = await connected(client('20.0.0.1'));
  for (let i = 0; i < 4; i++) {
    a.s.emit('room:create', { playerName: `A${i}` });
    await sleep(150);
  }
  await waitFor(() => a.created.length + a.errors.length >= 4, 'four create answers');
  r.check('Three quick room:create calls succeed', a.created.length === 3, `created=${a.created.length}`);
  r.check('The fourth is refused as too many requests', a.errors.includes(LIMITED),
    JSON.stringify(a.errors));

  // The socket created three rooms; only the last should still exist.
  const probe = await connected(client('20.0.0.2'));
  probe.s.emit('room:join', { roomCode: a.created[0], playerName: 'Probe' });
  await waitFor(() => probe.errors.length > 0 || probe.joined.length > 0, 'probe join');
  r.check('Creating a new room releases the previous lobby', probe.errors.includes('Room not found.'),
    JSON.stringify(probe.errors));

  // =====================================================================
  // 3. Global room cap (MAX_ROOMS=4)
  // =====================================================================
  r.section('3. Global room cap');

  // One room exists (a's last). Three more fill the cap; the next is refused.
  const makers = [];
  for (let i = 0; i < 4; i++) {
    const m = await connected(client(`30.0.0.${i + 1}`));
    makers.push(m);
    m.s.emit('room:create', { playerName: `M${i}` });
    await waitFor(() => m.created.length + m.errors.length > 0, `maker ${i}`);
  }
  r.check('Rooms are created up to the cap', makers.slice(0, 3).every((m) => m.created.length === 1),
    JSON.stringify(makers.map((m) => m.created.length)));
  r.check('Past the cap room:create is refused politely',
    makers[3].errors.some((e) => /busy/i.test(e)), JSON.stringify(makers[3].errors));
  close(a, probe, ...makers);
  await sleep(500);

  const after = await connected(client('30.0.0.9'));
  after.s.emit('room:create', { playerName: 'After' });
  await waitFor(() => after.created.length + after.errors.length > 0, 'create after close');
  r.check('Rooms free up when their players leave', after.created.length === 1,
    JSON.stringify(after.errors));
  close(after);

  // =====================================================================
  // 4. Connection cap per IP (MAX_CONNECTIONS_PER_IP=5)
  // =====================================================================
  r.section('4. Connections per IP');

  const same = [];
  for (let i = 0; i < 5; i++) same.push(await connected(client('40.0.0.1')));
  const sixth = await connected(client('40.0.0.1'));
  r.check('Five connections from one IP are accepted', same.every((c) => c.connected));
  r.check('The sixth is refused', !sixth.connected && /Too many connections/.test(sixth.connectError ?? ''),
    String(sixth.connectError));
  const spoof = await connected(client('99.99.99.99, 40.0.0.1'));
  r.check('A forged leading X-Forwarded-For entry does not dodge the cap',
    !spoof.connected, String(spoof.connectError));
  close(...same, sixth, spoof);
  await sleep(500);
  const again = await connected(client('40.0.0.1'));
  r.check('Closing connections frees the slots again', again.connected, String(again.connectError));
  close(again);

  // =====================================================================
  // 5. Profiles: global cap (MAX_PROFILES=2) and save rate limit
  // =====================================================================
  r.section('5. Profiles');

  const p = await connected(client('50.0.0.1'));
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (const id of ids) {
    p.s.emit('profile:save', { profileId: id, name: 'Guest' });
    await sleep(150);
  }
  await waitFor(() => p.profiles.length + p.errors.length >= 3, 'three saves');
  r.check('New profiles are stored up to the cap', p.profiles.length === 2, `saved=${p.profiles.length}`);
  r.check('Past the cap a new profile is refused, play still allowed',
    p.errors.some((e) => /temporarily unavailable/.test(e)), JSON.stringify(p.errors));

  p.s.emit('profile:save', { profileId: ids[0], name: 'Renamed' });
  await waitFor(() => p.profiles.length === 3 || p.errors.length > 1, 'existing save');
  r.check('An existing profile can still be updated at the cap', p.profiles[2]?.name === 'Renamed',
    JSON.stringify(p.profiles[2]));

  // Five tokens per socket: three spent above, plus one more each loop.
  p.errors.length = 0;
  for (let i = 0; i < 4; i++) {
    p.s.emit('profile:save', { profileId: ids[0], name: `Spam${i}` });
    await sleep(50);
  }
  await waitFor(() => p.errors.includes(LIMITED), 'save rate limit', 4000).catch(() => {});
  r.check('Rapid profile:save calls hit the rate limit', p.errors.includes(LIMITED), JSON.stringify(p.errors));
  close(p);

  // =====================================================================
  // 6. Leaderboard: rate limited, but answered from cache
  // =====================================================================
  r.section('6. Leaderboard');

  const b = await connected(client('60.0.0.1'));
  for (let i = 0; i < 8; i++) {
    b.s.emit('leaderboard:get', {});
    await sleep(40);
  }
  await waitFor(() => b.boards.length >= 8, 'eight boards', 4000).catch(() => {});
  r.check('Every leaderboard request is answered, extra ones from cache', b.boards.length === 8,
    `answered=${b.boards.length}`);
  r.check('No error is shown for a cached answer', b.errors.length === 0, JSON.stringify(b.errors));
  close(b);

  // =====================================================================
  // 7. Flood guard
  // =====================================================================
  r.section('7. Flood guard');

  const f = await connected(client('70.0.0.1'));
  for (let i = 0; i < 300; i++) f.s.emit('noop', i);
  await waitFor(() => f.disconnectReason !== null, 'flood disconnect', 5000).catch(() => {});
  r.check('A socket that floods events is disconnected by the server',
    f.disconnectReason === 'io server disconnect', String(f.disconnectReason));
  close(f);

  const calm = await connected(client('70.0.0.2'));
  calm.s.emit('leaderboard:get', {});
  await waitFor(() => calm.boards.length > 0, 'calm client');
  r.check('Other clients are unaffected', calm.boards.length === 1);
  close(calm);
}

let server = null;
startServer()
  .then((proc) => { server = proc; return main(); })
  .then(async () => { await stopServer(server); process.exit(r.finish()); })
  .catch(async (err) => {
    console.error(`\n[ERROR] ${err.message}`);
    r.check(`Test run completed without throwing (${err.message})`, false);
    await stopServer(server);
    process.exit(r.finish() || 1);
  });
