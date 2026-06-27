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
} = require('./roomManager');
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
} = require('./gameLogic');

const PORT = parseInt(process.env.SOCKET_PORT || '3001', 10);
const CLIENT_URL = process.env.CLIENT_URL || /^http:\/\/localhost(:\d+)?$/;

// ---------------------------------------------------------------------------
// HTTP + Socket.io Setup
// ---------------------------------------------------------------------------

const httpServer = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
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
  return ['general', 'sports', 'history', 'cinema_music'].includes(val);
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
  room.teams[winner].score = Math.max(room.teams[winner].score, 100);
  room.phase = 'finished';
  room.lastActivityAt = Date.now();
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

    const { roomCode, playerId, room } = createRoom(payload.playerName, socket.id);
    socketToPlayer.set(socket.id, { roomCode, playerId });
    socket.join(roomCode);

    console.log(`[Room] Created: ${roomCode} by ${room.players[playerId].name}`);
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
    const result = joinRoom(code, payload.playerName, socket.id);

    if (result.error) return socket.emit('room:error', { message: result.error });

    socketToPlayer.set(socket.id, { roomCode: code, playerId: result.playerId });
    socket.join(code);

    console.log(`[Room] ${result.room.players[result.playerId].name} joined: ${code}`);

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

    socket.emit('room:joined', { playerId: payload.playerId, room: sanitizeRoom(room) });
    socket.to(code).emit('room:update', sanitizeRoom(room));
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
    if (!player?.team) return socket.emit('game:error', { message: 'You are not in a team.' });

    const team = player.team;

    if (room.surrenderVote?.team === team) {
      return socket.emit('game:error', { message: 'A surrender vote is already in progress.' });
    }

    const connected = room.teams[team].players.filter((id) => room.players[id]?.isConnected);

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
    if (room.surrenderVote.votes[context.playerId] !== undefined) {
      return socket.emit('game:error', { message: 'You have already voted.' });
    }

    room.surrenderVote.votes[context.playerId] = payload.vote;

    const team = room.surrenderVote.team;
    const connected = room.teams[team].players.filter((id) => room.players[id]?.isConnected);
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

httpServer.listen(PORT, () => {
  console.log(`\n🎯 Quizzy Socket.io server running on port ${PORT}`);
  console.log(`   CORS origin: all localhost ports\n`);
});
