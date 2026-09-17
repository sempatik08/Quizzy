'use strict';

/**
 * Analytics test (PBI 16).
 *
 *   node tests/analytics_test.js
 *
 * Runs its own server on a spare port with the file backend, so the stored
 * counters can be read straight off disk and inspected — which is how the
 * privacy claim is actually verified rather than asserted.
 *
 * The load-bearing section is 4: it walks every byte of every analytics blob
 * looking for anything that could identify a player. "No personal data" is a
 * rule the code has to be held to, not a comment.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');

const { createReporter, sleep, waitFor } = require('./helpers');
const { QUESTIONS } = require('../server/questions');
const analytics = require('../server/analytics');
const store = require('../server/store');

const r = createReporter('ANALYTICS — PBI 16');

const PORT = 3097;
const URL = `http://localhost:${PORT}`;
const TOKEN = 'test-analytics-token-1234';
const RATE_GAP = 650;

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizzy-an-'));
const storeFile = path.join(storeDir, 'rooms.json');
const kvFile = `${storeFile}.kv`;

let child = null;

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
    const onData = (b) => {
      out += b.toString();
      if (out.includes('Analytics endpoint:')) resolve({ proc, out });
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (c) => {
      if (!out.includes('Analytics endpoint:')) {
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

async function httpGet(urlPath) {
  const res = await fetch(`${URL}${urlPath}`);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function makeClient(name) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, s, playerId: null, room: null, errors: [] };
  s.on('room:created', (p) => { c.playerId = p.playerId; c.room = p.room; });
  s.on('room:joined', (p) => { if (p.playerId) c.playerId = p.playerId; c.room = p.room; });
  s.on('room:update', (room) => { c.room = room; });
  s.on('game:error', (e) => c.errors.push(e.message));
  s.on('room:error', (e) => c.errors.push(e.message));
  return c;
}

const myTeam = (c) => c.room?.players?.[c.playerId]?.team ?? null;

function answerFor(room) {
  const pool = QUESTIONS[room.selectedCategory];
  return pool.find((q) => q.id === room.activeQuestion.question.id)?.answer ?? null;
}

function wrongFor(room) {
  const correct = answerFor(room);
  const disabled = room.activeQuestion.disabledOptions ?? [];
  return ['A', 'B', 'C', 'D', 'E'].find((o) => o !== correct && !disabled.includes(o));
}

async function main() {
  r.banner();

  // =====================================================================
  // 1. Counters, in isolation
  // =====================================================================
  r.section('1. Counters');

  await analytics.resetAnalytics();

  analytics.recordCategoryPick('general');
  analytics.recordCategoryPick('general');
  analytics.recordCategoryPick('math');
  analytics.recordQuestionServed('q_a', 'general');
  analytics.recordQuestionServed('q_b', 'general');
  analytics.recordQuestionServed('q_c', 'math');

  analytics.recordAnswer('q_a', { isCorrect: true, isSteal: false, answered: true });
  analytics.recordAnswer('q_b', { isCorrect: false, isSteal: false, answered: true });
  analytics.recordAnswer('q_c', { isCorrect: false, isSteal: false, answered: false });
  analytics.recordAnswer('q_b', { isCorrect: true, isSteal: true, answered: true });

  await analytics.flushAnalytics();

  const cats = await store.getJSON(analytics.KEY_CATEGORIES);
  r.check('Category picks are counted', cats.general.picks === 2 && cats.math.picks === 1,
    JSON.stringify(cats));
  r.check('Questions served are counted per category',
    cats.general.served === 2 && cats.math.served === 1, JSON.stringify(cats));

  const qs = await store.getJSON(analytics.KEY_QUESTIONS);
  r.check('A correct answer is counted as correct', qs.q_a.correct === 1 && qs.q_a.wrong === 0,
    JSON.stringify(qs.q_a));
  r.check('A wrong answer is counted as wrong', qs.q_b.wrong === 1 && qs.q_b.correct === 0,
    JSON.stringify(qs.q_b));
  // A timeout must not read as a wrong answer, or every abandoned room would
  // make its question look broken.
  r.check('A timeout is counted separately, NOT as a wrong answer',
    qs.q_c.timeout === 1 && qs.q_c.wrong === 0, JSON.stringify(qs.q_c));
  r.check('A steal is counted separately from a first-pass answer',
    qs.q_b.stolen === 1 && qs.q_b.stealWon === 1, JSON.stringify(qs.q_b));

  // Flushing twice must not double the totals.
  await analytics.flushAnalytics();
  const qs2 = await store.getJSON(analytics.KEY_QUESTIONS);
  r.check('An idle flush does not double-count', qs2.q_a.correct === 1,
    JSON.stringify(qs2.q_a));

  // A second batch must ADD to the stored totals, not replace them.
  analytics.recordAnswer('q_a', { isCorrect: true, isSteal: false, answered: true });
  await analytics.flushAnalytics();
  const qs3 = await store.getJSON(analytics.KEY_QUESTIONS);
  r.check('A later flush merges into the stored totals', qs3.q_a.correct === 2,
    JSON.stringify(qs3.q_a));

  analytics.recordMatchEnd({ mode: 'fast', createdAt: Date.now() - 120000, usedQuestionIds: ['a', 'b', 'c'] });
  analytics.recordMatchEnd({ mode: 'fast', createdAt: Date.now() - 60000, usedQuestionIds: ['a'] });
  await analytics.flushAnalytics();
  const matches = await store.getJSON(analytics.KEY_MATCHES);
  r.check('Matches are counted', matches.count === 2, JSON.stringify(matches));
  r.check('Match duration and question totals accumulate',
    matches.totalQuestions === 4 && matches.totalDurationMs > 150000,
    JSON.stringify(matches));
  r.check('Matches are also broken down by mode', matches.byMode.fast.count === 2,
    JSON.stringify(matches.byMode));

  // =====================================================================
  // 2. The report
  // =====================================================================
  r.section('2. Report');

  await analytics.resetAnalytics();

  // A question almost nobody gets right is the signal the cull list is for.
  const broken = QUESTIONS.general[0].id;
  const fine = QUESTIONS.general[1].id;
  for (let i = 0; i < 20; i++) {
    analytics.recordAnswer(broken, { isCorrect: false, isSteal: false, answered: true });
  }
  for (let i = 0; i < 20; i++) {
    analytics.recordAnswer(fine, { isCorrect: true, isSteal: false, answered: true });
  }
  // Too few attempts to judge — must NOT appear in either list.
  analytics.recordAnswer('gen_199', { isCorrect: false, isSteal: false, answered: true });

  const report = await analytics.buildReport(QUESTIONS);

  r.check('The failing question is flagged as suspect',
    report.suspectQuestions.some((q) => q.id === broken),
    JSON.stringify(report.suspectQuestions.map((q) => q.id)));
  r.check('A healthy question is not flagged',
    !report.suspectQuestions.some((q) => q.id === fine),
    JSON.stringify(report.suspectQuestions.map((q) => q.id)));
  r.check('A question with too few attempts is not flagged either',
    !report.suspectQuestions.some((q) => q.id === 'gen_199'),
    JSON.stringify(report.suspectQuestions.map((q) => q.id)));
  r.check('Signal threshold is reported so the numbers can be read',
    report.questions.minAttemptsForSignal === analytics.MIN_ATTEMPTS_FOR_SIGNAL,
    `${report.questions.minAttemptsForSignal}`);

  r.check('Observed difficulty maps a high pass rate to easy',
    analytics.observedDifficulty(0.9) === 1, `${analytics.observedDifficulty(0.9)}`);
  r.check('Observed difficulty maps a middling pass rate to medium',
    analytics.observedDifficulty(0.55) === 2, `${analytics.observedDifficulty(0.55)}`);
  r.check('Observed difficulty maps a low pass rate to hard',
    analytics.observedDifficulty(0.1) === 3, `${analytics.observedDifficulty(0.1)}`);

  const drift = report.difficultySuggestions.find((d) => d.id === broken || d.id === fine);
  r.check('Difficulty drift names the question, its label and the suggestion',
    drift === undefined || (drift.current && drift.suggested && drift.category),
    JSON.stringify(drift));
  r.check('Drift suggestions only cover questions with enough attempts',
    report.difficultySuggestions.every((d) => d.attempts >= analytics.MIN_ATTEMPTS_FOR_SIGNAL),
    JSON.stringify(report.difficultySuggestions.map((d) => d.attempts)));

  // =====================================================================
  // 3. The endpoint
  // =====================================================================
  r.section('3. Endpoint');

  const started = await startServer();
  child = started.proc;
  r.check('Server reports the endpoint as enabled',
    /Analytics endpoint: \/analytics/.test(started.out), started.out.slice(-200));

  const noToken = await httpGet('/analytics');
  r.check('No token is rejected', noToken.status === 401, `${noToken.status}`);

  const badToken = await httpGet('/analytics?token=wrong');
  r.check('A wrong token is rejected', badToken.status === 401, `${badToken.status}`);

  const nearMiss = await httpGet(`/analytics?token=${TOKEN.slice(0, -1)}x`);
  r.check('A near-miss token is rejected', nearMiss.status === 401, `${nearMiss.status}`);

  const ok = await httpGet(`/analytics?token=${TOKEN}`);
  r.check('The right token is accepted', ok.status === 200, `${ok.status}`);
  r.check('The report comes back as JSON with the expected sections',
    ok.body && Array.isArray(ok.body.categories) && ok.body.matches &&
      Array.isArray(ok.body.suspectQuestions) &&
      Array.isArray(ok.body.difficultySuggestions),
    JSON.stringify(ok.body).slice(0, 160));

  const health = await httpGet('/health');
  r.check('The health endpoint still works', health.status === 200, `${health.status}`);

  // =====================================================================
  // 4. No personal data — checked byte by byte
  // =====================================================================
  r.section('4. Privacy');

  const c1 = makeClient('AnalyticsP1');
  const c2 = makeClient('AnalyticsP2');

  c1.s.emit('room:create', { playerName: 'SecretName', mode: 'classic' });
  await waitFor(() => c1.room, 'room created');
  const code = c1.room.code;

  c2.s.emit('room:join', { roomCode: code, playerName: 'OtherSecret' });
  await waitFor(() => c2.playerId, 'joined');
  await sleep(RATE_GAP);
  c1.s.emit('team:join', { roomCode: code, team: 'blue' });
  await sleep(RATE_GAP);
  c2.s.emit('team:join', { roomCode: code, team: 'red' });
  await waitFor(() => myTeam(c1) === 'blue' && myTeam(c2) === 'red', 'teams');
  await sleep(RATE_GAP);
  c1.s.emit('teams:lock', { roomCode: code });
  await waitFor(() => c1.room.phase === 'category_pick', 'category_pick', 12000);
  const picker = [c1, c2].find(
    (c) => myTeam(c) === (c1.room.categoryPickTeam ?? c1.room.coinTossWinner),
  );
  await sleep(RATE_GAP);
  picker.s.emit('category:pick', { roomCode: code, category: 'geography' });
  await waitFor(() => c1.room.phase === 'question', 'question');

  // Play a couple of questions, one right and one wrong, then end the match.
  for (const correct of [true, false]) {
    const before = c1.room.activeQuestion.question.id;
    const actor = [c1, c2].find((c) => myTeam(c) === c1.room.activeTeam);
    actor.s.emit('vote:cast', {
      optionKey: correct ? answerFor(c1.room) : wrongFor(c1.room),
    });
    await sleep(RATE_GAP);
    actor.s.emit('vote:finalize', {});

    if (!correct) {
      // A miss hands the SAME question to the opponent as a steal, so the
      // question id will not change until that window closes. Pass it rather
      // than sitting out the full 20 seconds.
      await waitFor(() => c1.room.activeQuestion?.isSteal === true, 'steal opened', 12000);
      const stealer = [c1, c2].find((c) => myTeam(c) === c1.room.activeQuestion.stealTeam);
      await sleep(RATE_GAP);
      stealer.s.emit('steal:pass', {});
    }

    await waitFor(
      () => c1.room.activeQuestion?.question?.id !== before || c1.room.phase !== 'question',
      'resolved', 20000,
    );
    await sleep(300);
  }

  await sleep(RATE_GAP);
  c1.s.emit('surrender:initiate', {});
  await waitFor(() => c1.room.phase === 'finished', 'finished', 12000);

  c1.s.close();
  c2.s.close();
  await sleep(500);

  // Force the buffer to disk through the real code path: buildReport flushes
  // first, and the file backend's write is debounced by a few hundred ms.
  //
  // Deliberately NOT relying on the SIGTERM shutdown hook here. Node emulates
  // signals on Windows by terminating the child, so the handler does not
  // reliably run — the hook is still correct for Linux deploys, but a test that
  // depended on it would pass or fail by platform.
  const liveReport = await httpGet(`/analytics?token=${TOKEN}`);
  r.check('The endpoint reflects the match just played',
    liveReport.status === 200 && liveReport.body.matches.count >= 1,
    JSON.stringify(liveReport.body?.matches));
  await sleep(1200);

  await stopServer(child);
  child = null;

  r.check('The analytics store file was written', fs.existsSync(kvFile), kvFile);
  const kvRaw = fs.readFileSync(kvFile, 'utf8');
  const kv = JSON.parse(kvRaw);
  const analyticsKeys = Object.keys(kv).filter((k) => k.startsWith('quizzy:analytics'));
  r.check('Analytics blobs were written', analyticsKeys.length === 3,
    JSON.stringify(analyticsKeys));

  const analyticsBlob = JSON.stringify(
    Object.fromEntries(analyticsKeys.map((k) => [k, kv[k]])),
  );

  // Anything that could identify a player must be absent from the raw bytes.
  const forbidden = [
    ['a player name', 'SecretName'],
    ['the other player name', 'OtherSecret'],
    ['the room code', code],
    ['a player id', c1.playerId],
    ['a "playerId" field', 'playerId'],
    ['a "profileId" field', 'profileId'],
    ['a "socketId" field', 'socketId'],
    ['a "name" field', '"name"'],
    ['an "ip" field', '"ip"'],
  ];
  for (const [label, needle] of forbidden) {
    r.check(`Analytics data contains no ${label}`,
      needle ? !analyticsBlob.includes(needle) : true,
      needle ? `found "${needle}"` : '');
  }

  // And what it DOES contain is the aggregate data the PBI asked for.
  const storedCats = kv[analytics.KEY_CATEGORIES] ?? {};
  r.check('The played category was recorded',
    (storedCats.geography?.picks ?? 0) >= 1, JSON.stringify(storedCats));
  const storedMatches = kv[analytics.KEY_MATCHES] ?? {};
  r.check('The finished match was recorded', (storedMatches.count ?? 0) >= 1,
    JSON.stringify(storedMatches));
  const storedQs = kv[analytics.KEY_QUESTIONS] ?? {};
  const played = Object.entries(storedQs).filter(([, v]) => (v.served ?? 0) > 0);
  r.check('Questions served were recorded, keyed by question id',
    played.length >= 2 && played.every(([id]) => /^[a-z]+_\d+$/.test(id)),
    JSON.stringify(played.slice(0, 3)));
  r.check('At least one right and one wrong answer were recorded',
    Object.values(storedQs).some((v) => (v.correct ?? 0) > 0) &&
      Object.values(storedQs).some((v) => (v.wrong ?? 0) > 0),
    JSON.stringify(Object.values(storedQs).slice(0, 4)));

  // =====================================================================
  // 5. Disabled by default
  // =====================================================================
  r.section('5. Disabled without a token');

  const noTokenServer = await new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        SOCKET_PORT: String(PORT),
        QUIZZY_STORE_FILE: storeFile,
        ANALYTICS_TOKEN: '',
        REDIS_URL: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (b) => {
      out += b.toString();
      if (out.includes('Analytics endpoint:')) resolve({ proc, out });
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    setTimeout(() => reject(new Error('no-token server did not start')), 15000);
  });
  child = noTokenServer.proc;

  r.check('With no token the endpoint reports as disabled',
    /Analytics endpoint: disabled/.test(noTokenServer.out),
    noTokenServer.out.slice(-160));

  const hidden = await httpGet('/analytics');
  r.check('With no token the route 404s rather than serving data',
    hidden.status === 404, `${hidden.status}`);
  const hiddenWithGuess = await httpGet('/analytics?token=anything');
  r.check('A guessed token cannot enable a disabled endpoint',
    hiddenWithGuess.status === 404, `${hiddenWithGuess.status}`);
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
