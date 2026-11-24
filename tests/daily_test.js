'use strict';

/**
 * Daily Quiz test (PBI 26).
 *
 *   node tests/daily_test.js
 *
 * Runs its own server on a spare port with a throwaway file store, so a
 * finished day can be checked straight off disk and the run never touches
 * a shared server's records.
 *
 * Acceptance from the plan:
 *  - two devices on the same day see the same questions,
 *  - the same profile is not scored twice,
 *  - plus what keeps the board honest: no answer leaves the server before the
 *    question is judged, and out-of-order or replayed answers are refused,
 *  - a deploy that grows the bank mid-day keeps the day's questions (pinned),
 *  - two answers to the same question at once count once (per-profile lock).
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');

const { createReporter, waitFor } = require('./helpers');
const daily = require('../server/daily');
const { QUESTIONS } = require('../server/questions');

const r = createReporter('DAILY QUIZ — PBI 26');

const PORT = 3096;
const URL = `http://localhost:${PORT}`;
const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizzy-daily-'));
const storeFile = path.join(storeDir, 'rooms.json');

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
      env: { ...process.env, PORT: String(PORT), SOCKET_PORT: String(PORT), QUIZZY_STORE_FILE: storeFile, REDIS_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (b) => {
      out += b.toString();
      if (out.includes('Analytics endpoint:')) resolve(proc);
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

/** A client that records the last payload of each daily event. */
function makeClient() {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { s, state: null, answered: [], errors: [], board: null };
  s.on('daily:state', (p) => { c.state = p; });
  s.on('daily:answered', (p) => { c.answered.push(p); });
  s.on('daily:error', (e) => { c.errors.push(e.message); });
  s.on('daily:board:data', (b) => { c.board = b; });
  return c;
}

const answerOf = (id) => Object.values(QUESTIONS).flat().find((q) => q.id === id).answer;

async function main() {
  // ---------------------------------------------------------------------------
  r.section('1. Selection is deterministic');

  const today = daily.dateFor();
  const a = daily.questionsFor(today).map((q) => q.id);
  delete require.cache[require.resolve('../server/daily')];
  const again = require('../server/daily').questionsFor(today).map((q) => q.id);
  r.check('Same date → same 10 questions, even after a fresh load', JSON.stringify(a) === JSON.stringify(again));
  r.check('10 questions', a.length === daily.QUESTION_COUNT, `got ${a.length}`);

  const cats = daily.questionsFor(today).map((q) => q.category);
  r.check('10 different categories', new Set(cats).size === daily.QUESTION_COUNT, cats.join(','));

  const diffs = daily.questionsFor(today).map((q) => q.difficulty ?? 2);
  r.check('Ordered easy → hard', diffs.every((d, i) => i === 0 || d >= diffs[i - 1]), diffs.join(','));

  const tomorrow = daily.questionsFor('2026-12-25').map((q) => q.id);
  r.check('A different date gives a different set', JSON.stringify(tomorrow) !== JSON.stringify(a));

  r.check('Day #1 is the epoch', daily.dayNumber(daily.DAILY_EPOCH) === 1);
  r.check('Day numbers count up', daily.dayNumber('2026-12-24') === 31, `got ${daily.dayNumber('2026-12-24')}`);
  // 2026-11-24 21:30 UTC is already 25 Nov 00:30 in Istanbul.
  r.check('The day turns over at midnight Türkiye time',
    daily.dateFor(Date.parse('2026-11-24T21:30:00Z')) === '2026-11-25');

  const pub = daily.publicQuestion(daily.questionsFor(today)[0]);
  r.check('Public question carries no answer or explanation', !('answer' in pub) && !('explanation' in pub));

  // ---------------------------------------------------------------------------
  r.section('2. A full run over the socket');

  const proc = await startServer();
  const clients = [];
  try {
    const profile = crypto.randomUUID();
    const p1 = makeClient();
    clients.push(p1);
    let status = null;
    p1.s.on('daily:status:data', (st) => { status = st; });
    p1.s.emit('daily:status', { profileId: profile });
    await waitFor(() => status, 'daily:status');
    r.check('Status before playing: not done, nothing answered', status.done === false && status.answered === 0);
    p1.s.emit('daily:start', { profileId: profile, name: 'Daily Tester', avatar: 'owl' });
    await waitFor(() => p1.state, 'daily:state');
    r.check('Start returns question 0', p1.state.done === false && p1.state.index === 0);
    r.check('The question carries no answer', !('answer' in p1.state.question));
    r.check('Start reports the day number', p1.state.day === daily.dayNumber(today));

    const device2 = makeClient();
    clients.push(device2);
    device2.s.emit('daily:start', { profileId: crypto.randomUUID(), name: 'Other Device', avatar: 'cat' });
    await waitFor(() => device2.state, 'second device state');
    r.check('A second device sees the same first question', device2.state.question.id === p1.state.question.id);

    // Out of order: answering question 3 while on question 0.
    p1.s.emit('daily:answer', { profileId: profile, index: 3, answer: 'A' });
    await waitFor(() => p1.errors.length > 0, 'out-of-order error');
    r.check('An out-of-order answer is refused', p1.errors[0] === 'Out of order.');

    // Play all ten: right on even indexes, wrong on odd ones.
    let current = p1.state;
    for (let i = 0; i < daily.QUESTION_COUNT; i++) {
      const right = answerOf(current.question.id);
      const choice = i % 2 === 0 ? right : ['A', 'B', 'C', 'D', 'E'].find((k) => k !== right);
      const before = p1.answered.length;
      p1.s.emit('daily:answer', { profileId: profile, index: i, answer: choice });
      await waitFor(() => p1.answered.length > before, `answer ${i}`);
      const res = p1.answered[p1.answered.length - 1];
      if (res.correct !== (i % 2 === 0)) r.check(`Answer ${i} judged correctly`, false);
      if (!res.done) {
        current = res.next;
        p1.s.emit('daily:shown', { profileId: profile, index: res.next.index });
      }
    }
    const last = p1.answered[p1.answered.length - 1];
    r.check('The tenth answer finishes the day', last.done === true);
    r.check('Score is 5/10', last.result.score === 5, `got ${last.result.score}`);
    r.check('Grid has 10 cells, alternating', last.result.grid.join(',') ===
      Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? 'correct' : 'wrong')).join(','));
    r.check('Review reveals answers only now', last.result.review.every((q) => typeof q.answer === 'string'));
    r.check('Finished player is on the board', last.result.board.entries.some((e) => e.me && e.name === 'Daily Tester'));
    r.check('Board entries carry no profile id', !JSON.stringify(last.result.board).includes(profile));

    // Replaying the last answer after finishing.
    p1.errors.length = 0;
    p1.s.emit('daily:answer', { profileId: profile, index: 9, answer: answerOf(current.question.id) });
    await waitFor(() => p1.errors.length > 0, 'replay error');
    r.check('Answering after the finish is refused', p1.errors[0] === 'Already finished today.');

    // ---------------------------------------------------------------------------
    r.section('3. Once a day');

    const p1b = makeClient();
    clients.push(p1b);
    p1b.s.emit('daily:start', { profileId: profile, name: 'Daily Tester', avatar: 'owl' });
    await waitFor(() => p1b.state, 'restart state');
    let status2 = null;
    p1b.s.on('daily:status:data', (st) => { status2 = st; });
    p1b.s.emit('daily:status', { profileId: profile });
    await waitFor(() => status2, 'status after finish');
    r.check('Status after finishing shows the result without starting anything', status2.done === true && status2.score === 5);
    r.check('Starting again returns the finished result', p1b.state.done === true);
    r.check('…with the same score', p1b.state.score === 5, `got ${p1b.state.score}`);
    r.check('…and is not added twice to the board', p1b.state.board.total === 1, `total ${p1b.state.board.total}`);

    // Resume mid-way: device 2 answers once, then "reloads".
    const profile2 = crypto.randomUUID();
    const d2 = makeClient();
    clients.push(d2);
    d2.s.emit('daily:start', { profileId: profile2, name: 'Reloader', avatar: 'cat' });
    await waitFor(() => d2.state, 'd2 state');
    d2.s.emit('daily:answer', { profileId: profile2, index: 0, answer: answerOf(d2.state.question.id) });
    await waitFor(() => d2.answered.length > 0, 'd2 answer');
    d2.state = null;
    d2.s.emit('daily:start', { profileId: profile2, name: 'Reloader', avatar: 'cat' });
    await waitFor(() => d2.state, 'd2 resume');
    r.check('Reloading resumes at the next question, not the first', d2.state.done === false && d2.state.index === 1);
    r.check('An unfinished player is not on the board', d2.state.done === false && !(p1b.state.board.entries.some((e) => e.name === 'Reloader')));

    d2.s.emit('daily:answer', { profileId: 'not-a-uuid', index: 1, answer: 'A' });
    await waitFor(() => d2.errors.length > 0, 'invalid profile error');
    r.check('An answer without a valid profile is refused', d2.errors[0] === 'Invalid answer.');
  } finally {
    clients.forEach((c) => c.s.close());
    await stopServer(proc);
    fs.rmSync(storeDir, { recursive: true, force: true });
  }

  // The rest runs in this process against the store's in-memory backend.
  await pinnedQuestions();
  await concurrentAnswers();

  process.exit(r.finish());
}

/**
 * A deploy that grows the bank mid-day must not change that day's questions:
 * half-played runs would be scored against questions their players never saw.
 */
async function pinnedQuestions() {
  r.section('4. A bigger bank mid-day keeps the same questions');

  const store = require('../server/store');
  const date = '2027-03-14';
  const before = (await daily.dayQuestions(date)).map((q) => q.id);
  const stored = await store.getJSON(`quizzy:daily:${date}:questions`);
  r.check("First use pins the day's ids in the store", JSON.stringify(stored) === JSON.stringify(before));

  // "Deploy" a bigger bank: 40 new questions in every category and tier, then
  // load the daily modules afresh as a restarted server would.
  for (const [category, list] of Object.entries(QUESTIONS)) {
    for (let i = 0; i < 40; i++) {
      list.push({
        id: `pin-test-${category}-${i}`, difficulty: (i % 3) + 1, answer: 'A',
        text: `Added ${i}?`, text_tr: `Eklenen ${i}?`,
        options: { A: 'a', B: 'b', C: 'c', D: 'd' }, options_tr: { A: 'a', B: 'b', C: 'c', D: 'd' },
      });
    }
  }
  delete require.cache[require.resolve('../server/daily')];
  delete require.cache[require.resolve('../server/dailyQuestions')];
  const fresh = require('../server/daily');

  const repicked = fresh.questionsFor(date).map((q) => q.id);
  r.check('The bigger bank alone would pick a different set (the test bites)',
    JSON.stringify(repicked) !== JSON.stringify(before));
  const after = (await fresh.dayQuestions(date)).map((q) => q.id);
  r.check('…but the day keeps the pinned ids', JSON.stringify(after) === JSON.stringify(before), after.join(','));

  // Pinned ids that left the bank: pick again rather than serve nothing.
  const gone = '2027-03-15';
  await store.setJSON(`quizzy:daily:${gone}:questions`, Array.from({ length: 10 }, (_, i) => `removed-${i}`));
  const healed = (await fresh.dayQuestions(gone)).map((q) => q.id);
  r.check('Ids no longer in the bank → a fresh, valid pick',
    healed.length === fresh.QUESTION_COUNT && healed.every((id) => !id.startsWith('removed-')));
  r.check('…which is pinned in their place',
    JSON.stringify(await store.getJSON(`quizzy:daily:${gone}:questions`)) === JSON.stringify(healed));
}

/**
 * Two answers to the same index at once (a double tap) must record one answer.
 * The memory backend hands out the same object to every reader, which hides
 * the race, so reads here return fresh copies a tick later — as Redis does.
 */
async function concurrentAnswers() {
  r.section('5. Two answers at once count once');

  const store = require('../server/store');
  const d = require('../server/daily'); // the fresh copy section 4 loaded
  const realGet = store.getJSON;
  store.getJSON = async (key) => {
    const v = await realGet(key);
    await new Promise((res) => setImmediate(res));
    return v === null ? null : structuredClone(v);
  };
  try {
    const profile = crypto.randomUUID();
    const first = await d.start(profile, 'Double Tap', 'owl');
    const right = answerOf(first.question.id);
    const [x, y] = await Promise.all([d.answer(profile, 0, right), d.answer(profile, 0, right)]);
    const ok = [x, y].filter((res) => !res.error);
    r.check('Exactly one of the two is accepted', ok.length === 1, JSON.stringify([x.error, y.error]));
    r.check('…the other is refused as out of order', [x, y].some((res) => res.error === 'Out of order.'));
    const rec = await realGet(`quizzy:daily:${d.dateFor()}:${profile}`);
    r.check('One answer recorded, so the next question is #1', rec.answers.length === 1, `answers ${rec.answers.length}`);

    const [s1, s2] = await Promise.all([d.start(profile, 'Double Tap', 'owl'), d.start(profile, 'Double Tap', 'owl')]);
    r.check('Two starts at once both resume at question #1', s1.index === 1 && s2.index === 1, `${s1.index}/${s2.index}`);
  } finally {
    store.getJSON = realGet;
  }
}

main().catch((err) => {
  console.error(`\nTEST HATASI: ${err.message}`);
  process.exit(1);
});
