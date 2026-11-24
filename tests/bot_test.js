'use strict';

/**
 * Bot opponents — PBI 36.
 *
 * Pure part: the decision model with a seeded RNG — levels are ordered by
 * accuracy and speed, question difficulty shifts accuracy, a wrong answer is
 * never the right one and only uses options the question has.
 *
 * Socket part (own server, short reveal): "play a bot" from the menu, the bot
 * answering through the normal path, the human always picking categories even
 * with the bot in last place, rematch, refused input, and analytics.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3092;
process.env.QUIZZY_SOCKET_URL = `http://localhost:${PORT}`;

const { createReporter, sleep, waitFor, makeClient, answerFor, RATE_GAP } = require('./helpers');
const bot = require('../server/bot');

const r = createReporter('BOT OPPONENTS — PBI 36');

const TOKEN = 'test-bot-token-1234';
const storeFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quizzy-bot-')), 'rooms.json');

/** mulberry32 — a tiny seeded RNG so the statistics are reproducible. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stats(level, difficulty, n = 4000) {
  const rng = seeded(level.length * 1000 + difficulty);
  const q = { answer: 'C', difficulty, options: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e' } };
  let right = 0;
  let answered = 0;
  let totalMs = 0;
  for (let i = 0; i < n; i++) {
    const d = bot.decide(q, level, 20000, rng);
    if (!d.option) continue;
    answered += 1;
    totalMs += d.elapsedMs;
    if (d.option === 'C') right += 1;
  }
  return { rate: right / answered, avgMs: totalMs / answered, answered };
}

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
        QUIZZY_FFA_REVEAL_MS: '250',
        QUIZZY_BOT_TIME_SCALE: '0.1',
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

function botClient(name) {
  const c = makeClient(name);
  c.found = null;
  c.s.on('match:found', (p) => { c.found = p; c.playerId = p.playerId; c.room = p.room; });
  return c;
}

const qNum = (c) => c.room?.ffa?.questionNumber ?? 0;
const open = (c, n) => c.room?.phase === 'question' && qNum(c) === n && !c.room.activeQuestion?.revealed;

async function run() {
  r.banner();

  // -------------------------------------------------------------------------
  r.section('Decision model (seeded)');
  const easy = stats('easy', 2);
  const medium = stats('medium', 2);
  const hard = stats('hard', 2);
  r.check(`easy is right about 45% of the time (${easy.rate.toFixed(2)})`, Math.abs(easy.rate - 0.45) < 0.04);
  r.check(`medium is right about 65% of the time (${medium.rate.toFixed(2)})`, Math.abs(medium.rate - 0.65) < 0.04);
  r.check(`hard is right about 85% of the time (${hard.rate.toFixed(2)})`, Math.abs(hard.rate - 0.85) < 0.04);
  r.check('harder levels answer faster', easy.avgMs > medium.avgMs && medium.avgMs > hard.avgMs,
    `${easy.avgMs | 0} / ${medium.avgMs | 0} / ${hard.avgMs | 0}`);
  r.check('easy questions lift accuracy, hard ones cut it',
    stats('medium', 1).rate > medium.rate + 0.08 && stats('medium', 3).rate < medium.rate - 0.08);
  // Force the wrong branch (skip roll, speed roll, accuracy roll 0.999) and
  // sweep the option roll: every pick must differ from the answer.
  const q5 = { answer: 'C', difficulty: 2, options: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e' } };
  const wrongPicks = [0.1, 0.3, 0.6, 0.9, 0.999].map((v) => {
    const rolls = [0.99, 0.5, 0.999, v];
    return bot.decide(q5, 'hard', 20000, () => rolls.shift()).option;
  });
  r.check('a wrong answer is never the correct one, and covers the other options',
    wrongPicks.every((o) => o && o !== 'C') && new Set(wrongPicks).size === 4, wrongPicks.join(','));
  r.check('easy sometimes skips, hard never does', easy.answered < 4000 && hard.answered === 4000);

  const fourOptions = { answer: 'A', difficulty: 3, options: { A: 'a', B: 'b', C: 'c', D: 'd' } };
  const rng = seeded(7);
  let usedE = false;
  for (let i = 0; i < 2000; i++) if (bot.decide(fourOptions, 'easy', 20000, rng).option === 'E') usedE = true;
  r.check('only options the question has are chosen', !usedE);

  const timing = bot.decide({ answer: 'A', difficulty: 2 }, 'hard', 20000, () => 0.99);
  r.check('answer time stays inside the window', timing.elapsedMs > 0 && timing.elapsedMs < 20000);
  r.check('unknown level is refused, known ones accepted',
    !bot.isValidLevel('expert') && bot.LEVEL_KEYS.every((l) => bot.isValidLevel(l)));

  // -------------------------------------------------------------------------
  const server = await startServer();
  const clients = [];
  const track = (c) => { clients.push(c); return c; };

  try {
    r.section('Play a bot');
    const human = track(botClient('Insan'));
    human.s.emit('match:bot', { playerName: 'Insan', level: 'easy' });
    await waitFor(() => human.found, 'bot match found');
    r.check('the menu starts a bot match at the chosen level',
      human.found.opponent.kind === 'bot' && human.found.opponent.level === 'easy');
    const botId = human.room.botMatch?.botId;
    r.check('the bot is on the roster, flagged as a bot',
      Boolean(botId) && human.room.players[botId]?.isBot === true && Boolean(human.room.ffa.players[botId]));
    r.check('the room records the level', human.room.botMatch.level === 'easy' && human.room.players[botId].botLevel === 'easy');
    r.check('the human picks the first category', human.room.phase === 'category_pick' && human.room.ffa.picker === human.playerId);

    await sleep(RATE_GAP);
    human.s.emit('category:pick', { category: 'general' });
    await waitFor(() => open(human, 1), 'round 1 open');
    await waitFor(() => human.room.activeQuestion?.votes?.[botId] || human.room.ffa.lastRound, 'bot answered', 22000);
    if (human.room.activeQuestion?.votes?.[botId] && !human.room.activeQuestion.revealed) {
      r.check('ANTI-CHEAT: the bot\'s choice is hidden until the reveal',
        human.room.activeQuestion.votes[botId].optionKey === undefined);
    }

    // Play the match out. The human answers right every time, so the bot ends
    // each category in last place — and must never be handed the pick.
    let botPicked = false;
    for (let n = 1; n <= 15; n++) {
      await waitFor(() => open(human, n) || human.room.phase === 'category_pick', `round ${n}`, 25000);
      if (human.room.phase === 'category_pick') {
        if (human.room.ffa.picker === botId) botPicked = true;
        const used = human.room.usedCategories;
        const next = ['history', 'geography', 'science', 'cinema', 'music'].find((c) => !used.includes(c));
        await sleep(RATE_GAP);
        human.s.emit('category:pick', { category: next });
        await waitFor(() => open(human, n), `round ${n} open`, 8000);
      }
      if (!human.room.activeQuestion?.votes?.[human.playerId]) {
        await sleep(RATE_GAP);
        human.s.emit('vote:cast', { optionKey: answerFor(human.room) });
      }
      await waitFor(() => human.room.ffa.lastRound?.questionNumber === n, `round ${n} scored`, 25000);
    }
    r.check('the bot is never the category picker, even in last place', !botPicked);
    await waitFor(() => human.room.phase === 'finished', 'finished', 8000);
    const standings = human.room.ffa.standings ?? [];
    r.check('the match ends with both on the standings', standings.length === 2);
    r.check('the bot scored through the live rules',
      standings.some((s) => s.playerId === botId && s.score >= 0));

    await sleep(RATE_GAP);
    human.s.emit('rematch:request');
    await waitFor(() => human.room.phase === 'category_pick', 'rematch');
    r.check('a rematch against the bot is allowed (it decides afresh)',
      human.room.botMatch?.botId === botId && Boolean(human.room.ffa.players[botId]));

    // -----------------------------------------------------------------------
    r.section('Refused input');
    const bad = track(botClient('Kotu'));
    bad.s.emit('match:bot', { playerName: 'Kotu', level: 'expert' });
    await waitFor(() => bad.errors.length > 0, 'bad level refused');
    r.check('an unknown level is refused', /level/i.test(bad.errors.at(-1)));
    await sleep(RATE_GAP);
    bad.s.emit('match:bot', { playerName: '', level: 'hard' });
    await waitFor(() => bad.errors.length > 1, 'empty name refused');
    r.check('an empty name is refused', /name/i.test(bad.errors.at(-1)));
    await sleep(RATE_GAP);
    human.s.emit('match:bot', { playerName: 'Insan', level: 'hard' });
    await waitFor(() => human.errors.some((e) => /already in a room/i.test(e)), 'second match refused');
    r.check('a player already in a room cannot start another', true);

    // -----------------------------------------------------------------------
    r.section('Analytics');
    const rep = await (await fetch(`http://localhost:${PORT}/analytics?token=${TOKEN}`)).json();
    r.check('bot matches are counted by level',
      rep.funnel?.botMatches?.easy === 1 && rep.funnel.botMatches.hard === 0, JSON.stringify(rep.funnel?.botMatches));
    r.check('the bot is not counted as a player at kickoff', rep.funnel?.avgPlayersPerMatch === 1,
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
