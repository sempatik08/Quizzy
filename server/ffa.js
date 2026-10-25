'use strict';

/**
 * "Herkes Kendine" — free-for-all mode (PBI 19).
 *
 * Everyone answers the same question at the same time on their own device and
 * is scored on speed. None of the team machinery applies: no captain, no coin
 * toss, no steal, no joker, no wager, no surrender.
 *
 * Kept in its own module rather than threaded through gameLogic.js: the team
 * flow is built around "one team answers, the other waits", and branching every
 * one of its ~40 room reads on the mode would put the existing modes at risk for
 * a feature that shares almost none of their rules. What IS shared — the room,
 * the question bank, the difficulty ramp, the timers, sanitizeRoom and the
 * store — is reused as is.
 *
 * Room shape added by this mode:
 *   room.ffa = {
 *     players: { [playerId]: { score, streak, correct } },  // the match roster
 *     questionNumber,          // 1-based number of the question on the table
 *     categoryQuestionCount,   // questions finished in the current category
 *     picker, pickDeadline,    // who chooses the next category, and until when
 *     lastRound,               // results of the most recent question
 *     standings,               // final ranking, set when the match ends
 *   }
 */

const { QUESTIONS, CATEGORY_KEYS } = require('./questions');
const { pickTargetDifficulty, selectQuestion, difficultyOf } = require('./difficulty');
const { getMode } = require('./gameModes');
const analytics = require('./analytics');
const store = require('./store');
const { sanitizeRoom, getRoom } = require('./roomManager');

function envInt(name, fallback) {
  const v = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** How long the round result and the top five stay on screen. */
const REVEAL_MS = envInt('QUIZZY_FFA_REVEAL_MS', 5000);
/**
 * The category picker's window. Without it one idle (or spiteful) last-place
 * player could hold a 30-person room on the category screen indefinitely.
 */
const PICK_TIMEOUT_MS = envInt('QUIZZY_FFA_PICK_MS', 20000);

/** A correct answer is worth BASE_POINTS plus up to SPEED_POINTS for speed. */
const BASE_POINTS = 500;
const SPEED_POINTS = 500;
/** Streak bonus: +100 on the 2nd correct in a row, +200 on the 3rd, capped at +300. */
const STREAK_STEP = 100;
const STREAK_MAX_BONUS = 300;

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E'];

/** roomCode -> pending timeout. Process-local, like every other timer handle. */
const pickHandles = new Map();
const revealHandles = new Map();

function isFfa(room) {
  return room?.mode === 'ffa';
}

function settingsOf(room) {
  const mode = getMode('ffa');
  return {
    totalQuestions: room.totalQuestions ?? mode.totalQuestions,
    questionsPerCategory: room.questionsPerCategory ?? mode.questionsPerCategory,
  };
}

/** Everyone who is playing rather than watching, in join order. */
function participantIds(room) {
  return Object.values(room.players)
    .filter((p) => !p.isSpectator)
    .map((p) => p.id);
}

function createFfaState(playerIds) {
  const players = {};
  for (const id of playerIds) players[id] = { score: 0, streak: 0, correct: 0 };
  return {
    players,
    questionNumber: 0,
    categoryQuestionCount: 0,
    picker: null,
    pickDeadline: null,
    lastRound: null,
    standings: null,
  };
}

/**
 * Points for one correct answer.
 * @param {number} remainingFraction 0..1 of the window still left when answered
 * @param {number} streak correct answers in a row, including this one
 */
function pointsFor(remainingFraction, streak) {
  const speed = Math.round(SPEED_POINTS * Math.min(1, Math.max(0, remainingFraction)));
  const bonus = Math.min(STREAK_MAX_BONUS, Math.max(0, streak - 1) * STREAK_STEP);
  return BASE_POINTS + speed + bonus;
}

/**
 * Ranking by score, then correct answers, then join order. Equal score and
 * equal correct count share a rank (1, 2, 2, 4), as on any scoreboard.
 */
function computeStandings(room) {
  const order = participantIds(room);
  const rows = Object.entries(room.ffa?.players ?? {}).map(([id, s]) => ({
    playerId: id,
    name: room.players[id]?.name ?? '?',
    avatar: room.players[id]?.avatar ?? null,
    score: s.score,
    correct: s.correct,
    joinIndex: order.indexOf(id),
  }));
  rows.sort((a, b) => b.score - a.score || b.correct - a.correct || a.joinIndex - b.joinIndex);
  let rank = 0;
  return rows.map((row, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.score !== row.score || prev.correct !== row.correct) rank = i + 1;
    const { joinIndex, ...rest } = row;
    return { ...rest, rank };
  });
}

/** Lowest score among connected players; ties go to whoever joined first. */
function lastPlaceConnected(room) {
  const candidates = participantIds(room).filter(
    (id) => room.players[id]?.isConnected && room.ffa.players[id],
  );
  let pick = null;
  for (const id of candidates) {
    if (pick === null || room.ffa.players[id].score < room.ffa.players[pick].score) pick = id;
  }
  return pick ?? room.hostId;
}

/** Emit and persist, mirroring server.js's broadcast() for timer-driven changes. */
function publish(room, io) {
  io.to(room.code).emit('room:update', sanitizeRoom(room));
  store.saveRoom(room);
}

/** True while this exact room object is still the live one for its code. */
function isLive(room) {
  return getRoom(room.code) === room;
}

function anyoneConnected(room) {
  return Object.values(room.players).some((p) => p.isConnected);
}

function clearHandles(code) {
  clearTimeout(pickHandles.get(code));
  clearTimeout(revealHandles.get(code));
  pickHandles.delete(code);
  revealHandles.delete(code);
}

// ---------------------------------------------------------------------------
// Match start and category choice
// ---------------------------------------------------------------------------

/**
 * Host starts the match from the lobby. The roster is frozen here: anyone who
 * arrives later watches as a spectator.
 */
function startMatch(room, requesterId, io) {
  if (!isFfa(room)) return { error: 'This room is not in free-for-all mode.' };
  if (room.hostId !== requesterId) return { error: 'Only the room host can start the game.' };
  if (room.phase !== 'lobby') return { error: 'The game has already started.' };

  const ids = participantIds(room);
  if (ids.length === 0) return { error: 'Nobody is playing yet.' };

  room.ffa = createFfaState(ids);
  room.usedQuestionIds = [];
  room.usedCategories = [];
  room.selectedCategory = null;
  room.analyticsStarted = false;
  room.analyticsRecorded = false;
  openPick(room, io, room.hostId);
  return { room };
}

/** Put the room on the category screen with `pickerId` choosing. */
function openPick(room, io, pickerId) {
  room.phase = 'category_pick';
  room.activeQuestion = null;
  room.ffa.picker = pickerId;
  room.ffa.pickDeadline = Date.now() + PICK_TIMEOUT_MS;
  room.ffa.categoryQuestionCount = 0;
  room.lastActivityAt = Date.now();

  if (!room.usedCategories) room.usedCategories = [];
  if (CATEGORY_KEYS.every((k) => room.usedCategories.includes(k))) {
    room.usedCategories = room.selectedCategory ? [room.selectedCategory] : [];
  }

  clearTimeout(pickHandles.get(room.code));
  pickHandles.set(room.code, setTimeout(() => {
    pickHandles.delete(room.code);
    if (!isLive(room) || room.phase !== 'category_pick' || !anyoneConnected(room)) return;
    const open = CATEGORY_KEYS.filter((k) => !room.usedCategories.includes(k));
    const category = open[Math.floor(Math.random() * open.length)];
    console.log(`[FFA] Pick timed out in ${room.code}, auto-picked ${category}`);
    applyCategory(room, category, io);
    publish(room, io);
  }, PICK_TIMEOUT_MS));
}

/**
 * The picker chooses. If the picker has dropped, any connected player may
 * choose instead, so a lost connection never strands the room.
 */
function pickCategory(room, playerId, category, io) {
  if (!CATEGORY_KEYS.includes(category)) return { error: 'Invalid category.' };
  if (room.phase !== 'category_pick') return { error: 'Not in category selection phase.' };

  const player = room.players[playerId];
  if (!player || player.isSpectator || !room.ffa.players[playerId]) {
    return { error: 'Only players can pick a category.' };
  }
  const picker = room.players[room.ffa.picker];
  const pickerGone = !picker || !picker.isConnected;
  if (playerId !== room.ffa.picker && !pickerGone) {
    return { error: 'Another player is picking the category.' };
  }
  if (room.usedCategories.includes(category)) {
    return { error: 'This category has already been used. Pick a different one.' };
  }

  clearTimeout(pickHandles.get(room.code));
  pickHandles.delete(room.code);
  applyCategory(room, category, io);
  return { room };
}

function applyCategory(room, category, io) {
  room.usedCategories.push(category);
  room.selectedCategory = category;
  analytics.recordCategoryPick(category);
  room.ffa.picker = null;
  room.ffa.pickDeadline = null;
  room.ffa.categoryQuestionCount = 0;
  room.phase = 'question';
  startRound(room, io);
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

function startRound(room, io) {
  const { totalQuestions } = settingsOf(room);
  let pool = QUESTIONS[room.selectedCategory];
  // The ramp follows the match's progress, not anyone's score: question 1 is
  // easy and the last third leans hard, for every player alike.
  const target = pickTargetDifficulty(room.ffa.questionNumber, totalQuestions);
  let question = selectQuestion(pool, room.usedQuestionIds, target);
  if (!question) {
    // 600 a category against 15 a match makes this near impossible, but a
    // rematch-heavy room could get here; recycle this category's pool.
    room.usedQuestionIds = room.usedQuestionIds.filter((id) => !pool.some((q) => q.id === id));
    question = selectQuestion(pool, room.usedQuestionIds, target);
  }

  room.usedQuestionIds.push(question.id);
  room.ffa.questionNumber += 1;

  const seconds = room.questionSeconds ?? getMode('ffa').questionSeconds;
  room.activeQuestion = {
    question,
    difficulty: difficultyOf(question),
    disabledOptions: [],
    votes: {}, // playerId -> { optionKey, timestamp }; optionKey hidden until reveal
    timerStart: Date.now(),
    duration: seconds,
    timeLeft: seconds,
    isSteal: false,
    stealTeam: null,
    wagerPending: false,
    wager: null,
    revealed: false,
    revealedAnswer: null,
    timerHandle: null,
    tickHandle: null,
  };
  room.lastActivityAt = Date.now();

  analytics.recordQuestionServed(question.id, room.selectedCategory);
  if (!room.analyticsStarted) {
    room.analyticsStarted = true;
    analytics.recordMatchStart(room);
  }

  // Lazy to avoid a load-time cycle: gameLogic dispatches back into this module.
  require('./gameLogic').scheduleQuestionTimers(room, io);
}

/**
 * Record one player's answer. One answer per question and no changing it:
 * with speed scoring, changing an answer would make the timestamp meaningless.
 * @returns {{ error?: string, room?: object, allAnswered?: boolean }}
 */
function castAnswer(room, playerId, rawOption) {
  const aq = room.activeQuestion;
  if (room.phase !== 'question' || !aq) return { error: 'No active question.' };
  if (aq.revealed || aq.resolving) return { error: 'Time is up.' };

  const player = room.players[playerId];
  if (!player) return { error: 'Player not found.' };
  if (player.isSpectator) return { error: 'Spectators cannot vote.' };
  if (!room.ffa.players[playerId]) return { error: 'You joined after the match started.' };
  if (aq.votes[playerId]) return { error: 'You have already answered.' };

  const optionKey = String(rawOption).toUpperCase();
  if (!OPTION_KEYS.includes(optionKey)) return { error: 'That option is invalid.' };

  aq.votes[playerId] = { optionKey, timestamp: Date.now() };
  room.lastActivityAt = Date.now();

  const waitingOn = Object.keys(room.ffa.players).filter(
    (id) => room.players[id]?.isConnected && !aq.votes[id],
  );
  return { room, allAnswered: waitingOn.length === 0 };
}

/** Close the question, score everyone, show the result, then move on. */
function resolveRound(room, io) {
  const aq = room.activeQuestion;
  if (!aq) return;
  if (aq.revealed) {
    clearTimeout(aq.timerHandle);
    clearInterval(aq.tickHandle);
    aq.timerHandle = null;
    aq.tickHandle = null;
    // Reached again after a reconnect or a restore re-armed the clock on a
    // question that was already scored. If the reveal timer is still pending
    // it will advance; otherwise nothing else will, so advance now.
    if (!revealHandles.has(room.code)) advance(room, io);
    return;
  }
  if (aq.resolving) return;
  aq.resolving = true;

  clearTimeout(aq.timerHandle);
  clearInterval(aq.tickHandle);
  aq.timerHandle = null;
  aq.tickHandle = null;

  const { question, votes } = aq;
  const durationMs = aq.duration * 1000;
  const deadline = aq.timerStart + durationMs;
  const results = {};
  let anyAnswered = false;

  for (const [id, entry] of Object.entries(room.ffa.players)) {
    const vote = votes[id];
    const isCorrect = Boolean(vote) && vote.optionKey === question.answer;
    let points = 0;
    if (isCorrect) {
      entry.streak += 1;
      entry.correct += 1;
      points = pointsFor((deadline - vote.timestamp) / durationMs, entry.streak);
      entry.score += points;
    } else {
      entry.streak = 0;
    }
    results[id] = { optionKey: vote?.optionKey ?? null, isCorrect, points, streak: entry.streak };
    if (vote) {
      anyAnswered = true;
      analytics.recordAnswer(question.id, { isCorrect, isSteal: false, answered: true });
    }
  }
  if (!anyAnswered) {
    analytics.recordAnswer(question.id, { isCorrect: false, isSteal: false, answered: false });
  }

  aq.revealed = true;
  aq.revealedAnswer = question.answer;
  aq.timeLeft = 0;
  room.ffa.lastRound = {
    questionNumber: room.ffa.questionNumber,
    correctAnswer: question.answer,
    results,
  };
  room.ffa.categoryQuestionCount += 1;
  room.lastActivityAt = Date.now();
  publish(room, io);

  revealHandles.set(room.code, setTimeout(() => {
    revealHandles.delete(room.code);
    advance(room, io);
  }, REVEAL_MS));
}

function advance(room, io) {
  if (!isLive(room) || room.phase !== 'question') return;
  // An empty room stays on the result screen. The reconnect path re-arms the
  // clock, which lands back in resolveRound and advances from there.
  if (!anyoneConnected(room)) return;

  const { totalQuestions, questionsPerCategory } = settingsOf(room);
  if (room.ffa.questionNumber >= totalQuestions) {
    finish(room);
  } else if (room.ffa.categoryQuestionCount >= questionsPerCategory) {
    openPick(room, io, lastPlaceConnected(room));
  } else {
    startRound(room, io);
  }
  publish(room, io);
}

function finish(room) {
  clearHandles(room.code);
  room.phase = 'finished';
  room.activeQuestion = null;
  room.ffa.standings = computeStandings(room);
  room.lastActivityAt = Date.now();
  // Profile stats are deliberately not written: the leaderboard is built on
  // team wins and losses, and a 1st-of-12 finish does not map onto that.
  if (!room.analyticsRecorded) {
    room.analyticsRecorded = true;
    analytics.recordMatchEnd(room);
  }
}

// ---------------------------------------------------------------------------
// Rematch
// ---------------------------------------------------------------------------

/**
 * Any player can restart a finished match with one tap. The team modes ask
 * both sides to agree because a rematch drags the opponent into another game;
 * here there is no opponent to protect, and waiting on 30 confirmations would
 * kill the moment.
 */
function rematch(room, playerId, io) {
  if (room.phase !== 'finished') return { error: 'A rematch can only be started after the match ends.' };
  const player = room.players[playerId];
  if (!player || player.isSpectator) return { error: 'Spectators cannot start a rematch.' };

  clearHandles(room.code);
  room.ffa = createFfaState(participantIds(room));
  room.usedCategories = [];
  room.selectedCategory = null;
  room.analyticsStarted = false;
  room.analyticsRecorded = false;
  openPick(room, io, room.players[room.hostId]?.isConnected ? room.hostId : playerId);
  return { room };
}

module.exports = {
  isFfa,
  startMatch,
  pickCategory,
  castAnswer,
  resolveRound,
  rematch,
  computeStandings,
  pointsFor,
  participantIds,
  clearHandles,
  REVEAL_MS,
  PICK_TIMEOUT_MS,
  BASE_POINTS,
  SPEED_POINTS,
  STREAK_STEP,
  STREAK_MAX_BONUS,
};
