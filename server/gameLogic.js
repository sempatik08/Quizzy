'use strict';

const { QUESTIONS } = require('./questions');
const { sanitizeRoom } = require('./roomManager');

// ---------------------------------------------------------------------------
// Rate limiting: debounce rapid socket emissions per player
// ---------------------------------------------------------------------------
const playerLastEvent = new Map(); // playerId → timestamp (ms)
const RATE_LIMIT_MS = 500;

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
  const VALID_CATEGORIES = ['general', 'sports', 'history', 'music', 'cinema', 'anime', 'games', 'technology', 'literature', 'math', 'geography'];
  if (!VALID_CATEGORIES.includes(category)) return { error: 'Invalid category.' };
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
  room.phase = 'question';
  room.lastActivityAt = Date.now();
  return { room };
}

// ---------------------------------------------------------------------------
// Question Flow
// ---------------------------------------------------------------------------

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
    const blueScore = room.teams.blue.score;
    const redScore = room.teams.red.score;
    room.categoryPickTeam = blueScore <= redScore ? 'blue' : 'red';
    room.phase = 'category_pick';
    room.activeQuestion = null;
    room.lastActivityAt = Date.now();
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
    timeLeft: 60,
    timerHandle: null,
    tickHandle: null,
  };

  // Emit a tick every second so clients can display a countdown
  room.activeQuestion.tickHandle = setInterval(() => {
    if (!room.activeQuestion) return;
    const elapsed = Math.floor((Date.now() - room.activeQuestion.timerStart) / 1000);
    room.activeQuestion.timeLeft = Math.max(0, 60 - elapsed);
    io.to(room.code).emit('timer_tick', { timeLeft: room.activeQuestion.timeLeft });
    if (room.activeQuestion.timeLeft <= 0) {
      clearInterval(room.activeQuestion.tickHandle);
    }
  }, 1000);

  // Authoritative 60s timeout — server resolves the vote regardless of client state
  room.activeQuestion.timerHandle = setTimeout(() => {
    resolveVote(room, io);
  }, 60_000);
}

/**
 * Reset the timer for the same question (steal phase).
 * @param {import('./types').Room} room
 * @param {import('socket.io').Server} io
 */
function resetQuestionTimer(room, io) {
  if (!room.activeQuestion) return;

  clearTimeout(room.activeQuestion.timerHandle);
  clearInterval(room.activeQuestion.tickHandle);

  room.activeQuestion.timerStart = Date.now();
  room.activeQuestion.timeLeft = 60;
  room.activeQuestion.votes = {};
  room.activeQuestion.resolving = false; // reset guard so steal team can resolve

  room.activeQuestion.tickHandle = setInterval(() => {
    if (!room.activeQuestion) return;
    const elapsed = Math.floor((Date.now() - room.activeQuestion.timerStart) / 1000);
    room.activeQuestion.timeLeft = Math.max(0, 60 - elapsed);
    io.to(room.code).emit('timer_tick', { timeLeft: room.activeQuestion.timeLeft });
    if (room.activeQuestion.timeLeft <= 0) clearInterval(room.activeQuestion.tickHandle);
  }, 1000);

  room.activeQuestion.timerHandle = setTimeout(() => {
    resolveVote(room, io);
  }, 60_000);
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

  const isCorrect = winningOption === question.answer;

  io.to(room.code).emit('answer_reveal', {
    selectedOption: winningOption,
    correctAnswer: question.answer,
    isCorrect,
    activeTeam: room.activeTeam,
  });

  // Transition state after a 2s reveal delay
  setTimeout(() => {
    if (!room.activeQuestion) return; // guard against race conditions

    room.lastActivityAt = Date.now();

    if (isCorrect) {
      room.teams[room.activeTeam].score += 5;

      if (checkWin(room)) {
        room.phase = 'finished';
        room.activeQuestion = null;
        io.to(room.code).emit('room:update', sanitizeRoom(room));
        return;
      }
    }

    // Correct or wrong: advance turnTeam to the other team and start a new question
    const nextTurn = room.turnTeam === 'blue' ? 'red' : 'blue';
    room.turnTeam = nextTurn;
    room.activeTeam = nextTurn;
    room.phase = 'question';
    room.activeQuestion = null;
    startQuestion(room, io);

    io.to(room.code).emit('room:update', sanitizeRoom(room));
  }, 2000);
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
  castVote,
  resolveVote,
  checkWin,
};
