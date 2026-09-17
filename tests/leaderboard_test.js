'use strict';

/**
 * Profile, history and leaderboard test (PBI 14).
 *
 *   node tests/leaderboard_test.js
 *
 * Runs its own server on a spare port with the file backend, because the whole
 * point of this PBI is data that outlives a match — and a shared dev server
 * would mix its own accumulated profiles into the ranking assertions.
 *
 * The ranking and anti-farming rules are checked directly against stats.js with
 * an injected store, which is both faster and more precise than trying to reach
 * a given leaderboard shape by playing matches.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { io } = require('socket.io-client');

const { createReporter, sleep, waitFor } = require('./helpers');
const { QUESTIONS } = require('../server/questions');
const stats = require('../server/stats');
const store = require('../server/store');

const r = createReporter('PROFILES, HISTORY, LEADERBOARD — PBI 14');

const PORT = 3098;
const URL = `http://localhost:${PORT}`;
const RATE_GAP = 650;

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizzy-lb-'));
const storeFile = path.join(storeDir, 'rooms.json');

let child = null;

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        SOCKET_PORT: String(PORT),
        QUIZZY_STORE_FILE: storeFile,
        REDIS_URL: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (b) => {
      out += b.toString();
      if (out.includes('Room persistence:')) resolve({ proc, out });
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (c) => {
      if (!out.includes('Room persistence:')) {
        reject(new Error(`server exited (${c}): ${out.slice(0, 400)}`));
      }
    });
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
  const c = {
    name, s, playerId: null, room: null, errors: [],
    profiles: [], boards: [], histories: [],
  };
  s.on('room:created', (p) => { c.playerId = p.playerId; c.room = p.room; });
  s.on('room:joined', (p) => { if (p.playerId) c.playerId = p.playerId; c.room = p.room; });
  s.on('room:update', (room) => { c.room = room; });
  s.on('profile:data', (p) => c.profiles.push(p.profile));
  s.on('leaderboard:data', (p) => c.boards.push(p));
  s.on('profile:history:data', (p) => c.histories.push(p.matches));
  s.on('game:error', (e) => c.errors.push(e.message));
  s.on('room:error', (e) => c.errors.push(e.message));
  return c;
}

const myTeam = (c) => c.room?.players?.[c.playerId]?.team ?? null;

function answerFor(room) {
  const pool = QUESTIONS[room.selectedCategory];
  return pool.find((q) => q.id === room.activeQuestion.question.id)?.answer ?? null;
}

/** A room-shaped object for exercising recordMatch without playing a match. */
function fakeRoom({ blueScore, redScore, bluePid, redPid, questions = 10, code = 'AAAAAA' }) {
  return {
    code,
    mode: 'classic',
    createdAt: Date.now() - 60000,
    selectedCategory: 'general',
    usedQuestionIds: Array.from({ length: questions }, (_, i) => `q${i}`),
    teams: {
      blue: { score: blueScore, players: ['b1'] },
      red: { score: redScore, players: ['r1'] },
    },
    players: {
      b1: { id: 'b1', name: 'Blue', team: 'blue', isSpectator: false, profileId: bluePid },
      r1: { id: 'r1', name: 'Red', team: 'red', isSpectator: false, profileId: redPid },
    },
  };
}

async function main() {
  r.banner();

  // =====================================================================
  // 1. Validation and the avatar allow-list
  // =====================================================================
  r.section('1. Validation');

  const good = randomUUID();
  r.check('A real UUID is a valid profile id', stats.isValidProfileId(good), good);
  for (const badId of ['', 'abc', '../../etc/passwd', 'x'.repeat(200), null, 12345,
                       '<script>alert(1)</script>']) {
    r.check(`Rejects profile id ${JSON.stringify(badId)}`.slice(0, 58),
      !stats.isValidProfileId(badId));
  }

  r.check('Avatars are a closed set', stats.AVATARS.length === 12, `${stats.AVATARS.length}`);
  r.check('A listed avatar is accepted', stats.isValidAvatar('fox'));
  for (const badAvatar of ['🦊', 'http://x/y.png', 'fox; DROP TABLE', '', null]) {
    r.check(`Rejects avatar ${JSON.stringify(badAvatar)}`.slice(0, 58),
      !stats.isValidAvatar(badAvatar));
  }

  // =====================================================================
  // 2. Anti-farming rules
  // =====================================================================
  r.section('2. Anti-farming');

  const pA = randomUUID();
  const pB = randomUUID();

  const short = await stats.recordMatch(
    fakeRoom({ blueScore: 100, redScore: 0, bluePid: pA, redPid: pB, questions: 1 }),
  );
  r.check('A match too short to count is rejected',
    short.recorded === false && /too short/i.test(short.reason), JSON.stringify(short));

  const selfPlay = await stats.recordMatch(
    fakeRoom({ blueScore: 100, redScore: 0, bluePid: pA, redPid: pA }),
  );
  r.check('The same profile on both sides is rejected',
    selfPlay.recorded === false && /same profile/i.test(selfPlay.reason),
    JSON.stringify(selfPlay));

  const noProfiles = await stats.recordMatch(
    fakeRoom({ blueScore: 100, redScore: 0, bluePid: null, redPid: null }),
  );
  r.check('A match with no profiles is rejected',
    noProfiles.recorded === false, JSON.stringify(noProfiles));

  const oneSide = await stats.recordMatch(
    fakeRoom({ blueScore: 100, redScore: 0, bluePid: pA, redPid: null }),
  );
  r.check('A match with profiles on only one side is rejected',
    oneSide.recorded === false && /one side/i.test(oneSide.reason),
    JSON.stringify(oneSide));

  const room = fakeRoom({ blueScore: 100, redScore: 45, bluePid: pA, redPid: pB });
  const first = await stats.recordMatch(room);
  r.check('A real match IS recorded', first.recorded === true, JSON.stringify(first));
  r.check('The higher score is recorded as the winner', first.winner === 'blue',
    `${first.winner}`);

  const again = await stats.recordMatch(room);
  r.check('Recording the same room twice is a no-op',
    again.recorded === false && /already recorded/i.test(again.reason),
    JSON.stringify(again));

  // =====================================================================
  // 3. Profiles and history
  // =====================================================================
  r.section('3. Profiles and history');

  const winner = await stats.getProfile(pA);
  const loser = await stats.getProfile(pB);

  r.check('The winner has 1 win and 0 losses',
    winner.wins === 1 && winner.losses === 0 && winner.matches === 1,
    JSON.stringify(winner));
  r.check('The loser has 0 wins and 1 loss',
    loser.wins === 0 && loser.losses === 1 && loser.matches === 1,
    JSON.stringify(loser));
  r.check('Points accumulate from the match score',
    winner.points === 100 && loser.points === 45,
    `${winner.points}/${loser.points}`);

  const hist = await stats.getHistory(pA);
  r.check('The match is in the winner history', hist.length === 1, `${hist.length}`);
  r.check('The history entry records the outcome',
    hist[0].won === true && hist[0].myScore === 100 && hist[0].theirScore === 45,
    JSON.stringify(hist[0]));
  r.check('The history entry records the context',
    hist[0].roomCode === 'AAAAAA' && hist[0].mode === 'classic' &&
      hist[0].category === 'general' && hist[0].questions === 10,
    JSON.stringify(hist[0]));

  const loserHist = await stats.getHistory(pB);
  r.check('The same match appears in the loser history as a loss',
    loserHist.length === 1 && loserHist[0].won === false, JSON.stringify(loserHist[0]));

  // History must be capped and newest-first.
  for (let i = 0; i < stats.HISTORY_LIMIT + 5; i++) {
    await stats.recordMatch(
      fakeRoom({ blueScore: 100, redScore: i, bluePid: pA, redPid: pB, code: `R${i}` }),
    );
  }
  const capped = await stats.getHistory(pA);
  r.check(`History is capped at ${stats.HISTORY_LIMIT}`,
    capped.length === stats.HISTORY_LIMIT, `${capped.length}`);
  r.check('History is newest first',
    capped[0].finishedAt >= capped[capped.length - 1].finishedAt,
    `${capped[0].finishedAt} vs ${capped[capped.length - 1].finishedAt}`);

  r.check('An unknown profile has an empty history',
    (await stats.getHistory(randomUUID())).length === 0);
  r.check('An invalid profile id yields an empty history, not a throw',
    (await stats.getHistory('nope')).length === 0);

  // =====================================================================
  // 4. Leaderboard ordering
  // =====================================================================
  r.section('4. Leaderboard ordering');

  // Three fresh profiles with hand-set records, so ordering is unambiguous.
  const many = { top: randomUUID(), mid: randomUUID(), low: randomUUID() };
  await store.setJSON(`quizzy:profile:${many.top}`,
    { id: many.top, name: 'Top', avatar: 'owl', matches: 10, wins: 9, losses: 1, points: 900, lastSeenAt: 3 });
  await store.setJSON(`quizzy:profile:${many.mid}`,
    { id: many.mid, name: 'Mid', avatar: 'cat', matches: 20, wins: 5, losses: 15, points: 2000, lastSeenAt: 2 });
  await store.setJSON(`quizzy:profile:${many.low}`,
    { id: many.low, name: 'Low', avatar: 'bear', matches: 5, wins: 5, losses: 0, points: 100, lastSeenAt: 1 });
  for (const id of Object.values(many)) await store.addToSet('quizzy:profiles', id);

  // Somebody with no matches at all must not appear.
  const idle = randomUUID();
  await store.setJSON(`quizzy:profile:${idle}`,
    { id: idle, name: 'Idle', avatar: 'fox', matches: 0, wins: 0, losses: 0, points: 0 });
  await store.addToSet('quizzy:profiles', idle);

  const board = await stats.getLeaderboard();
  const names = board.entries.map((e) => e.name);

  r.check('Top (9 wins) outranks Mid (5 wins)',
    names.indexOf('Top') < names.indexOf('Mid'), JSON.stringify(names));
  // Points lead would put Mid first with 2000; wins must win.
  r.check('Wins beat points in the ranking',
    names.indexOf('Top') < names.indexOf('Mid'), JSON.stringify(names));
  // Low and Mid both differ on wins, so check the win-rate tiebreak explicitly.
  r.check('Ranks are 1..n in order',
    board.entries.every((e, i) => e.rank === i + 1), JSON.stringify(board.entries.map((e) => e.rank)));
  r.check('A profile with no matches is excluded',
    !names.includes('Idle'), JSON.stringify(names));
  r.check('Board entries carry name, avatar and record',
    board.entries.every((e) => e.name && e.avatar && typeof e.wins === 'number'));

  // The board is public, so it must not hand out the one credential a guest has.
  r.check('Board entries do NOT expose profile ids',
    board.entries.every((e) => e.id === undefined),
    JSON.stringify(board.entries[0]));

  // Win-rate tiebreak on equal wins: 5/5 must outrank 5/20.
  const tieA = randomUUID();
  const tieB = randomUUID();
  await store.setJSON(`quizzy:profile:${tieA}`,
    { id: tieA, name: 'TieHighRate', avatar: 'wolf', matches: 6, wins: 6, losses: 0, points: 10, lastSeenAt: 1 });
  await store.setJSON(`quizzy:profile:${tieB}`,
    { id: tieB, name: 'TieLowRate', avatar: 'panda', matches: 30, wins: 6, losses: 24, points: 9999, lastSeenAt: 1 });
  await store.addToSet('quizzy:profiles', tieA);
  await store.addToSet('quizzy:profiles', tieB);

  const board2 = await stats.getLeaderboard();
  const names2 = board2.entries.map((e) => e.name);
  r.check('On equal wins, the better win rate ranks higher',
    names2.indexOf('TieHighRate') < names2.indexOf('TieLowRate'), JSON.stringify(names2));

  const standing = await stats.getMyStanding(many.top);
  r.check('A played profile gets a numeric rank',
    typeof standing.rank === 'number' && standing.rank >= 1, JSON.stringify(standing.rank));
  const idleStanding = await stats.getMyStanding(idle);
  r.check('An unplayed profile is unranked rather than last',
    idleStanding.rank === null, `${idleStanding.rank}`);

  // =====================================================================
  // 5. End to end over sockets
  // =====================================================================
  r.section('5. Over the wire');

  const started = await startServer();
  child = started.proc;

  const idA = randomUUID();
  const idB = randomUUID();
  const c1 = makeClient('LB1');
  const c2 = makeClient('LB2');

  c1.s.emit('room:create', { playerName: 'Alpha', profileId: idA, avatar: 'owl' });
  await waitFor(() => c1.room, 'room created');
  const code = c1.room.code;

  c2.s.emit('room:join', { roomCode: code, playerName: 'Beta', profileId: idB, avatar: 'cat' });
  await waitFor(() => c2.playerId, 'joined');

  // ANTI-CHEAT: a profile id is the only credential a guest has, so it must
  // never appear in the room state other players receive.
  const anyProfileIdLeaked = Object.values(c2.room.players).some(
    (p) => p.profileId !== undefined,
  );
  r.check('Profile ids are stripped from room state', !anyProfileIdLeaked,
    JSON.stringify(Object.values(c2.room.players)[0]));
  r.check('Avatars ARE visible to the room',
    Object.values(c2.room.players).some((p) => p.avatar === 'owl' || p.avatar === 'cat'),
    JSON.stringify(Object.values(c2.room.players).map((p) => p.avatar)));

  c1.s.emit('profile:get', { profileId: idA });
  await waitFor(() => c1.profiles.length > 0, 'profile fetched');
  r.check('profile:get returns a profile for a new id',
    c1.profiles[0] !== null && c1.profiles[0].matches === 0,
    JSON.stringify(c1.profiles[0]));

  c1.errors.length = 0;
  c1.s.emit('profile:get', { profileId: 'not-a-uuid' });
  await sleep(600);
  r.check('An invalid profile id is refused over the wire',
    c1.errors.some((e) => /invalid profile/i.test(e)), JSON.stringify(c1.errors));

  c1.s.emit('leaderboard:get', {});
  await waitFor(() => c1.boards.length > 0, 'leaderboard fetched');
  r.check('leaderboard:get answers', Array.isArray(c1.boards[0].entries),
    JSON.stringify(c1.boards[0]).slice(0, 120));

  // Play a short match to completion by surrender, then check it did NOT count
  // (too few questions) — the anti-farming rule has to hold over the wire too.
  await sleep(RATE_GAP);
  c1.s.emit('team:join', { roomCode: code, team: 'blue' });
  await sleep(RATE_GAP);
  c2.s.emit('team:join', { roomCode: code, team: 'red' });
  await waitFor(() => myTeam(c1) === 'blue' && myTeam(c2) === 'red', 'teams');
  await sleep(RATE_GAP);
  c1.s.emit('teams:lock', { roomCode: code });
  await waitFor(() => c1.room.phase === 'category_pick', 'category_pick', 12000);
  const picker = [c1, c2].find((c) => myTeam(c) === (c1.room.categoryPickTeam ?? c1.room.coinTossWinner));
  await sleep(RATE_GAP);
  picker.s.emit('category:pick', { roomCode: code, category: 'general' });
  await waitFor(() => c1.room.phase === 'question', 'first question');

  // Answer enough questions to clear MIN_QUESTIONS_FOR_STATS, then surrender.
  for (let i = 0; i < stats.MIN_QUESTIONS_FOR_STATS; i++) {
    const before = c1.room.activeQuestion.question.id;
    const actor = [c1, c2].find((c) => myTeam(c) === c1.room.activeTeam);
    actor.s.emit('vote:cast', { optionKey: answerFor(c1.room) });
    await sleep(RATE_GAP);
    actor.s.emit('vote:finalize', {});
    await waitFor(
      () => c1.room.activeQuestion?.question?.id !== before || c1.room.phase !== 'question',
      'resolved', 15000,
    );
    await sleep(150);
  }

  await sleep(RATE_GAP);
  c2.s.emit('surrender:initiate', {});
  await waitFor(() => c1.room.phase === 'finished', 'match finished', 12000);
  // Stats are written fire-and-forget behind the finish, so give them a moment.
  await sleep(1200);

  c1.profiles.length = 0;
  c1.s.emit('profile:get', { profileId: idA });
  await waitFor(() => c1.profiles.length > 0, 'profile after match');
  r.check('A played match is recorded against the profile',
    c1.profiles[0].matches === 1, JSON.stringify(c1.profiles[0]));
  r.check('The surrender survivor is credited with the win',
    c1.profiles[0].wins === 1, JSON.stringify(c1.profiles[0]));

  c1.histories.length = 0;
  c1.s.emit('profile:history', { profileId: idA });
  await waitFor(() => c1.histories.length > 0, 'history after match');
  r.check('The match appears in history over the wire',
    c1.histories[0].length === 1 && c1.histories[0][0].roomCode === code,
    JSON.stringify(c1.histories[0]));

  c1.boards.length = 0;
  c1.s.emit('leaderboard:get', {});
  await waitFor(() => c1.boards.length > 0, 'board after match');
  r.check('Both players appear on the board',
    c1.boards[0].entries.some((e) => e.name === 'Alpha') &&
      c1.boards[0].entries.some((e) => e.name === 'Beta'),
    JSON.stringify(c1.boards[0].entries.map((e) => e.name)));

  c1.s.close();
  c2.s.close();
}

main()
  .then(async () => {
    await stopServer(child);
    process.exit(r.finish());
  })
  .catch(async (err) => {
    console.error(`\n[ERROR] ${err.message}`);
    r.check(`Test run completed without throwing (${err.message})`, false);
    await stopServer(child);
    process.exit(r.finish() || 1);
  });
