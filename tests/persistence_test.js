'use strict';

/**
 * Room persistence test (PBI 13).
 *
 *   node tests/persistence_test.js
 *
 * Starts its OWN server on a spare port with the file backend, plays part of a
 * match, kills the process, starts a fresh one against the same store, and
 * reconnects. That is the only way to actually prove the claim — asserting on a
 * serializer round-trip would pass just as happily if nothing were ever written.
 *
 * The file backend rather than Redis because there is no Redis in this
 * environment, and because the persistence path is identical up to the write:
 * same serializer, same restore, same timer re-arming.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');

const { createReporter, sleep, waitFor } = require('./helpers');
const { QUESTIONS } = require('../server/questions');
const storeModule = require('../server/store');

const r = createReporter('ROOM PERSISTENCE — PBI 13');

const PORT = 3099;
const URL = `http://localhost:${PORT}`;
const RATE_GAP = 650;

const storeFile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'quizzy-store-')),
  'rooms.json',
);

let child = null;

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      [path.join(__dirname, '..', 'server', 'server.js')],
      {
        env: {
          ...process.env,
          PORT: String(PORT),
          SOCKET_PORT: String(PORT),
          QUIZZY_STORE_FILE: storeFile,
          // Make sure a stray REDIS_URL in the environment cannot redirect the
          // test away from the backend it means to exercise.
          REDIS_URL: '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let out = '';
    const onData = (buf) => {
      out += buf.toString();
      // Wait for the LAST startup line, not the first: the backend and restore
      // lines print after "running on port" and the assertions read them.
      if (out.includes('Room persistence:')) resolve({ proc, out });
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (code) => {
      if (!out.includes('Room persistence:')) {
        reject(new Error(`server exited (${code}): ${out.slice(0, 400)}`));
      }
    });
    setTimeout(() => reject(new Error(`server did not start: ${out.slice(0, 400)}`)), 15000);
  });
}

/** SIGTERM so the shutdown hook gets a chance to flush. */
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
  // ticks matter here: room.activeQuestion.timeLeft only refreshes on a
  // room:update, so the live clock has to be read from the tick stream.
  const c = { name, s, playerId: null, room: null, errors: [], reveals: [], ticks: [] };
  s.on('timer_tick', (p) => c.ticks.push(p.timeLeft));
  s.on('room:created', (p) => { c.playerId = p.playerId; c.room = p.room; });
  s.on('room:joined', (p) => { if (p.playerId) c.playerId = p.playerId; c.room = p.room; });
  s.on('room:update', (room) => { c.room = room; });
  s.on('answer_reveal', (p) => c.reveals.push(p));
  s.on('game:error', (e) => c.errors.push(e.message));
  s.on('room:error', (e) => c.errors.push(e.message));
  return c;
}

const myTeam = (c) => c.room?.players?.[c.playerId]?.team ?? null;

function answerFor(room) {
  const pool = QUESTIONS[room.selectedCategory];
  return pool.find((q) => q.id === room.activeQuestion.question.id)?.answer ?? null;
}

async function main() {
  r.banner();

  // =====================================================================
  // 1. Backend selection and serializer
  // =====================================================================
  r.section('1. Backend selection');

  r.check('Default (no env) is memory — old behaviour preserved',
    storeModule.getBackend() === 'memory', storeModule.getBackend());

  const fakeRoom = {
    code: 'ABC123',
    phase: 'question',
    teams: { blue: { score: 35, players: [] }, red: { score: 10, players: [] } },
    players: { p1: { id: 'p1', isConnected: true } },
    usedQuestionIds: ['gen_01', 'gen_02'],
    surrenderVote: { team: 'blue', votes: {}, timeoutHandle: setTimeout(() => {}, 60000) },
    activeQuestion: {
      question: { id: 'gen_03', text: 'q', answer: 'C' },
      duration: 60,
      timeLeft: 12,
      timerStart: Date.now() - 48000,
      resolving: true,
      timerHandle: setTimeout(() => {}, 60000),
      tickHandle: setInterval(() => {}, 60000),
    },
  };
  const json = storeModule.serializeRoom(fakeRoom);
  clearTimeout(fakeRoom.activeQuestion.timerHandle);
  clearInterval(fakeRoom.activeQuestion.tickHandle);
  clearTimeout(fakeRoom.surrenderVote.timeoutHandle);

  r.check('Serializer drops timer handles',
    !json.includes('timerHandle') && !json.includes('tickHandle') &&
      !json.includes('timeoutHandle'), json.slice(0, 200));
  // Unlike sanitizeRoom, storage must KEEP the answer or a restored question is
  // unresolvable.
  r.check('Serializer KEEPS the answer key (this is storage, not a payload)',
    json.includes('"answer":"C"'));

  const back = storeModule.deserializeRoom(json);
  r.check('Round-trip preserves scores',
    back.teams.blue.score === 35 && back.teams.red.score === 10,
    `${back.teams.blue.score}/${back.teams.red.score}`);
  r.check('Round-trip preserves the used-question pool',
    JSON.stringify(back.usedQuestionIds) === JSON.stringify(['gen_01', 'gen_02']));
  r.check('Restore clears the double-resolve guard',
    back.activeQuestion.resolving === false);
  r.check('Restore restarts the clock instead of resolving instantly',
    back.activeQuestion.timeLeft === 60 &&
      Date.now() - back.activeQuestion.timerStart < 2000,
    `timeLeft=${back.activeQuestion.timeLeft}`);
  r.check('Restore drops a stale surrender vote', back.surrenderVote === null);
  r.check('Restore marks everyone disconnected until they come back',
    back.players.p1.isConnected === false);
  r.check('A corrupt snapshot returns null rather than throwing',
    storeModule.deserializeRoom('{not json') === null &&
      storeModule.deserializeRoom('{"no":"code"}') === null);

  // =====================================================================
  // 2. Play part of a match on a real server
  // =====================================================================
  r.section('2. Before the restart');

  const first = await startServer();
  child = first.proc;
  r.check('Server reports the file backend',
    /Room persistence: file/.test(first.out), first.out.slice(-160));

  const p1 = makeClient('Keep1');
  const p2 = makeClient('Keep2');

  p1.s.emit('room:create', { playerName: 'Keep1' });
  await waitFor(() => p1.room, 'room created');
  const code = p1.room.code;

  p2.s.emit('room:join', { roomCode: code, playerName: 'Keep2' });
  await waitFor(() => p2.playerId, 'p2 joined');

  await sleep(RATE_GAP);
  p1.s.emit('team:join', { roomCode: code, team: 'blue' });
  await sleep(RATE_GAP);
  p2.s.emit('team:join', { roomCode: code, team: 'red' });
  await waitFor(() => myTeam(p1) === 'blue' && myTeam(p2) === 'red', 'teams assigned');

  await sleep(RATE_GAP);
  p1.s.emit('teams:lock', { roomCode: code });
  await waitFor(() => p1.room.phase === 'category_pick', 'category_pick', 12000);

  const pickTeam = p1.room.categoryPickTeam ?? p1.room.coinTossWinner;
  const picker = [p1, p2].find((c) => myTeam(c) === pickTeam);
  await sleep(RATE_GAP);
  picker.s.emit('category:pick', { roomCode: code, category: 'history' });
  await waitFor(() => p1.room.phase === 'question' && p1.room.activeQuestion, 'first question');

  // Score a couple of questions so there is real progress to lose.
  for (let i = 0; i < 3; i++) {
    const before = p1.room.activeQuestion.question.id;
    const actor = [p1, p2].find((c) => myTeam(c) === p1.room.activeTeam);
    actor.s.emit('vote:cast', { optionKey: answerFor(p1.room) });
    await sleep(RATE_GAP);
    actor.s.emit('vote:finalize', {});
    await waitFor(
      () => p1.room.activeQuestion?.question?.id !== before || p1.room.phase !== 'question',
      'question resolved', 15000,
    );
    await sleep(200);
  }

  // Spend a joker so a non-default piece of state has to survive too.
  const jokerActor = [p1, p2].find((c) => myTeam(c) === p1.room.activeTeam);
  await sleep(RATE_GAP);
  jokerActor.s.emit('joker:use', { type: 'fifty_fifty' });
  await waitFor(
    () => p1.room.activeQuestion.disabledOptions.length === 2,
    '50/50 applied',
  );

  const snapshot = {
    code: p1.room.code,
    mode: p1.room.mode,
    phase: p1.room.phase,
    blue: p1.room.teams.blue.score,
    red: p1.room.teams.red.score,
    used: p1.room.usedQuestionIds.length,
    category: p1.room.selectedCategory,
    usedCategories: [...(p1.room.usedCategories ?? [])],
    counts: { ...p1.room.categoryAnswerCount },
    jokers: JSON.parse(JSON.stringify(p1.room.jokers)),
    steal: { ...p1.room.stealCharges },
    winThreshold: p1.room.winThreshold,
    blueCaptain: p1.room.teams.blue.captain,
    redCaptain: p1.room.teams.red.captain,
    p1Id: p1.playerId,
  };

  r.check('There is real progress to lose',
    snapshot.blue + snapshot.red > 0 && snapshot.used >= 3,
    JSON.stringify({ blue: snapshot.blue, red: snapshot.red, used: snapshot.used }));
  r.check('A joker was spent before the restart',
    snapshot.jokers.blue.fiftyFifty === false || snapshot.jokers.red.fiftyFifty === false,
    JSON.stringify(snapshot.jokers));

  // =====================================================================
  // 3. Kill the server and bring it back
  // =====================================================================
  r.section('3. Across the restart');

  // Deliberately do NOT close the client sockets first. Killing the server is
  // what a redeploy looks like: the clients' sockets die WITH it and no
  // disconnect handler ever runs. Closing them cleanly first would instead
  // exercise the all-players-left path, which is a different scenario.
  await sleep(700);
  await stopServer(child);
  child = null;
  p1.s.close();
  p2.s.close();

  r.check('The store file exists after shutdown', fs.existsSync(storeFile), storeFile);
  const onDisk = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  r.check('The room is in the store file', Boolean(onDisk[code]),
    JSON.stringify(Object.keys(onDisk)));

  const second = await startServer();
  child = second.proc;
  r.check('The new process reports restoring rooms',
    /Restored \d+ room/.test(second.out), second.out.slice(-240));

  // Reconnect with the SAME playerId, exactly as the browser does after a
  // refresh via sessionStorage.
  const back1 = makeClient('Keep1Again');
  back1.s.emit('room:reconnect', { roomCode: code, playerId: snapshot.p1Id });
  await waitFor(() => back1.room, 'reconnected after restart', 8000);

  const after = back1.room;
  r.check('Reconnect succeeds after a restart', Boolean(after), 'no room');
  r.check('Room code survived', after.code === snapshot.code, `${after.code}`);
  r.check('Phase survived', after.phase === snapshot.phase,
    `${after.phase} vs ${snapshot.phase}`);
  r.check('Scores survived',
    after.teams.blue.score === snapshot.blue && after.teams.red.score === snapshot.red,
    `${after.teams.blue.score}/${after.teams.red.score} vs ${snapshot.blue}/${snapshot.red}`);
  r.check('The question pool survived', after.usedQuestionIds.length === snapshot.used,
    `${after.usedQuestionIds.length} vs ${snapshot.used}`);
  r.check('The selected category survived', after.selectedCategory === snapshot.category,
    `${after.selectedCategory}`);
  r.check('Category history survived',
    JSON.stringify(after.usedCategories) === JSON.stringify(snapshot.usedCategories),
    JSON.stringify(after.usedCategories));
  r.check('The per-category counter survived',
    JSON.stringify(after.categoryAnswerCount) === JSON.stringify(snapshot.counts),
    JSON.stringify(after.categoryAnswerCount));
  r.check('Spent jokers stayed spent',
    JSON.stringify(after.jokers) === JSON.stringify(snapshot.jokers),
    JSON.stringify(after.jokers));
  r.check('Steal charges survived',
    JSON.stringify(after.stealCharges) === JSON.stringify(snapshot.steal),
    JSON.stringify(after.stealCharges));
  r.check('The game mode survived', after.mode === snapshot.mode, `${after.mode}`);
  r.check('The win threshold survived', after.winThreshold === snapshot.winThreshold,
    `${after.winThreshold}`);
  r.check('Captains survived',
    after.teams.blue.captain === snapshot.blueCaptain &&
      after.teams.red.captain === snapshot.redCaptain);
  r.check('The reconnecting player is marked connected again',
    after.players[snapshot.p1Id]?.isConnected === true);

  // The restored question must still have a live clock, or the match hangs.
  r.check('A question is still on the table', Boolean(after.activeQuestion),
    `${after.activeQuestion}`);
  const t0 = after.activeQuestion.timeLeft;
  back1.ticks.length = 0;
  await sleep(3200);
  const ticks = [...back1.ticks];
  r.check('The restored question timer is running', ticks.length >= 2,
    `got ${ticks.length}: ${JSON.stringify(ticks)}`);
  r.check('The restored clock counts down',
    ticks.length >= 2 && ticks[ticks.length - 1] < ticks[0], JSON.stringify(ticks));
  r.check('The restored clock was restarted, not resumed at zero',
    t0 >= after.activeQuestion.duration - 3,
    `${t0}/${after.activeQuestion.duration}`);

  // The match must be playable, not merely readable.
  const back2 = makeClient('Keep2Again');
  back2.s.emit('room:join', { roomCode: code, playerName: 'Watcher', asSpectator: true });
  await waitFor(() => back2.playerId, 'spectator joined restored room', 8000);
  r.check('A restored room still accepts new spectators', back2.room?.code === code);

  r.check('The answer key is still hidden in the restored room',
    back1.room.activeQuestion.question.answer === undefined);

  back1.s.close();
  back2.s.close();

  // =====================================================================
  // 4. A cleaned-up room must not come back
  // =====================================================================
  r.section('4. Deleted rooms stay deleted');

  const throwaway = makeClient('Throwaway');
  throwaway.s.emit('room:create', { playerName: 'Throwaway' });
  await waitFor(() => throwaway.room, 'throwaway room created');
  const deadCode = throwaway.room.code;
  await sleep(RATE_GAP);
  // A broadcast is what persists a room, so nudge one before disconnecting.
  throwaway.s.emit('team:join', { roomCode: deadCode, team: 'blue' });
  await sleep(900);

  // Last player leaving triggers cleanupRoom, which must also delete the snapshot.
  throwaway.s.close();
  await sleep(1400);
  await stopServer(child);
  child = null;

  const finalDisk = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  r.check('An abandoned room is removed from the store',
    finalDisk[deadCode] === undefined,
    `${deadCode} present=${Boolean(finalDisk[deadCode])}`);
  r.check('The live room is still stored', Boolean(finalDisk[code]),
    JSON.stringify(Object.keys(finalDisk)));
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
