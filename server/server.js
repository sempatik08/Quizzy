'use strict';

/**
 * Quizzy — Socket.io Game Server
 *
 * Runs independently from the Next.js frontend.
 * Start with: node server/server.js
 *
 * Security practices enforced:
 *  - All incoming payloads are validated before processing.
 *  - Correct answers are NEVER sent to clients until vote resolution.
 *  - All game state mutations are server-authoritative.
 *  - Rate limiting prevents vote/action spamming.
 *  - Stale rooms are cleaned up every 30 minutes.
 */

const http = require('http');
const { Server } = require('socket.io');
const { CATEGORY_KEYS } = require('./questions');
const { EMOJI_COOLDOWN_MS, isValidEmoji } = require('./emoji');
const { isValidMode, MODE_KEYS, DEFAULT_MODE } = require('./gameModes');
const {
  createRoom,
  joinRoom,
  reconnectPlayer,
  disconnectPlayer,
  joinTeam,
  leaveTeam,
  startCaptainElection,
  getRoom,
  sanitizeRoom,
  cleanupStaleRooms,
  adoptRoom,
} = require('./roomManager');
const store = require('./store');
const stats = require('./stats');
const analytics = require('./analytics');
const {
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
  passSteal,
  placeWager,
  activeRoster,
  scheduleQuestionTimers,
  getWinThreshold,
  useJoker,
  requestRematch,
  resetForRematch,
} = require('./gameLogic');

// Railway/Render/Heroku-style platforms inject PORT and route traffic only to
// that port; SOCKET_PORT stays the override for local dev and Docker.
const PORT = parseInt(process.env.PORT || process.env.SOCKET_PORT || '3001', 10);
const CLIENT_URL = process.env.CLIENT_URL || /^http:\/\/localhost(:\d+)?$/;

// ---------------------------------------------------------------------------
// HTTP + Socket.io Setup
// ---------------------------------------------------------------------------

/**
 * Analytics is served over HTTP rather than a socket event so it cannot be
 * fetched by anyone who happens to be in a room, and it requires
 * ANALYTICS_TOKEN. With no token configured the route does not exist at all —
 * an unauthenticated default would publish the whole question-quality dataset,
 * including which answers people get wrong.
 */
const ANALYTICS_TOKEN = process.env.ANALYTICS_TOKEN || null;

function timingSafeEqual(a, b) {
  // Compare every character regardless of mismatch position, so the response
  // time does not reveal how much of a guessed token was right.
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const httpServer = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  if (req.url && req.url.startsWith('/analytics')) {
    if (!ANALYTICS_TOKEN) {
      res.writeHead(404);
      res.end();
      return;
    }
    let token = null;
    try {
      token = new URL(req.url, 'http://localhost').searchParams.get('token');
    } catch {
      token = null;
    }
    if (!timingSafeEqual(token ?? '', ANALYTICS_TOKEN)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const { QUESTIONS } = require('./questions');
    analytics
      .buildReport(QUESTIONS)
      .then((report) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(report, null, 2));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
  // Limit payload size to prevent abuse
  maxHttpBufferSize: 1e4, // 10 KB
});

// ---------------------------------------------------------------------------
// Socket → Player index (survives reconnects)
// socketId → { roomCode, playerId }
// ---------------------------------------------------------------------------
const socketToPlayer = new Map();

// ---------------------------------------------------------------------------
// Stale room cleanup (every 30 minutes)
// ---------------------------------------------------------------------------
setInterval(cleanupStaleRooms, 30 * 60 * 1000);

// ---------------------------------------------------------------------------
// Input Validators
// ---------------------------------------------------------------------------

function isValidString(val, min, max) {
  return typeof val === 'string' && val.length >= min && val.length <= max;
}

function isValidCategory(val) {
  return CATEGORY_KEYS.includes(val);
}

/** playerId -> last reaction timestamp, for the per-player emoji cooldown. */
const emojiLastSent = new Map();

/**
 * Pull the guest profile identity out of a join payload (PBI 14).
 *
 * Both fields are optional and independently validated, so a client with no
 * profile, an old client, or a hand-rolled one sending nonsense all end up
 * playing normally — just without stats.
 */
function identityFrom(payload) {
  return {
    profileId: stats.isValidProfileId(payload?.profileId) ? payload.profileId : null,
    avatar: stats.isValidAvatar(payload?.avatar) ? payload.avatar : null,
  };
}

function isValidJoker(val) {
  return ['fifty_fifty', 'extra_time'].includes(val);
}

function isValidOption(val) {
  return typeof val === 'string' && ['A', 'B', 'C', 'D', 'E'].includes(val.toUpperCase());
}

// ---------------------------------------------------------------------------
// Surrender Helper
// ---------------------------------------------------------------------------

/**
 * Immediately end the game by surrender. The surrendering team loses;
 * the winning team's score is raised to 100 so WinnerScreen triggers.
 * @param {import('./types').Room} room
 * @param {'blue' | 'red'} surrenderingTeam
 */
function executeSurrender(room, surrenderingTeam) {
  if (room.activeQuestion?.timerHandle) clearTimeout(room.activeQuestion.timerHandle);
  if (room.activeQuestion?.tickHandle)  clearInterval(room.activeQuestion.tickHandle);
  room.activeQuestion = null;
  room.surrenderVote  = null;

  const winner = surrenderingTeam === 'blue' ? 'red' : 'blue';
  // Raise to the mode's win threshold, not a literal 100 — otherwise a Fast-mode
  // surrender would overshoot and a higher-threshold mode would not end at all.
  const target = getWinThreshold(room);
  room.teams[winner].score = Math.max(room.teams[winner].score, target);
  room.phase = 'finished';
  room.lastActivityAt = Date.now();

  // Record the result (PBI 14). recordMatch is idempotent per room, so the three
  // routes to a finish - points, surrender, Survival wipeout - cannot double
  // count. Fire and forget: the players are looking at the winner screen and
  // must not wait on a stats write.
  stats.recordMatch(room).catch((err) => console.warn(`[Stats] record failed: ${err.message}`));
  if (!room.analyticsRecorded) {
    room.analyticsRecorded = true;
    analytics.recordMatchEnd(room);
  }
}

// ---------------------------------------------------------------------------
// Connection Handler
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // ----- Helper: resolve player context from socket -----
  function ctx() {
    return socketToPlayer.get(socket.id) || null;
  }

  // ----- Helper: broadcast room update -----
  function broadcast(room) {
    io.to(room.code).emit('room:update', sanitizeRoom(room));
    // Persist behind the broadcast (PBI 13): every state change that matters
    // already passes through here on its way to the clients, so what the players
    // were told is exactly what gets stored. Fire and forget - a store that is
    // down must not stall or break the match.
    store.saveRoom(room);
  }

  // =========================================================================
  // ROOM MANAGEMENT
  // =========================================================================

  /**
   * Create a new room.
   * Payload: { playerName: string }
   */
  socket.on('room:create', (payload) => {
    if (!payload || !isValidString(payload.playerName, 1, 20)) {
      return socket.emit('room:error', { message: 'Player name must be 1–20 characters.' });
    }
    // An unknown mode is refused rather than silently downgraded to classic: a
    // player who picked Survival and got Classic would not find out until the
    // rules failed to apply (PBI 9).
    if (payload.mode !== undefined && !isValidMode(payload.mode)) {
      return socket.emit('room:error', {
        message: `Unknown game mode. Choose one of: ${MODE_KEYS.join(', ')}.`,
      });
    }

    const identity = identityFrom(payload);
    const { roomCode, playerId, room } = createRoom(
      payload.playerName,
      socket.id,
      payload.mode ?? DEFAULT_MODE,
      identity,
    );
    if (identity.profileId) {
      // Fire and forget: a stats write must never delay entering a room.
      stats.touchProfile(identity.profileId, payload.playerName, identity.avatar)
        .catch((err) => console.warn(`[Stats] touchProfile failed: ${err.message}`));
    }
    socketToPlayer.set(socket.id, { roomCode, playerId });
    socket.join(roomCode);

    console.log(`[Room] Created: ${roomCode} by ${room.players[playerId].name} (${room.mode})`);
    socket.emit('room:created', { roomCode, playerId, room: sanitizeRoom(room) });
  });

  /**
   * Join an existing room.
   * Payload: { roomCode: string, playerName: string }
   */
  socket.on('room:join', (payload) => {
    if (!payload) return socket.emit('room:error', { message: 'Invalid payload.' });
    if (!isValidString(payload.roomCode, 6, 6)) {
      return socket.emit('room:error', { message: 'Room code must be exactly 6 characters.' });
    }
    if (!isValidString(payload.playerName, 1, 20)) {
      return socket.emit('room:error', { message: 'Player name must be 1–20 characters.' });
    }

    const code = payload.roomCode.toUpperCase();
    // Spectator is opt-in and boolean-coerced: a truthy string from a hand-rolled
    // client must not smuggle in anything but a spectator flag (PBI 10).
    const asSpectator = payload.asSpectator === true;
    const identity = identityFrom(payload);
    const result = joinRoom(code, payload.playerName, socket.id, asSpectator, identity);

    if (result.error) return socket.emit('room:error', { message: result.error });

    socketToPlayer.set(socket.id, { roomCode: code, playerId: result.playerId });
    socket.join(code);

    if (identity.profileId) {
      stats.touchProfile(identity.profileId, payload.playerName, identity.avatar)
        .catch((err) => console.warn(`[Stats] touchProfile failed: ${err.message}`));
    }

    console.log(
      `[Room] ${result.room.players[result.playerId].name} joined: ${code}` +
        `${asSpectator ? ' (spectator)' : ''}`,
    );

    // Notify the joining player
    socket.emit('room:joined', { playerId: result.playerId, room: sanitizeRoom(result.room) });
    // Notify other players
    socket.to(code).emit('room:update', sanitizeRoom(result.room));
  });

  /**
   * Re-attach a socket to an existing player record after page refresh.
   * Payload: { roomCode: string, playerId: string }
   */
  socket.on('room:reconnect', (payload) => {
    if (!payload) return socket.emit('room:error', { message: 'Invalid payload.' });
    if (!isValidString(payload.roomCode, 6, 6)) {
      return socket.emit('room:error', { message: 'Invalid room code.' });
    }
    if (!isValidString(payload.playerId, 36, 36)) {
      return socket.emit('room:error', { message: 'Invalid player ID.' });
    }

    const code = payload.roomCode.toUpperCase();
    const room = reconnectPlayer(code, payload.playerId, socket.id);
    if (!room) return socket.emit('room:error', { message: 'Room or player not found.' });

    socketToPlayer.set(socket.id, { roomCode: code, playerId: payload.playerId });
    socket.join(code);

    // A room whose last player dropped has its question timers cleared (see
    // disconnectPlayer), and a room restored from the store never had any. Give
    // the question its clock back on the first reconnect, restarting the window
    // rather than resuming it — the players were not there for the time that
    // passed, so resolving immediately would score a question nobody saw.
    if (room.phase === 'question' && room.activeQuestion
        && !room.activeQuestion.timerHandle && !room.activeQuestion.wagerPending) {
      room.activeQuestion.timerStart = Date.now();
      room.activeQuestion.timeLeft = room.activeQuestion.duration;
      room.activeQuestion.resolving = false;
      scheduleQuestionTimers(room, io);
      console.log(`[Room] Re-armed question timer for ${code} on reconnect`);
    }

    socket.emit('room:joined', { playerId: payload.playerId, room: sanitizeRoom(room) });
    socket.to(code).emit('room:update', sanitizeRoom(room));
    store.saveRoom(room);
    console.log(`[Room] Player reconnected to ${code}`);
  });

  // =========================================================================
  // TEAM MANAGEMENT
  // =========================================================================

  /**
   * Player joins a team.
   * Payload: { roomCode: string, team: 'blue' | 'red' }
   */
  socket.on('team:join', (payload) => {
    const context = ctx();
    if (!context) return socket.emit('room:error', { message: 'Not in a room.' });
    if (!payload || !['blue', 'red'].includes(payload.team)) {
      return socket.emit('game:error', { message: 'Invalid team.' });
    }
    if (isRateLimited(context.playerId)) return;

    // A spectator can still take a team while the room is in the lobby; once the
    // match has started, say so plainly instead of returning a phase error.
    const joining = getRoom(context.roomCode);
    const joiner = joining?.players?.[context.playerId];
    if (joiner?.isSpectator && joining.phase !== 'lobby') {
      return socket.emit('game:error', {
        message: 'Spectators cannot join a team once the match has started.',
      });
    }

    const result = joinTeam(context.roomCode, context.playerId, payload.team);
    if (result.error) return socket.emit('game:error', { message: result.error });

    const room = result.room;
    const teamState = room.teams[payload.team];

    // Trigger captain election when team reaches 2 players
    if (teamState.players.length >= 2 && !teamState.captain) {
      startCaptainElection(context.roomCode, payload.team, (roomCode, team) => {
        const r = getRoom(roomCode);
        if (!r) return;
        forceResolveCaptainElection(r, team);
        io.to(roomCode).emit('room:update', sanitizeRoom(r));
      });
    }

    broadcast(room);
  });

  /**
   * Player leaves their team.
   * Payload: { roomCode: string }
   */
  socket.on('team:leave', (payload) => {
    const context = ctx();
    if (!context) return;
    if (isRateLimited(context.playerId)) return;

    const result = leaveTeam(context.roomCode, context.playerId);
    if (result.error) return socket.emit('game:error', { message: result.error });

    broadcast(result.room);
  });

  // =========================================================================
  // CAPTAIN ELECTION
  // =========================================================================

  /**
   * Vote for a captain within your team.
   * Payload: { roomCode: string, nomineeId: string }
   */
  socket.on('captain:vote', (payload) => {
    const context = ctx();
    if (!context) return;
    if (!payload || !isValidString(payload.nomineeId, 36, 36)) {
      return socket.emit('game:error', { message: 'Invalid nominee ID.' });
    }
    if (isRateLimited(context.playerId)) return;

    const room = getRoom(context.roomCode);
    if (!room) return socket.emit('room:error', { message: 'Room not found.' });

    const result = castCaptainVote(room, context.playerId, payload.nomineeId);
    if (result.error) return socket.emit('game:error', { message: result.error });

    // Check resolution (majority may have been reached)
    const voter = room.players[context.playerId];
    if (voter?.team) {
      const resolved = tryResolveCaptainElection(room, voter.team);
      if (resolved) {
        // Election done — clear the timeout
        const { clearCaptainElection } = require('./roomManager');
        clearCaptainElection(context.roomCode, voter.team);
      }
    }

    broadcast(room);
  });

  // =========================================================================
  // GAME FLOW
  // =========================================================================

  /**
   * Host locks teams and triggers the coin toss.
   * Payload: { roomCode: string }
   */
  socket.on('teams:lock', (payload) => {
    const context = ctx();
    if (!context) return;

    const room = getRoom(context.roomCode);
    if (!room) return socket.emit('room:error', { message: 'Room not found.' });

    const lockResult = lockTeams(room, context.playerId);
    if (lockResult.error) return socket.emit('game:error', { message: lockResult.error });

    console.log(`[Game] Teams locked in room ${context.roomCode}`);
    broadcast(room);

    // Coin toss after a 2s dramatic pause
    setTimeout(() => {
      const { winner } = resolveCoinToss(room);
      console.log(`[Game] Coin toss winner in ${context.roomCode}: ${winner}`);
      broadcast(room);
    }, 2000);
  });

  /**
   * Winning captain selects a quiz category.
   * Payload: { roomCode: string, category: string }
   */
  socket.on('category:pick', (payload) => {
    const context = ctx();
    if (!context) return;
    if (!payload || !isValidCategory(payload.category)) {
      return socket.emit('game:error', { message: 'Invalid category.' });
    }

    const room = getRoom(context.roomCode);
    if (!room) return socket.emit('room:error', { message: 'Room not found.' });

    const result = pickCategory(room, context.playerId, payload.category);
    if (result.error) return socket.emit('game:error', { message: result.error });

    console.log(`[Game] Category selected in ${context.roomCode}: ${payload.category}`);

    // Broadcast the phase change, then start the first question
    broadcast(room);
    startQuestion(room, io);
    broadcast(room);
  });

  /**
   * Player submits a vote for an answer option.
   * Payload: { roomCode: string, optionKey: string }
   */
  socket.on('vote:cast', (payload) => {
    const context = ctx();
    if (!context) return;
    if (!payload || !isValidOption(payload.optionKey)) {
      return socket.emit('game:error', { message: 'Invalid option.' });
    }
    if (isRateLimited(context.playerId)) return;

    const room = getRoom(context.roomCode);
    if (!room) return socket.emit('room:error', { message: 'Room not found.' });

    if (room.players[context.playerId]?.isSpectator) {
      return socket.emit('game:error', { message: 'Spectators cannot vote.' });
    }

    const result = castVote(room, context.playerId, payload.optionKey);
    if (result.error) return socket.emit('game:error', { message: result.error });

    // Broadcast updated vote state to room
    broadcast(room);

    // If all active team members have voted, resolve immediately
    if (result.allVoted) {
      resolveVote(room, io);
    }
  });

  // Player finalizes team vote early (captain or any active team member)
  socket.on('vote:finalize', () => {
    const context = ctx();
    if (!context) return;

    const room = getRoom(context.roomCode);
    if (!room) return socket.emit('room:error', { message: 'Room not found.' });
    if (room.phase !== 'question') return;

    const player = room.players[context.playerId];
    if (!player || player.team !== room.activeTeam) {
      return socket.emit('game:error', { message: 'Not your team\'s turn.' });
    }

    // At least one vote must exist before finalizing
    const teamPlayers = room.teams[room.activeTeam].players;
    const hasVotes = teamPlayers.some((id) => room.activeQuestion?.votes[id]);
    if (!hasVotes) {
      return socket.emit('game:error', { message: 'Your team must vote before finalizing.' });
    }

    resolveVote(room, io);
  });

  /**
   * Decline a steal opportunity. Free — no charge is spent.
   */
  socket.on('steal:pass', () => {
    const context = ctx();
    if (!context) return;
    if (isRateLimited(context.playerId)) return;

    const room = getRoom(context.roomCode);
    if (!room) return socket.emit('room:error', { message: 'Room not found.' });
    if (room.phase !== 'question') return;

    if (room.players[context.playerId]?.isSpectator) {
      return socket.emit('game:error', { message: 'Spectators cannot pass a steal.' });
    }

    const result = passSteal(room, context.playerId, io);
    if (result.error) return socket.emit('game:error', { message: result.error });
  });

  // =========================================================================
  // PROFILE, HISTORY, LEADERBOARD (PBI 14)
  // =========================================================================

  /**
   * Save the name and avatar this device plays under.
   * Payload: { profileId, name, avatar }
   */
  socket.on('profile:save', async (payload) => {
    if (!payload || !stats.isValidProfileId(payload.profileId)) {
      return socket.emit('game:error', { message: 'Invalid profile.' });
    }
    if (!isValidString(payload.name, 1, 20)) {
      return socket.emit('game:error', { message: 'Name must be 1-20 characters.' });
    }
    if (payload.avatar !== undefined && !stats.isValidAvatar(payload.avatar)) {
      return socket.emit('game:error', { message: 'Unknown avatar.' });
    }

    try {
      const profile = await stats.touchProfile(payload.profileId, payload.name, payload.avatar);
      // The id is echoed back only to the socket that supplied it.
      socket.emit('profile:data', { profile });
    } catch (err) {
      console.warn(`[Stats] profile:save failed: ${err.message}`);
      socket.emit('game:error', { message: 'Could not save your profile.' });
    }
  });

  /**
   * This device's own record and rank.
   * Payload: { profileId }
   */
  socket.on('profile:get', async (payload) => {
    if (!payload || !stats.isValidProfileId(payload.profileId)) {
      return socket.emit('game:error', { message: 'Invalid profile.' });
    }
    try {
      const standing = await stats.getMyStanding(payload.profileId);
      socket.emit('profile:data', { profile: standing });
    } catch (err) {
      console.warn(`[Stats] profile:get failed: ${err.message}`);
      socket.emit('profile:data', { profile: null });
    }
  });

  /**
   * This device's recent matches.
   * Payload: { profileId }
   */
  socket.on('profile:history', async (payload) => {
    if (!payload || !stats.isValidProfileId(payload.profileId)) {
      return socket.emit('game:error', { message: 'Invalid profile.' });
    }
    try {
      const matches = await stats.getHistory(payload.profileId);
      socket.emit('profile:history:data', { matches });
    } catch (err) {
      console.warn(`[Stats] profile:history failed: ${err.message}`);
      socket.emit('profile:history:data', { matches: [] });
    }
  });

  /**
   * The global board. Takes no profile id - it is public, and entries carry no
   * ids, only names and records.
   */
  socket.on('leaderboard:get', async () => {
    try {
      const board = await stats.getLeaderboard();
      socket.emit('leaderboard:data', board);
    } catch (err) {
      console.warn(`[Stats] leaderboard failed: ${err.message}`);
      socket.emit('leaderboard:data', { entries: [], total: 0 });
    }
  });

  // =========================================================================
  // WAGER (PBI 9 - Wager mode)
  // =========================================================================

  /**
   * Stake points on the still-hidden question.
   * Payload: { amount: number }
   */
  socket.on('wager:place', (payload) => {
    const context = ctx();
    if (!context) return;
    if (!payload || !Number.isInteger(payload.amount)) {
      return socket.emit('game:error', { message: 'Invalid wager.' });
    }
    if (isRateLimited(context.playerId)) return;

    const room = getRoom(context.roomCode);
    if (!room) return socket.emit('room:error', { message: 'Room not found.' });

    const result = placeWager(room, context.playerId, payload.amount, io);
    if (result.error) return socket.emit('game:error', { message: result.error });

    console.log(`[Game] Wager ${payload.amount} placed in ${room.code}`);
    // This broadcast is what finally reveals the question text, since
    // sanitizeRoom withholds it while wagerPending is set.
    broadcast(room);
  });

  // =========================================================================
  // EMOJI REACTIONS (PBI 11)
  // =========================================================================

  /**
   * Send a reaction to everyone in the room.
   * Payload: { emoji: <one of ALLOWED_EMOJI> }
   *
   * Room-wide rather than team-only: the default match is 1v1, where a
   * team-only reaction would be visible to nobody. Reactions carry no
   * information about the answer, so there is no advantage to leak.
   *
   * Reactions are deliberately NOT stored on the room. They are ephemeral, so
   * keeping a list would grow room state forever, get cloned by sanitizeRoom on
   * every emit, and replay stale reactions to anyone who reconnects.
   */
  socket.on('emoji:send', (payload) => {
    const context = ctx();
    if (!context) return;
    if (!payload || !isValidEmoji(payload.emoji)) {
      return socket.emit('game:error', { message: 'Invalid reaction.' });
    }

    const room = getRoom(context.roomCode);
    if (!room) return socket.emit('room:error', { message: 'Room not found.' });

    const player = room.players[context.playerId];
    if (!player) return socket.emit('game:error', { message: 'Player not found.' });

    const now = Date.now();
    const last = emojiLastSent.get(context.playerId) || 0;
    if (now - last < EMOJI_COOLDOWN_MS) {
      // Dropped silently: an error toast on every fast tap would be worse spam
      // than the reaction it is refusing.
      return;
    }
    emojiLastSent.set(context.playerId, now);

    io.to(room.code).emit('emoji:reaction', {
      id: `${context.playerId}-${now}`,
      playerId: context.playerId,
      playerName: player.name,
      team: player.team,
      emoji: payload.emoji,
      at: now,
    });
  });

  // =========================================================================
  // JOKERS (PBI 6)
  // =========================================================================

  /**
   * Spend a joker on the current question.
   * Payload: { type: 'fifty_fifty' | 'extra_time' }
   */
  socket.on('joker:use', (payload) => {
    const context = ctx();
    if (!context) return;
    if (!payload || !isValidJoker(payload.type)) {
      return socket.emit('game:error', { message: 'Invalid joker.' });
    }
    if (isRateLimited(context.playerId)) return;

    const room = getRoom(context.roomCode);
    if (!room) return socket.emit('room:error', { message: 'Room not found.' });

    if (room.players[context.playerId]?.isSpectator) {
      return socket.emit('game:error', { message: 'Spectators cannot use jokers.' });
    }

    const result = useJoker(room, context.playerId, payload.type, io);
    if (result.error) return socket.emit('game:error', { message: result.error });

    console.log(`[Game] Joker ${payload.type} used in ${room.code}`);

    // ANTI-CHEAT: the removed options go out via the sanitized room state
    // (disabledOptions), never as a separate payload naming the answer.
    broadcast(room);
  });

  // =========================================================================
  // REMATCH (PBI 8)
  // =========================================================================

  /**
   * Agree to replay the match. Restarts only once BOTH teams have agreed.
   * Keeps the room code, players, teams and captains; everything else resets.
   */
  socket.on('rematch:request', () => {
    const context = ctx();
    if (!context) return;
    if (isRateLimited(context.playerId)) return;

    const room = getRoom(context.roomCode);
    if (!room) return socket.emit('room:error', { message: 'Room not found.' });

    if (room.players[context.playerId]?.isSpectator) {
      return socket.emit('game:error', { message: 'Spectators cannot start a rematch.' });
    }

    const result = requestRematch(room, context.playerId);
    if (result.error) return socket.emit('game:error', { message: result.error });

    if (!result.bothAgreed) {
      // Show the other team that one side is waiting on them.
      broadcast(room);
      return;
    }

    resetForRematch(room);
    console.log(`[Game] Rematch starting in ${room.code}`);
    broadcast(room);

    // Same 2s pause as the initial toss, so the reused coin_toss screen reads
    // the same way it does on the first match.
    setTimeout(() => {
      const current = getRoom(context.roomCode);
      if (!current || current.phase !== 'coin_toss') return;
      const { winner } = resolveCoinToss(current);
      console.log(`[Game] Rematch coin toss in ${current.code}: ${winner}`);
      broadcast(current);
    }, 2000);
  });

  // =========================================================================
  // SURRENDER
  // =========================================================================

  /**
   * Initiate a surrender. If the player is solo on their team, surrender is
   * immediate. Otherwise a vote is opened; 51% yes votes required.
   */
  socket.on('surrender:initiate', () => {
    const context = ctx();
    if (!context) return;

    const room = getRoom(context.roomCode);
    if (!room) return socket.emit('room:error', { message: 'Room not found.' });
    if (room.phase !== 'question') {
      return socket.emit('game:error', { message: 'You can only surrender during an active game.' });
    }

    const player = room.players[context.playerId];
    if (player?.isSpectator) {
      return socket.emit('game:error', { message: 'Spectators cannot surrender.' });
    }
    if (!player?.team) return socket.emit('game:error', { message: 'You are not in a team.' });

    const team = player.team;

    if (room.surrenderVote?.team === team) {
      return socket.emit('game:error', { message: 'A surrender vote is already in progress.' });
    }

    // Eliminated players (Survival) cannot vote, so counting them would push the
    // threshold out of reach and cancel every surrender vote as impossible.
    const connected = activeRoster(room, team).filter((id) => room.players[id]?.isConnected);

    if (connected.length === 1) {
      // Solo player — surrender immediately
      executeSurrender(room, team);
      broadcast(room);
      return;
    }

    // Multi-player — open a vote; initiator auto-votes yes
    if (room.surrenderVote?.timeoutHandle) clearTimeout(room.surrenderVote.timeoutHandle);

    room.surrenderVote = {
      team,
      votes: { [context.playerId]: true },
      timeoutHandle: setTimeout(() => {
        if (!room.surrenderVote || room.surrenderVote.team !== team) return;
        room.surrenderVote = null;
        broadcast(room);
      }, 30_000),
    };

    broadcast(room);
  });

  /**
   * Cast a yes/no vote on the active surrender vote.
   * Payload: { vote: boolean }
   */
  socket.on('surrender:vote', (payload) => {
    const context = ctx();
    if (!context) return;
    if (!payload || typeof payload.vote !== 'boolean') {
      return socket.emit('game:error', { message: 'Invalid vote payload.' });
    }

    const room = getRoom(context.roomCode);
    if (!room) return socket.emit('room:error', { message: 'Room not found.' });
    if (!room.surrenderVote) return socket.emit('game:error', { message: 'No active surrender vote.' });

    const player = room.players[context.playerId];
    if (!player || player.team !== room.surrenderVote.team) {
      return socket.emit('game:error', { message: "Not your team's vote." });
    }
    if (player.isEliminated) {
      return socket.emit('game:error', { message: 'You have been eliminated.' });
    }
    if (room.surrenderVote.votes[context.playerId] !== undefined) {
      return socket.emit('game:error', { message: 'You have already voted.' });
    }

    room.surrenderVote.votes[context.playerId] = payload.vote;

    const team = room.surrenderVote.team;
    const connected = activeRoster(room, team).filter((id) => room.players[id]?.isConnected);
    const threshold = Math.ceil(connected.length * 0.51);
    const yesCount = Object.values(room.surrenderVote.votes).filter(Boolean).length;
    const noCount  = Object.values(room.surrenderVote.votes).filter((v) => v === false).length;

    if (yesCount >= threshold) {
      // Threshold reached — surrender
      clearTimeout(room.surrenderVote.timeoutHandle);
      room.surrenderVote = null;
      executeSurrender(room, team);
    } else if (connected.length - noCount < threshold) {
      // Impossible to reach threshold — cancel vote
      clearTimeout(room.surrenderVote.timeoutHandle);
      room.surrenderVote = null;
    }

    broadcast(room);
  });

  // =========================================================================
  // DISCONNECT
  // =========================================================================

  socket.on('disconnect', (reason) => {
    const context = socketToPlayer.get(socket.id);
    socketToPlayer.delete(socket.id);

    if (!context) return;

    // Otherwise the cooldown map grows for the life of the process.
    emojiLastSent.delete(context.playerId);

    const room = disconnectPlayer(context.roomCode, context.playerId);
    if (room) {
      broadcast(room);
    }

    console.log(`[-] Socket disconnected: ${socket.id} (${reason})`);
  });
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

/**
 * Bring stored rooms back into play and re-arm their server-side timers (PBI 13).
 *
 * Timers are process-local, so a restored question has no clock until one is
 * scheduled here. deserializeRoom has already restarted the window from now —
 * see the note there about not resolving a question nobody could answer.
 */
function restoreRooms(rooms) {
  let restored = 0;
  let armed = 0;

  for (const room of rooms) {
    if (!adoptRoom(room)) continue;
    restored++;

    if (room.phase === 'question' && room.activeQuestion) {
      // A Wager-mode question still waiting on its stake has no clock to arm.
      if (!room.activeQuestion.wagerPending) {
        scheduleQuestionTimers(room, io);
        armed++;
      }
    }
  }

  if (restored > 0) {
    console.log(`[Store] Restored ${restored} room(s), re-armed ${armed} question timer(s)`);
  }
  return restored;
}

/** Flush pending writes on the way out so the last state is not lost. */
function installShutdownHooks() {
  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`\n[Server] ${signal} received, flushing store...`);
    try {
      analytics.stopAnalyticsFlusher();
      await analytics.flushAnalytics();
      await store.closeStore();
    } catch (err) {
      console.warn(`[Server] Store flush failed: ${err.message}`);
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function start() {
  const { backend } = await store.initStore();

  try {
    restoreRooms(await store.loadAllRooms());
  } catch (err) {
    // A corrupt or unreachable store must not stop the server from serving new
    // rooms; it only means the old ones are gone.
    console.warn(`[Store] Restore skipped: ${err.message}`);
  }

  installShutdownHooks();
  analytics.startAnalyticsFlusher();

  httpServer.listen(PORT, () => {
    console.log(`\n🎯 Quizzy Socket.io server running on port ${PORT}`);
    console.log(`   CORS origin: all localhost ports`);
    console.log(`   Room persistence: ${backend}`);
    console.log(`   Analytics endpoint: ${ANALYTICS_TOKEN ? '/analytics?token=...' : 'disabled'}\n`);
  });
}

start();
