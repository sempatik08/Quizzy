'use strict';

/**
 * "Herkes Kendine" free-for-all mode — PBI 19.
 *
 * Starts its own server on a separate port with short reveal and pick windows,
 * so a full 15-question match runs in seconds instead of minutes, then drives
 * real socket clients through it: lobby, start, category picks (including the
 * last-place picker and the pick timeout), speed scoring, streak bonus, the
 * answer-privacy guarantee, a disconnected player, the final standings and a
 * rematch.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3097;
process.env.QUIZZY_SOCKET_URL = `http://localhost:${PORT}`;

const {
  createReporter, sleep, waitFor, makeClient, answerFor, wrongOption, RATE_GAP,
} = require('./helpers');
const ffaRules = require('../server/ffa');

const r = createReporter('FREE-FOR-ALL MODE — PBI 19');

const PICK_MS = 4000;
const storeFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quizzy-ffa-')), 'rooms.json');

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        SOCKET_PORT: String(PORT),
        QUIZZY_STORE_FILE: storeFile,
        REDIS_URL: '',
        QUIZZY_FFA_REVEAL_MS: '400',
        QUIZZY_FFA_PICK_MS: String(PICK_MS),
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

const lastError = (c) => c.errors[c.errors.length - 1];
const aq = (c) => c.room?.activeQuestion ?? null;
const qNum = (c) => c.room?.ffa?.questionNumber ?? 0;

/** Wait until the round numbered `n` is open for answers. */
async function waitForRound(c, n) {
  await waitFor(
    () => c.room?.phase === 'question' && qNum(c) === n && aq(c) && !aq(c).revealed,
    `round ${n} open`,
    8000,
  );
}

async function waitForReveal(c, n) {
  await waitFor(
    () => c.room?.ffa?.lastRound?.questionNumber === n,
    `round ${n} revealed`,
    8000,
  );
}

async function run() {
  r.banner();
  const server = await startServer();
  const clients = [];
  const track = (c) => { clients.push(c); return c; };

  try {
    // -----------------------------------------------------------------------
    r.section('Pure scoring rules');
    r.check('instant correct answer is worth 1000', ffaRules.pointsFor(1, 1) === 1000);
    r.check('last-second correct answer is worth 500', ffaRules.pointsFor(0, 1) === 500);
    r.check('half the window left is worth 750', ffaRules.pointsFor(0.5, 1) === 750);
    r.check('2nd in a row adds +100', ffaRules.pointsFor(1, 2) === 1100);
    r.check('streak bonus caps at +300', ffaRules.pointsFor(1, 9) === 1300);
    r.check('out-of-range fraction is clamped', ffaRules.pointsFor(3, 1) === 1000 && ffaRules.pointsFor(-1, 1) === 500);

    // -----------------------------------------------------------------------
    r.section('Lobby');
    const p1 = track(makeClient('Host'));
    const p2 = track(makeClient('Ayse'));
    const p3 = track(makeClient('Mert'));
    p1.s.emit('room:create', { playerName: 'Host', mode: 'ffa' });
    await waitFor(() => p1.room, 'room created');
    const code = p1.room.code;
    r.check('room is created in ffa mode', p1.room.mode === 'ffa');
    r.check('room carries the 15-question match length', p1.room.totalQuestions === 15);
    r.check('room carries 5 questions per category', p1.room.questionsPerCategory === 5);

    p2.s.emit('room:join', { roomCode: code, playerName: 'Ayse' });
    p3.s.emit('room:join', { roomCode: code, playerName: 'Mert' });
    await waitFor(() => p2.playerId && p3.playerId, 'p2/p3 joined');

    p2.s.emit('team:join', { team: 'blue' });
    await waitFor(() => p2.errors.length > 0, 'team join refused');
    r.check('team:join is refused in ffa', /no teams/i.test(lastError(p2)));

    await sleep(RATE_GAP);
    p2.s.emit('ffa:start');
    await waitFor(() => p2.errors.length > 1, 'non-host start refused');
    r.check('only the host can start', /host/i.test(lastError(p2)));

    p1.s.emit('teams:lock');
    await waitFor(() => p1.errors.length > 0, 'teams:lock refused');
    r.check('teams:lock is refused in ffa', /no teams/i.test(lastError(p1)));

    await sleep(RATE_GAP);
    p1.s.emit('ffa:start');
    await waitFor(() => p1.room.phase === 'category_pick', 'category pick');
    r.check('start goes straight to category pick (no coin toss)', p1.room.phase === 'category_pick');
    r.check('all three players are on the match roster', Object.keys(p1.room.ffa.players).length === 3);
    r.check('the host picks the first category', p1.room.ffa.picker === p1.playerId);
    r.check('a pick deadline is published', typeof p1.room.ffa.pickDeadline === 'number');

    const late = track(makeClient('Late'));
    late.s.emit('room:join', { roomCode: code, playerName: 'Late' });
    await waitFor(() => late.errors.length > 0, 'late join refused');
    r.check('a player cannot join after the start', /spectator/i.test(lastError(late)));

    const spec = track(makeClient('Watcher'));
    spec.s.emit('room:join', { roomCode: code, playerName: 'Watcher', asSpectator: true });
    await waitFor(() => spec.playerId, 'spectator joined');
    r.check('a spectator can join mid-match', spec.room.players[spec.playerId].isSpectator === true);

    await sleep(RATE_GAP);
    p2.s.emit('category:pick', { category: 'general' });
    await waitFor(() => p2.errors.length > 2, 'non-picker refused');
    r.check('a non-picker cannot choose the category', /another player/i.test(lastError(p2)));

    await sleep(RATE_GAP);
    p1.s.emit('category:pick', { category: 'general' });
    await waitForRound(p1, 1);
    r.check('picking opens question 1', qNum(p1) === 1 && p1.room.selectedCategory === 'general',
      `q=${qNum(p1)} cat=${p1.room.selectedCategory}`);

    // -----------------------------------------------------------------------
    r.section('Round 1 — speed scoring and answer privacy');
    const correct1 = answerFor(p1.room);
    const wrong1 = wrongOption(p1.room);

    r.check('the answer is not in the payload while the question is open',
      aq(p2).question.answer === undefined && !aq(p2).revealedAnswer);

    p1.s.emit('vote:cast', { optionKey: correct1 });
    await waitFor(() => aq(p2)?.votes?.[p1.playerId], 'p1 answer visible as answered');
    r.check('others see that p1 answered', Boolean(aq(p2).votes[p1.playerId]));
    r.check('others do NOT see which option p1 chose', aq(p2).votes[p1.playerId].optionKey === undefined);

    await sleep(RATE_GAP);
    p1.s.emit('vote:cast', { optionKey: wrong1 });
    await waitFor(() => p1.errors.some((e) => /already answered/i.test(e)), 'second answer refused');
    r.check('an answer cannot be changed', true);

    spec.s.emit('vote:cast', { optionKey: correct1 });
    await waitFor(() => spec.errors.length > 0, 'spectator vote refused');
    r.check('a spectator cannot answer', /spectator/i.test(lastError(spec)));

    p2.s.emit('surrender:initiate');
    await waitFor(() => p2.errors.some((e) => /no surrender/i.test(e)), 'surrender refused');
    r.check('there is no surrender in ffa', true);

    p2.s.emit('vote:cast', { optionKey: wrong1 });
    await sleep(1200); // p3 answers noticeably later than p1
    p3.s.emit('vote:cast', { optionKey: correct1 });
    await waitForReveal(p1, 1);

    const res1 = p1.room.ffa.lastRound.results;
    r.check('the reveal publishes the correct answer', p1.room.ffa.lastRound.correctAnswer === correct1);
    r.check('options are visible after the reveal', aq(p2).votes[p1.playerId].optionKey === correct1);
    r.check('p1 (fast, correct) scores between 500 and 1000',
      res1[p1.playerId].isCorrect && res1[p1.playerId].points > 500 && res1[p1.playerId].points <= 1000);
    r.check('p3 (slower, correct) scores less than p1',
      res1[p3.playerId].isCorrect && res1[p3.playerId].points < res1[p1.playerId].points);
    r.check('p2 (wrong) scores 0', res1[p2.playerId].points === 0 && !res1[p2.playerId].isCorrect);
    r.check('the round closed early once everyone answered', aq(p1).revealed === true);

    // -----------------------------------------------------------------------
    r.section('Rounds 2–5 — streak, then the last-place picker');
    for (let n = 2; n <= 5; n++) {
      await waitForRound(p1, n);
      await sleep(RATE_GAP);
      const right = answerFor(p1.room);
      const wrong = wrongOption(p1.room);
      p1.s.emit('vote:cast', { optionKey: right });
      p2.s.emit('vote:cast', { optionKey: wrong });
      p3.s.emit('vote:cast', { optionKey: n === 2 ? right : wrong });
      await waitForReveal(p1, n);
      if (n === 2) {
        const res2 = p1.room.ffa.lastRound.results;
        r.check('p1 is on a 2-answer streak', res2[p1.playerId].streak === 2);
        r.check('the streak bonus is applied (≥ 600 for a 2nd correct)', res2[p1.playerId].points >= 600);
        r.check('a wrong answer resets the streak', res2[p2.playerId].streak === 0);
      }
    }

    await waitFor(() => p1.room.phase === 'category_pick', 'second category pick');
    r.check('after 5 questions the category changes', p1.room.phase === 'category_pick');
    r.check('the last-place player (p2, 0 points) picks', p1.room.ffa.picker === p2.playerId);

    await sleep(RATE_GAP);
    const usedBefore = [...p1.room.usedCategories];
    p2.s.emit('category:pick', { category: usedBefore[0] });
    await waitFor(() => p2.errors.some((e) => /already been used/i.test(e)), 'used category refused');
    r.check('a used category cannot be picked again', true);

    // -----------------------------------------------------------------------
    r.section('Pick timeout');
    const deadline = p1.room.ffa.pickDeadline;
    await waitFor(() => p1.room.phase === 'question', 'auto pick', PICK_MS + 4000);
    r.check('an idle picker is replaced by a random category',
      p1.room.selectedCategory && !usedBefore.includes(p1.room.selectedCategory));
    r.check('the auto-pick waited for the pick deadline', Date.now() >= deadline - 100);

    // -----------------------------------------------------------------------
    r.section('A disconnected player');
    p3.s.close();
    await waitFor(() => p1.room.players[p3.playerId]?.isConnected === false, 'p3 disconnected');

    for (let n = 6; n <= 15; n++) {
      await waitForRound(p1, n);
      await sleep(RATE_GAP);
      if (p1.room.phase !== 'question') break;
      p1.s.emit('vote:cast', { optionKey: answerFor(p1.room) });
      p2.s.emit('vote:cast', { optionKey: n % 2 ? answerFor(p1.room) : wrongOption(p1.room) });
      await waitForReveal(p1, n);
      if (n === 6) {
        const res6 = p1.room.ffa.lastRound.results;
        r.check('the round closes without waiting on the disconnected player', true);
        r.check('the disconnected player scores 0 with no answer',
          res6[p3.playerId].points === 0 && res6[p3.playerId].optionKey === null);
      }
      if (n === 10) {
        // Category 3: the picker is again the connected last place.
        await waitFor(() => p1.room.phase === 'category_pick', 'third category pick');
        const picker = p1.room.ffa.picker;
        r.check('the disconnected player is never chosen to pick', picker !== p3.playerId);
        const pc = picker === p1.playerId ? p1 : p2;
        await sleep(RATE_GAP);
        const fresh = ['history', 'cinema', 'music', 'sports'].find((k) => !p1.room.usedCategories.includes(k));
        pc.s.emit('category:pick', { category: fresh });
      }
    }

    // -----------------------------------------------------------------------
    r.section('Finish');
    await waitFor(() => p1.room.phase === 'finished', 'match finished');
    const standings = p1.room.ffa.standings;
    r.check('the match ends after exactly 15 questions', p1.room.ffa.questionNumber === 15);
    r.check('standings list every player', standings.length === 3);
    r.check('standings are sorted by score',
      standings.every((row, i) => i === 0 || standings[i - 1].score >= row.score));
    r.check('p1 (always correct) wins', standings[0].playerId === p1.playerId && standings[0].rank === 1);
    r.check('standings match the scores',
      standings.every((row) => row.score === p1.room.ffa.players[row.playerId].score));
    r.check('no question is left on the table', p1.room.activeQuestion === null);
    r.check('15 distinct questions were used', new Set(p1.room.usedQuestionIds).size === 15);

    // -----------------------------------------------------------------------
    r.section('Rematch');
    spec.s.emit('rematch:request');
    await waitFor(() => spec.errors.some((e) => /spectator/i.test(e)), 'spectator rematch refused');
    r.check('a spectator cannot start a rematch', true);

    await sleep(RATE_GAP);
    p2.s.emit('rematch:request');
    await waitFor(() => p1.room.phase === 'category_pick', 'rematch pick');
    r.check('one player restarts the match', p1.room.phase === 'category_pick');
    r.check('scores are reset',
      Object.values(p1.room.ffa.players).every((s) => s.score === 0 && s.streak === 0));
    r.check('question count is reset', p1.room.ffa.questionNumber === 0);
    r.check('the connected host picks first again', p1.room.ffa.picker === p1.playerId);

    // -----------------------------------------------------------------------
    r.section('Room size');
    const hostB = track(makeClient('B0'));
    hostB.s.emit('room:create', { playerName: 'B0', mode: 'ffa' });
    await waitFor(() => hostB.room, 'room B created');
    const extra = [];
    for (let i = 1; i <= 7; i++) {
      const c = track(makeClient(`B${i}`));
      extra.push(c);
      c.s.emit('room:join', { roomCode: hostB.room.code, playerName: `B${i}` });
    }
    await waitFor(() => extra.every((c) => c.playerId || c.errors.length), 'room B joins');
    r.check('ffa takes more than the 6-player team cap', extra.every((c) => c.playerId));

    const classic = track(makeClient('C0'));
    classic.s.emit('room:create', { playerName: 'C0' });
    await waitFor(() => classic.room, 'classic room');
    const cj = [];
    for (let i = 1; i <= 6; i++) {
      const c = track(makeClient(`C${i}`));
      cj.push(c);
      c.s.emit('room:join', { roomCode: classic.room.code, playerName: `C${i}` });
      await waitFor(() => c.playerId || c.errors.length, `C${i} join`);
    }
    r.check('classic rooms keep the 6-player cap', /full/i.test(lastError(cj[5]) ?? ''));
  } catch (err) {
    r.check(`unexpected error: ${err.message}`, false, clients.map((c) => `${c.name}: ${c.errors.join(' | ')}`).join(' || '));
  } finally {
    clients.forEach((c) => c.s.close());
    server.kill('SIGKILL');
  }

  process.exit(r.finish());
}

run();
