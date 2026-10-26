'use strict';

/**
 * Hybrid matchmaking: live queue + ghost opponents — PBI 35.
 *
 * Starts its own server (own port, short queue wait, short reveal) with the
 * ghost pool seeded through the store's kv file, then drives real sockets:
 * the pure recording rules, an empty pool, a full match against a ghost
 * (script never leaves the server, the ghost answers at its recorded moment,
 * a round the ghost skipped closes as soon as the human answers, no rematch),
 * the finished run joining the pool, a live pair, cancelling, and the
 * analytics counters.
 */

const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3094;
process.env.QUIZZY_SOCKET_URL = `http://localhost:${PORT}`;

const { createReporter, sleep, waitFor, makeClient, answerFor, wrongOption, RATE_GAP } = require('./helpers');
const { QUESTIONS } = require('../server/questions');
const ghost = require('../server/ghost');

const r = createReporter('HYBRID MATCHMAKING — PBI 35');

const TOKEN = 'test-match-token-1234';
const WAIT_MS = 1500;
const GHOST_DELAY_MS = 700;
const storeFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quizzy-match-')), 'rooms.json');

const GHOST_OWNER = randomUUID();
/** Round 2 (index 1) is one the ghost left unanswered. */
const SKIPPED_ROUND = 1;
/** Fixed so the seed written to disk and the one the test checks against agree. */
const SEED_PLAYED_AT = Date.now() - 3 * 86_400_000;

/** A 15-question recording: 3 categories x 5, every answer right but one. */
function seedRecording() {
  const cats = ['general', 'history', 'geography'];
  const rounds = [];
  for (const category of cats) {
    for (const q of QUESTIONS[category].slice(0, 5)) {
      rounds.push({ questionId: q.id, category, option: q.answer, elapsedMs: GHOST_DELAY_MS });
    }
  }
  rounds[SKIPPED_ROUND] = { ...rounds[SKIPPED_ROUND], option: null, elapsedMs: null };
  return {
    id: 'seed-1',
    name: 'Kayitli',
    avatar: null,
    profileId: GHOST_OWNER,
    playedAt: SEED_PLAYED_AT,
    rounds,
  };
}

function startServer() {
  fs.writeFileSync(`${storeFile}.kv`, JSON.stringify({ [ghost.KEY_GHOSTS]: [seedRecording()] }));
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
        QUIZZY_FFA_REVEAL_MS: '250',
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

/** A test client that also records matchmaking events. */
function matchClient(name) {
  const c = makeClient(name);
  c.found = null;
  c.searching = null;
  c.cancelled = false;
  c.foundRaw = null;
  c.s.on('match:found', (p) => {
    c.found = p;
    c.foundRaw = JSON.stringify(p);
    c.playerId = p.playerId;
    c.room = p.room;
  });
  c.s.on('match:searching', (p) => { c.searching = p; });
  c.s.on('match:cancelled', () => { c.cancelled = true; });
  return c;
}

const qNum = (c) => c.room?.ffa?.questionNumber ?? 0;
const open = (c, n) => c.room?.phase === 'question' && qNum(c) === n && !c.room.activeQuestion?.revealed;

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
    r.section('Recording rules (pure)');
    const fakeRoom = {
      players: {
        a: { name: 'Ayse', profileId: 'pa' },
        b: { name: 'Bora', profileId: 'pb' },
        g: { name: 'Eski', isGhost: true },
      },
      ffa: {
        players: { a: {}, b: {}, g: {} },
        log: Array.from({ length: 12 }, (_, i) => ({
          questionId: `q${i}`,
          category: 'general',
          votes: {
            a: { optionKey: 'A', elapsedMs: 1000 + i },
            ...(i < 3 ? { b: { optionKey: 'B', elapsedMs: 2000 } } : {}),
            g: { optionKey: 'C', elapsedMs: 500 },
          },
        })),
      },
    };
    const recs = ghost.recordingsFrom(fakeRoom, 42);
    r.check('a full run becomes a recording', recs.length === 1 && recs[0].name === 'Ayse');
    r.check('a player who left early (3 answers) is not recorded', !recs.some((x) => x.name === 'Bora'));
    r.check('a ghost run is never re-recorded', !recs.some((x) => x.name === 'Eski'));
    r.check('choices and timings are kept per question',
      recs[0].rounds[5].option === 'A' && recs[0].rounds[5].elapsedMs === 1005 && recs[0].rounds.length === 12);
    r.check('the profile id is kept to avoid self-matches', recs[0].profileId === 'pa' && recs[0].playedAt === 42);

    // -----------------------------------------------------------------------
    r.section('Nobody live, only your own run in the pool');
    const owner = track(matchClient('Sahip'));
    owner.s.emit('match:find', { playerName: 'Sahip', profileId: GHOST_OWNER });
    await waitFor(() => owner.searching, 'searching');
    r.check('the client is told how long the live search lasts', owner.searching.waitMs === WAIT_MS);
    await waitFor(() => owner.found, 'found (none)', WAIT_MS + 5000);
    r.check('your own recording is never your opponent', owner.found.opponent.kind === 'none');
    r.check('you land in a free-for-all lobby you can start alone',
      owner.room.mode === 'ffa' && owner.room.phase === 'lobby' && owner.room.hostId === owner.playerId);

    // -----------------------------------------------------------------------
    r.section('Ghost match');
    const human = track(matchClient('Insan'));
    human.s.emit('match:find', { playerName: 'Insan', profileId: randomUUID() });
    await waitFor(() => human.found, 'found (ghost)', WAIT_MS + 5000);
    const seed = seedRecording();
    r.check('with nobody live the opponent is a ghost', human.found.opponent.kind === 'ghost');
    r.check('the ghost is named after the real player', human.found.opponent.name === 'Kayitli');
    r.check('it says when that run was played', human.found.opponent.playedAt === seed.playedAt);
    r.check('the match starts straight on the first question (no pick)', human.room.phase === 'question');
    r.check('the first question is the recording\'s',
      human.room.activeQuestion?.question?.id === seed.rounds[0].questionId);
    const ghostId = human.room.ghostMatch?.ghostId;
    r.check('the ghost is on the roster, flagged as a ghost',
      Boolean(ghostId) && human.room.players[ghostId]?.isGhost === true && Boolean(human.room.ffa.players[ghostId]));
    r.check('ANTI-CHEAT: the script never reaches the client',
      !('script' in (human.room.ghostMatch ?? {})) && !human.foundRaw.includes('elapsedMs'));
    r.check('ANTI-CHEAT: no profile id in the payload', !human.foundRaw.includes(GHOST_OWNER));

    // Round 1: the ghost answers at its recorded moment.
    await sleep(GHOST_DELAY_MS / 3);
    r.check('the ghost has not answered before its recorded time', !human.room.activeQuestion?.votes?.[ghostId]);
    await waitFor(() => human.room.activeQuestion?.votes?.[ghostId], 'ghost answered', 5000);
    r.check('the ghost answers at its recorded time', true);
    r.check('ANTI-CHEAT: the ghost\'s choice is hidden until the reveal',
      human.room.activeQuestion.votes[ghostId].optionKey === undefined);
    human.s.emit('vote:cast', { optionKey: answerFor(human.room) });
    await waitFor(() => human.room.ffa.lastRound?.questionNumber === 1, 'round 1 scored');
    const r1 = human.room.ffa.lastRound.results;
    r.check('both are scored by the live rules',
      r1[ghostId].isCorrect && r1[ghostId].points > 500 && r1[human.playerId].isCorrect);

    // Round 2: the ghost skipped it, so the human's answer closes the round.
    await waitFor(() => open(human, 2), 'round 2 open');
    await sleep(RATE_GAP);
    const t0 = Date.now();
    human.s.emit('vote:cast', { optionKey: wrongOption(human.room) });
    await waitFor(() => human.room.ffa.lastRound?.questionNumber === 2, 'round 2 scored', 4000);
    r.check('a round the ghost skipped closes when you answer', Date.now() - t0 < 3000);
    r.check('the skipped round scores the ghost nothing', human.room.ffa.lastRound.results[ghostId].optionKey === null);

    // Rounds 3–15, across two category changes nobody picks.
    let sawPick = false;
    for (let n = 3; n <= 15; n++) {
      await waitFor(() => open(human, n) || human.room.phase === 'category_pick', `round ${n} open`, 8000);
      if (human.room.phase === 'category_pick') sawPick = true;
      await waitFor(() => open(human, n), `round ${n} open`, 8000);
      r.check(`question ${n} is the recording's`,
        human.room.activeQuestion.question.id === seed.rounds[n - 1].questionId);
      await sleep(RATE_GAP);
      human.s.emit('vote:cast', { optionKey: answerFor(human.room) });
      await waitFor(() => human.room.ffa.lastRound?.questionNumber === n, `round ${n} scored`, 8000);
    }
    r.check('categories follow the recording without a pick screen', !sawPick);
    await waitFor(() => human.room.phase === 'finished', 'finished', 5000);
    r.check('the match ends with both on the standings', human.room.ffa.standings?.length === 2);

    await sleep(RATE_GAP);
    human.s.emit('rematch:request');
    await waitFor(() => human.errors.length > 0, 'rematch refused');
    r.check('no rematch against the same recording', /new opponent/i.test(human.errors.at(-1)));

    // The human's run is now someone else's ghost. Its owner is excluded, so
    // the original seed's owner now gets this one.
    await sleep(300);
    const next = track(matchClient('Sonraki'));
    next.s.emit('match:find', { playerName: 'Sonraki', profileId: GHOST_OWNER });
    await waitFor(() => next.found, 'found (new ghost)', WAIT_MS + 5000);
    r.check('a finished run joins the pool as a ghost',
      next.found.opponent.kind === 'ghost' && next.found.opponent.name === 'Insan');

    // -----------------------------------------------------------------------
    r.section('Live pair');
    const p1 = track(matchClient('Canli1'));
    const p2 = track(matchClient('Canli2'));
    p1.s.emit('match:find', { playerName: 'Canli1' });
    await waitFor(() => p1.searching, 'p1 searching');
    p2.s.emit('match:find', { playerName: 'Canli2' });
    await waitFor(() => p1.found && p2.found, 'live pair found');
    r.check('two waiting players are paired live',
      p1.found.opponent.kind === 'live' && p2.found.opponent.kind === 'live');
    r.check('each is told the other\'s name',
      p1.found.opponent.name === 'Canli2' && p2.found.opponent.name === 'Canli1');
    r.check('they share one free-for-all room', p1.found.roomCode === p2.found.roomCode && p1.room.mode === 'ffa');
    r.check('the first to arrive hosts and picks the first category',
      p1.room.hostId === p1.playerId && p1.room.phase === 'category_pick' && p1.room.ffa.picker === p1.playerId);
    r.check('no ghost in a live match', !p1.room.ghostMatch);

    // -----------------------------------------------------------------------
    r.section('Cancel');
    const quitter = track(matchClient('Vazgec'));
    quitter.s.emit('match:find', { playerName: 'Vazgec' });
    await waitFor(() => quitter.searching, 'quitter searching');
    quitter.s.emit('match:cancel');
    await waitFor(() => quitter.cancelled, 'cancelled');
    await sleep(WAIT_MS + 500);
    r.check('a cancelled search never produces a match', quitter.found === null);

    const bad = track(matchClient(''));
    bad.s.emit('match:find', { playerName: '' });
    await waitFor(() => bad.errors.length > 0, 'bad name refused');
    r.check('an empty name is refused', /name/i.test(bad.errors.at(-1)));

    // -----------------------------------------------------------------------
    r.section('Analytics');
    const rep = await report();
    const mm = rep.funnel?.matchmaking ?? {};
    r.check('outcomes are counted (live 1, ghost 2, none 1)',
      mm.live === 1 && mm.ghost === 2 && mm.none === 1, JSON.stringify(mm));
  } catch (err) {
    r.check(`unexpected error: ${err.message}`, false, clients.map((c) => `${c.name}: ${c.errors.join(' | ')}`).join(' || '));
  } finally {
    clients.forEach((c) => c.s.close());
    server.kill('SIGKILL');
  }

  process.exit(r.finish());
}

run();
