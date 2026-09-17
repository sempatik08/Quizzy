'use strict';

const { QUESTIONS, CATEGORY_KEYS } = require('./questions');
const { sanitizeRoom, STEAL_CHARGES_PER_TEAM } = require('./roomManager');

// ---------------------------------------------------------------------------
// Rate limiting: debounce rapid socket emissions per player
// ---------------------------------------------------------------------------
const playerLastEvent = new Map(); // playerId → timestamp (ms)
const RATE_LIMIT_MS = 500;

// ---------------------------------------------------------------------------
// Timing & steal configuration
// ---------------------------------------------------------------------------
const QUESTION_SECONDS = 60;
/** Steal window is deliberately short — the team already read the question. */
const STEAL_SECONDS = 20;
/**
 * Fresh questions each team answers before the category rotates (PBI 3).
 * Without this the category never changed in practice: every pool holds 200
 * questions and rotation only triggered on exhaustion.
 */
const QUESTIONS_PER_CATEGORY_PER_TEAM = 5;
/** Seconds the extra-time joker adds to the running question (PBI 6). */
const JOKER_EXTRA_SECONDS = 15;
/** Wrong options the 50/50 joker strikes out (PBI 6). */
const JOKER_FIFTY_FIFTY_REMOVES = 2;
const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E'];

/**
 * Returns true if the player has fired an event too recently.
 * Call BEFORE processing vote/team events.
 * @param {string} playerId
 * @returns {boolean}
 */
function isRateLimited(playerId) {
  const last = playerLastEvent.get(playerId) || 0;
  const now = Date.now();
  if (now - last < RATE_LIMIT_MS) return true;
  playerLastEvent.set(playerId, now);
  return false;
}

// ---------------------------------------------------------------------------
// Captain Election
// ---------------------------------------------------------------------------

/**
 * Record a captain vote and resolve immediately if majority is reached.
 * @param {import('./types').Room} room
 * @param {string} voterId
 * @param {string} nomineeId
 * @returns {{ error?: string, room?: import('./types').Room, resolved?: boolean }}
 */
function castCaptainVote(room, voterId, nomineeId) {
  const voter = room.players[voterId];
  if (!voter) return { error: 'Player not found.' };
  if (!voter.team) return { error: 'You are not in a team.' };

  const team = room.teams[voter.team];
  if (team.captain) return { error: 'A captain has already been elected.' };
  if (!team.players.includes(nomineeId)) return { error: 'Nominee is not in your team.' };
  if (voter.team !== room.players[nomineeId]?.team) return { error: 'Invalid nominee.' };

  team.captainVotes[voterId] = nomineeId;

  const resolved = tryResolveCaptainElection(room, voter.team);
  return { room, resolved };
}

/**
 * Tally captain votes and elect if majority reached.
 * Also called by the 60s timeout to force-elect.
 * @param {import('./types').Room} room
 * @param {'blue' | 'red'} teamColor
 * @returns {boolean} true if a captain was elected
 */
function tryResolveCaptainElection(room, teamColor) {
  const team = room.teams[teamColor];
  if (team.captain) return true; // already elected

  const teamPlayers = team.players;

  // Single player → auto-captain, no vote needed
  if (teamPlayers.length === 1) {
    team.captain = teamPlayers[0];
    return true;
  }

  // Build tally
  const tally = {};
  for (const nomineeId of Object.values(team.captainVotes)) {
    tally[nomineeId] = (tally[nomineeId] || 0) + 1;
  }

  const majority = Math.floor(teamPlayers.length / 2) + 1;

  // Check for majority
  for (const [nomineeId, count] of Object.entries(tally)) {
    if (count >= majority) {
      team.captain = nomineeId;
      return true;
    }
  }

  // All players voted but no majority → elect by most votes (earliest-vote tiebreak not tracked here)
  const allVoted = Object.keys(team.captainVotes).length === teamPlayers.length;
  if (allVoted) {
    const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    if (winner) {
      team.captain = winner[0];
      return true;
    }
    // Fallback: pick first connected team member
    const fallback = teamPlayers.find((id) => room.players[id]?.isConnected) || teamPlayers[0];
    team.captain = fallback;
    return true;
  }

  return false;
}

/**
 * Force-resolve captain election (called on 60s timeout).
 * @param {import('./types').Room} room
 * @param {'blue' | 'red'} teamColor
 */
function forceResolveCaptainElection(room, teamColor) {
  const team = room.teams[teamColor];
  if (team.captain) return;

  const tally = {};
  for (const nomineeId of Object.values(team.captainVotes)) {
    tally[nomineeId] = (tally[nomineeId] || 0) + 1;
  }

  if (Object.keys(tally).length > 0) {
    const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    team.captain = winner[0];
  } else {
    // No votes at all: pick first connected member
    const connected = team.players.find((id) => room.players[id]?.isConnected);
    team.captain = connected || team.players[0] || null;
  }
}

// ---------------------------------------------------------------------------
// Teams Lock + Coin Toss + Category Pick
// ---------------------------------------------------------------------------

/**
 * Lock the teams, auto-assign solo captains.
 * @param {import('./types').Room} room
 * @param {string} requesterId
 * @returns {{ error?: string, room?: import('./types').Room }}
 */
function lockTeams(room, requesterId) {
  if (room.hostId !== requesterId) return { error: 'Only the room host can lock teams.' };
  if (room.teams.blue.players.length === 0) return { error: 'Blue team has no players.' };
  if (room.teams.red.players.length === 0) return { error: 'Red team has no players.' };

  // Auto-assign captains for teams still without one
  for (const color of ['blue', 'red']) {
    const team = room.teams[color];
    if (!team.captain && team.players.length > 0) {
      forceResolveCaptainElection(room, color);
    }
  }

  room.phase = 'coin_toss';
  room.lastActivityAt = Date.now();
  return { room };
}

/**
 * Perform a random coin toss and transition to category pick.
 * @param {import('./types').Room} room
 * @returns {{ room: import('./types').Room, winner: 'blue' | 'red' }}
 */
function resolveCoinToss(room) {
  const winner = Math.random() < 0.5 ? 'blue' : 'red';
  room.coinTossWinner = winner;
  room.activeTeam = winner;
  room.turnTeam = winner; // authoritative turn order — always alternates after each full question
  room.phase = 'category_pick';
  room.lastActivityAt = Date.now();
  return { room, winner };
}

/**
 * Winning captain picks a category; transitions to 'question' phase.
 * @param {import('./types').Room} room
 * @param {string} playerId
 * @param {string} category
 * @returns {{ error?: string, room?: import('./types').Room }}
 */
function pickCategory(room, playerId, category) {
  if (!CATEGORY_KEYS.includes(category)) return { error: 'Invalid category.' };
  if (room.phase !== 'category_pick') return { error: 'Not in category selection phase.' };

  const pickerTeam = room.categoryPickTeam ?? room.coinTossWinner;
  if (room.teams[pickerTeam].captain !== playerId) {
    return { error: 'Only the picking team\'s captain may select a category.' };
  }

  if (!room.usedCategories) room.usedCategories = [];

  if (room.usedCategories.includes(category)) {
    return { error: 'This category has already been used. Pick a different one.' };
  }

  room.usedCategories.push(category);
  room.selectedCategory = category;
  room.categoryPickTeam = null;
  room.categoryAnswerCount = { blue: 0, red: 0 };
  room.phase = 'question';
  room.lastActivityAt = Date.now();
  return { room };
}

// ---------------------------------------------------------------------------
// Question Flow
// ---------------------------------------------------------------------------

/**
 * True once BOTH teams have answered their quota of fresh questions in the
 * current category (PBI 3).
 * @param {import('./types').Room} room
 * @returns {boolean}
 */
function isCategoryComplete(room) {
  const counts = room.categoryAnswerCount;
  if (!counts) return false;
  return (
    counts.blue >= QUESTIONS_PER_CATEGORY_PER_TEAM &&
    counts.red >= QUESTIONS_PER_CATEGORY_PER_TEAM
  );
}

/**
 * Hand category selection to the lower-scoring team (blue on a tie) and reset
 * the per-category counter. Used both when the quota is met and when a pool
 * runs dry.
 *
 * If every category has been used the allow-list is cleared except for the one
 * just played, so the match cannot deadlock on "no category left to pick" while
 * still refusing an immediate repeat.
 * @param {import('./types').Room} room
 */
function openCategoryPick(room) {
  const blueScore = room.teams.blue.score;
  const redScore = room.teams.red.score;
  room.categoryPickTeam = blueScore <= redScore ? 'blue' : 'red';
  room.categoryAnswerCount = { blue: 0, red: 0 };

  if (!room.usedCategories) room.usedCategories = [];
  const remaining = CATEGORY_KEYS.filter((k) => !room.usedCategories.includes(k));
  if (remaining.length === 0) {
    room.usedCategories = room.selectedCategory ? [room.selectedCategory] : [];
  }

  room.phase = 'category_pick';
  room.activeQuestion = null;
  room.lastActivityAt = Date.now();
}

/**
 * Select a random unused question from the active category.
 * Reshuffles (clears used IDs) if all questions have been used.
 * @param {import('./types').Room} room
 * @returns {import('./types').ServerQuestion}
 */
function getNextQuestion(room) {
  const pool = QUESTIONS[room.selectedCategory];
  const available = pool.filter((q) => !room.usedQuestionIds.includes(q.id));
  if (available.length === 0) return null; // category exhausted
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Start a new question, launching the server-side 60s timer.
 * Emits `room:update` immediately after setup.
 * @param {import('./types').Room} room
 * @param {import('socket.io').Server} io
 */
function startQuestion(room, io) {
  const question = getNextQuestion(room);

  if (!question) {
    // Category exhausted — reset only this category's used IDs, then ask for a new category
    const pool = QUESTIONS[room.selectedCategory];
    room.usedQuestionIds = room.usedQuestionIds.filter(
      (id) => !pool.some((q) => q.id === id),
    );
    openCategoryPick(room);
    console.log(`[Game] Category exhausted in ${room.code}. ${room.categoryPickTeam} team picks next.`);
    io.to(room.code).emit('room:update', sanitizeRoom(room));
    return;
  }

  room.usedQuestionIds.push(question.id);

  room.activeQuestion = {
    question, // FULL question including answer — sanitizeRoom strips it before emit
    disabledOptions: [],
    votes: {}, // playerId → { optionKey, timestamp }
    timerStart: Date.now(),
    duration: QUESTION_SECONDS,
    timeLeft: QUESTION_SECONDS,
    isSteal: false,   // true once the opposing team has taken over this question
    stealTeam: null,  // which team is attempting the steal
    timerHandle: null,
    tickHandle: null,
  };

  scheduleQuestionTimers(room, io);
}

/**
 * (Re)arms the per-second tick and the authoritative resolve timeout from the
 * question's current timerStart/duration.
 *
 * Extracted because three call sites need it — a fresh question, the steal
 * window, and the extra-time joker — and each previously grew its own copy.
 * Deriving timeLeft from wall-clock elapsed rather than counting down a variable
 * keeps a throttled or backgrounded interval from drifting.
 *
 * @param {import('./types').Room} room
 * @param {import('socket.io').Server} io
 */
function scheduleQuestionTimers(room, io) {
  const aq = room.activeQuestion;
  if (!aq) return;

  clearTimeout(aq.timerHandle);
  clearInterval(aq.tickHandle);

  const remainingMs = Math.max(0, aq.duration * 1000 - (Date.now() - aq.timerStart));

  aq.tickHandle = setInterval(() => {
    if (!room.activeQuestion) return;
    const elapsed = Math.floor((Date.now() - room.activeQuestion.timerStart) / 1000);
    room.activeQuestion.timeLeft = Math.max(0, room.activeQuestion.duration - elapsed);
    io.to(room.code).emit('timer_tick', { timeLeft: room.activeQuestion.timeLeft });
    if (room.activeQuestion.timeLeft <= 0) clearInterval(room.activeQuestion.tickHandle);
  }, 1000);

  // Authoritative timeout — the server resolves regardless of client state.
  aq.timerHandle = setTimeout(() => {
    resolveVote(room, io);
  }, remainingMs);
}

/**
 * Restart the clock on the SAME question (used to open the steal window).
 * Clears previous votes so the stealing team starts from a clean slate.
 * @param {import('./types').Room} room
 * @param {import('socket.io').Server} io
 * @param {number} seconds
 */
function resetQuestionTimer(room, io, seconds) {
  if (!room.activeQuestion) return;

  clearTimeout(room.activeQuestion.timerHandle);
  clearInterval(room.activeQuestion.tickHandle);

  room.activeQuestion.timerStart = Date.now();
  room.activeQuestion.duration = seconds;
  room.activeQuestion.timeLeft = seconds;
  room.activeQuestion.votes = {};
  room.activeQuestion.resolving = false; // reset guard so steal team can resolve

  scheduleQuestionTimers(room, io);
}

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

/**
 * Record a player's vote. Validates team turn and option validity.
 * @param {import('./types').Room} room
 * @param {string} playerId
 * @param {string} rawOption
 * @returns {{ error?: string, allVoted?: boolean, room?: import('./types').Room }}
 */
function castVote(room, playerId, rawOption) {
  if (!room.activeQuestion) return { error: 'No active question.' };
  if (room.phase !== 'question') return { error: 'Not in voting phase.' };

  const player = room.players[playerId];
  if (!player) return { error: 'Player not found.' };
  if (player.team !== room.activeTeam) return { error: 'It is not your team\'s turn.' };

  const optionKey = rawOption.toUpperCase();
  const validOptions = ['A', 'B', 'C', 'D', 'E'].filter(
    (o) => !room.activeQuestion.disabledOptions.includes(o),
  );
  if (!validOptions.includes(optionKey)) return { error: 'That option is disabled or invalid.' };

  // Player can change their vote during the window
  room.activeQuestion.votes[playerId] = { optionKey, timestamp: Date.now() };

  // Check if all connected active-team members have now voted
  const activeTeamPlayers = room.teams[room.activeTeam].players.filter(
    (id) => room.players[id]?.isConnected,
  );
  const votedCount = activeTeamPlayers.filter((id) => room.activeQuestion.votes[id]).length;
  const allVoted = votedCount === activeTeamPlayers.length && activeTeamPlayers.length > 0;

  return { room, allVoted };
}

/**
 * Resolve the current vote (called by timeout or when all players voted).
 * Awards points, handles steal, or advances to next question.
 * Emits `answer_reveal` then (after 2s delay) `room:update`.
 * @param {import('./types').Room} room
 * @param {import('socket.io').Server} io
 */
function resolveVote(room, io) {
  if (!room.activeQuestion) return;
  // Guard: prevent double-resolution from simultaneous allVoted + timeout firing
  if (room.activeQuestion.resolving) return;
  room.activeQuestion.resolving = true;

  // Clear any pending timers immediately
  clearTimeout(room.activeQuestion.timerHandle);
  clearInterval(room.activeQuestion.tickHandle);
  room.activeQuestion.timerHandle = null;
  room.activeQuestion.tickHandle = null;

  const { votes, disabledOptions, question } = room.activeQuestion;
  const validOptions = ['A', 'B', 'C', 'D', 'E'].filter((o) => !disabledOptions.includes(o));
  const activeTeamPlayers = room.teams[room.activeTeam].players;

  // Tally votes (only from active team, regardless of connection status)
  const tally = {}; // optionKey → { count, earliestTimestamp }
  for (const playerId of activeTeamPlayers) {
    const vote = votes[playerId];
    if (!vote) continue;
    if (!tally[vote.optionKey]) {
      tally[vote.optionKey] = { count: 0, earliestTimestamp: Infinity };
    }
    tally[vote.optionKey].count++;
    if (vote.timestamp < tally[vote.optionKey].earliestTimestamp) {
      tally[vote.optionKey].earliestTimestamp = vote.timestamp;
    }
  }

  // Find winning option: most votes → earliest first vote as tiebreak → first valid option fallback
  let winningOption = validOptions[0];
  let maxCount = -1;

  for (const opt of validOptions) {
    const entry = tally[opt];
    if (!entry) continue;
    const isHigher = entry.count > maxCount;
    const isTie =
      entry.count === maxCount &&
      entry.earliestTimestamp < (tally[winningOption]?.earliestTimestamp ?? Infinity);
    if (isHigher || isTie) {
      maxCount = entry.count;
      winningOption = opt;
    }
  }

  // A team that never voted cannot back into a correct answer via the fallback option
  const teamVoted = activeTeamPlayers.some((pid) => votes[pid]);
  const isCorrect = teamVoted && winningOption === question.answer;

  const answeringTeam = room.activeTeam;
  const isSteal = room.activeQuestion.isSteal === true;
  const opponent = answeringTeam === 'blue' ? 'red' : 'blue';

  if (!room.stealCharges) {
    room.stealCharges = { blue: STEAL_CHARGES_PER_TEAM, red: STEAL_CHARGES_PER_TEAM };
  }

  // A steal opens only on a first-pass miss, and only if the opponent still has a charge
  const stealOpens = !isSteal && !isCorrect && room.stealCharges[opponent] > 0;

  io.to(room.code).emit('answer_reveal', {
    selectedOption: teamVoted ? winningOption : null,
    // ANTI-CHEAT: withhold the answer while this question can still be stolen
    ...(stealOpens ? {} : { correctAnswer: question.answer }),
    isCorrect,
    activeTeam: answeringTeam,
    isSteal,
    stealOpens,
  });

  // Transition state after a 2s reveal delay
  setTimeout(() => {
    if (!room.activeQuestion) return; // guard against race conditions

    room.lastActivityAt = Date.now();

    const finish = () => {
      room.phase = 'finished';
      room.activeQuestion = null;
      io.to(room.code).emit('room:update', sanitizeRoom(room));
    };

    const advanceTurn = () => {
      // PBI 3: credit the finished question to the team that OWNED the turn.
      // A steal resolves the same question and leaves turnTeam untouched, so
      // attributing to turnTeam counts each question exactly once.
      if (!room.categoryAnswerCount) room.categoryAnswerCount = { blue: 0, red: 0 };
      if (room.turnTeam) room.categoryAnswerCount[room.turnTeam] += 1;

      const nextTurn = room.turnTeam === 'blue' ? 'red' : 'blue';
      room.turnTeam = nextTurn;
      room.activeTeam = nextTurn;
      room.activeQuestion = null;

      if (isCategoryComplete(room)) {
        openCategoryPick(room);
        console.log(`[Game] Category quota met in ${room.code}. ${room.categoryPickTeam} team picks next.`);
        io.to(room.code).emit('room:update', sanitizeRoom(room));
        return;
      }

      room.phase = 'question';
      startQuestion(room, io);
      io.to(room.code).emit('room:update', sanitizeRoom(room));
    };

    // ---- Resolving a steal attempt ----
    if (isSteal) {
      // The charge burns only when the team actually committed to an answer.
      // Passing or letting the clock run out is free.
      if (teamVoted) {
        room.stealCharges[answeringTeam] = Math.max(0, room.stealCharges[answeringTeam] - 1);
        if (isCorrect) {
          room.teams[answeringTeam].score += 10;
          if (checkWin(room)) return finish();
        }
      }
      advanceTurn();
      return;
    }

    // ---- Resolving a normal answer ----
    if (isCorrect) {
      room.teams[answeringTeam].score += 5;
      if (checkWin(room)) return finish();
      advanceTurn();
      return;
    }

    if (stealOpens) {
      // Hand the SAME question to the opponent with the missed option struck out.
      // turnTeam deliberately stays put — the steal is an interruption, not a turn.
      if (teamVoted && !room.activeQuestion.disabledOptions.includes(winningOption)) {
        room.activeQuestion.disabledOptions.push(winningOption);
      }
      room.activeQuestion.isSteal = true;
      room.activeQuestion.stealTeam = opponent;
      room.activeTeam = opponent;
      resetQuestionTimer(room, io, STEAL_SECONDS);
      io.to(room.code).emit('room:update', sanitizeRoom(room));
      return;
    }

    advanceTurn();
  }, 2000);
}

/**
 * Decline a steal attempt. Costs no charge — the turn simply moves on.
 * @param {import('./types').Room} room
 * @param {string} playerId
 * @param {import('socket.io').Server} io
 * @returns {{ error?: string, room?: import('./types').Room }}
 */
function passSteal(room, playerId, io) {
  const aq = room.activeQuestion;
  if (!aq || !aq.isSteal) return { error: 'There is no steal to pass on.' };
  if (aq.resolving) return { error: 'This steal is already being resolved.' };

  const player = room.players[playerId];
  if (!player || player.team !== aq.stealTeam) {
    return { error: 'Only the stealing team may pass.' };
  }

  // Dropping the votes makes resolveVote treat this as an unanswered steal:
  // no charge spent, no points, turn advances.
  aq.votes = {};
  resolveVote(room, io);
  return { room };
}

// ---------------------------------------------------------------------------
// Jokers (PBI 6)
// ---------------------------------------------------------------------------

/** Fresh joker allocation for one team. One of each, per match. */
function createJokerState() {
  return { fiftyFifty: true, extraTime: true };
}

const JOKER_TYPES = {
  fifty_fifty: 'fiftyFifty',
  extra_time: 'extraTime',
};

/**
 * Spend one of the active team's jokers on the current question.
 *
 * Restricted to the captain of the team whose turn it is: a joker is a scarce,
 * match-long resource and any teammate being able to burn it would take the
 * decision away from the person the team elected to make it.
 *
 * Blocked during a steal window on purpose. The steal window is already a
 * discounted second chance at a question the stealing team watched someone else
 * miss, with an option struck out for free; letting a joker stack on top of that
 * would make stealing strictly better than answering.
 *
 * @param {import('./types').Room} room
 * @param {string} playerId
 * @param {'fifty_fifty' | 'extra_time'} rawType
 * @param {import('socket.io').Server} io
 * @returns {{ error?: string, room?: import('./types').Room, removed?: string[], addedSeconds?: number }}
 */
function useJoker(room, playerId, rawType, io) {
  const key = JOKER_TYPES[rawType];
  if (!key) return { error: 'Unknown joker.' };

  if (room.phase !== 'question') return { error: 'Jokers can only be used during a question.' };

  const aq = room.activeQuestion;
  if (!aq) return { error: 'No active question.' };
  if (aq.resolving) return { error: 'This question is already being resolved.' };
  if (aq.isSteal) return { error: 'Jokers cannot be used during a steal.' };
  if (aq.timeLeft <= 0) return { error: 'Time is up.' };

  const player = room.players[playerId];
  if (!player) return { error: 'Player not found.' };
  if (!player.team) return { error: 'You are not in a team.' };
  if (player.team !== room.activeTeam) return { error: 'It is not your turn.' };
  if (room.teams[player.team].captain !== playerId) {
    return { error: 'Only your team captain can use a joker.' };
  }

  if (!room.jokers) {
    room.jokers = { blue: createJokerState(), red: createJokerState() };
  }
  const mine = room.jokers[player.team];
  if (!mine[key]) return { error: 'Your team has already used that joker.' };

  mine[key] = false;
  room.lastActivityAt = Date.now();

  if (key === 'fiftyFifty') {
    const removed = pickWrongOptionsToRemove(aq);
    for (const opt of removed) {
      if (!aq.disabledOptions.includes(opt)) aq.disabledOptions.push(opt);
    }

    // Drop votes already cast for the options that just went away. resolveVote
    // ignores disabled options when tallying but still treats "the team voted"
    // as true, and its fallback is validOptions[0] — so a stale vote on a
    // struck-out option could otherwise back into a free correct answer.
    for (const [voterId, vote] of Object.entries(aq.votes)) {
      if (removed.includes(vote.optionKey)) delete aq.votes[voterId];
    }

    return { room, removed };
  }

  // extraTime — extend the window in place, keeping votes and elapsed time.
  aq.duration += JOKER_EXTRA_SECONDS;
  aq.timeLeft = Math.max(
    0,
    aq.duration - Math.floor((Date.now() - aq.timerStart) / 1000),
  );
  scheduleQuestionTimers(room, io);
  io.to(room.code).emit('timer_tick', { timeLeft: aq.timeLeft });

  return { room, addedSeconds: JOKER_EXTRA_SECONDS };
}

/**
 * Chooses which wrong options the 50/50 joker strikes out.
 * The correct answer is never a candidate, and already-disabled options are
 * skipped so the joker cannot "spend" itself on an option that was already gone.
 * @param {import('./types').ActiveQuestion} aq
 * @returns {string[]}
 */
function pickWrongOptionsToRemove(aq) {
  const candidates = OPTION_KEYS.filter(
    (o) => o !== aq.question.answer && !aq.disabledOptions.includes(o),
  );
  // Fisher-Yates over a copy: which two go is meant to be unpredictable.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, JOKER_FIFTY_FIFTY_REMOVES);
}

// ---------------------------------------------------------------------------
// Rematch (PBI 8)
// ---------------------------------------------------------------------------

/**
 * Wipe match progress while keeping the room itself intact.
 *
 * Kept on purpose: room code, players, team assignments, captains and hostId.
 * Everyone already agreed on those; making them redo team selection is exactly
 * the friction a rematch button exists to remove.
 *
 * @param {import('./types').Room} room
 */
function resetForRematch(room) {
  if (room.activeQuestion?.timerHandle) clearTimeout(room.activeQuestion.timerHandle);
  if (room.activeQuestion?.tickHandle) clearInterval(room.activeQuestion.tickHandle);
  if (room.surrenderVote?.timeoutHandle) clearTimeout(room.surrenderVote.timeoutHandle);

  room.teams.blue.score = 0;
  room.teams.red.score = 0;
  room.usedQuestionIds = [];
  room.usedCategories = [];
  room.selectedCategory = null;
  room.activeQuestion = null;
  room.surrenderVote = null;
  room.categoryPickTeam = null;
  room.categoryAnswerCount = { blue: 0, red: 0 };
  room.stealCharges = { blue: STEAL_CHARGES_PER_TEAM, red: STEAL_CHARGES_PER_TEAM };
  room.jokers = { blue: createJokerState(), red: createJokerState() };
  room.rematch = { blue: false, red: false };
  room.activeTeam = null;
  room.turnTeam = null;
  room.coinTossWinner = null;
  room.phase = 'coin_toss';
  room.lastActivityAt = Date.now();
}

/**
 * Register one team's consent to a rematch. Both teams must agree before the
 * match restarts — a single player must not be able to drag the other side into
 * another round.
 *
 * Any connected player on a team can register that team's consent rather than
 * only its captain: at the end of a match the captain may well have closed the
 * tab, and a rematch is not a competitive decision that needs protecting.
 *
 * @param {import('./types').Room} room
 * @param {string} playerId
 * @returns {{ error?: string, room?: import('./types').Room, bothAgreed?: boolean }}
 */
function requestRematch(room, playerId) {
  if (room.phase !== 'finished') return { error: 'A rematch can only be started after the match ends.' };

  const player = room.players[playerId];
  if (!player) return { error: 'Player not found.' };
  if (!player.team) return { error: 'Only players on a team can ask for a rematch.' };

  if (!room.rematch) room.rematch = { blue: false, red: false };
  if (room.rematch[player.team]) return { error: 'Your team has already agreed to a rematch.' };

  // A team with nobody left connected cannot consent, so the other side would
  // wait forever. Refuse up front instead of showing a button that does nothing.
  const opponent = player.team === 'blue' ? 'red' : 'blue';
  const opponentConnected = room.teams[opponent].players.some(
    (id) => room.players[id]?.isConnected,
  );
  if (!opponentConnected) return { error: 'The other team has left the room.' };

  room.rematch[player.team] = true;
  room.lastActivityAt = Date.now();

  const bothAgreed = room.rematch.blue && room.rematch.red;
  return { room, bothAgreed };
}

// ---------------------------------------------------------------------------
// Win Condition
// ---------------------------------------------------------------------------

/**
 * @param {import('./types').Room} room
 * @returns {boolean}
 */
function checkWin(room) {
  return room.teams.blue.score >= 100 || room.teams.red.score >= 100;
}

module.exports = {
  isRateLimited,
  castCaptainVote,
  tryResolveCaptainElection,
  forceResolveCaptainElection,
  lockTeams,
  resolveCoinToss,
  pickCategory,
  startQuestion,
  scheduleQuestionTimers,
  useJoker,
  createJokerState,
  openCategoryPick,
  isCategoryComplete,
  resetQuestionTimer,
  castVote,
  resolveVote,
  passSteal,
  requestRematch,
  resetForRematch,
  checkWin,
  QUESTION_SECONDS,
  STEAL_SECONDS,
  STEAL_CHARGES_PER_TEAM,
  QUESTIONS_PER_CATEGORY_PER_TEAM,
  JOKER_EXTRA_SECONDS,
  JOKER_FIFTY_FIFTY_REMOVES,
};
