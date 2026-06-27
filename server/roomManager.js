'use strict';

const { randomUUID } = require('crypto');

/** @type {Map<string, import('./types').Room>} */
const rooms = new Map();

// Captain election timeout handles (not stored in room to avoid serialization issues)
const captainElectionHandles = new Map(); // key: `${roomCode}_${team}` → timeout handle

/**
 * Sanitize a player name: strip HTML chars, trim, enforce length.
 * @param {string} name
 * @returns {string}
 */
function sanitizeName(name) {
  if (typeof name !== 'string') return 'Player';
  return name.trim().replace(/[<>"'&\\]/g, '').slice(0, 20) || 'Player';
}

/**
 * Generate a unique 6-character alphanumeric room code.
 * Excludes visually ambiguous characters (0, O, 1, I, L).
 * @returns {string}
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

/**
 * Create a fresh team state.
 * @returns {import('./types').TeamState}
 */
function createTeamState() {
  return {
    players: [],
    captain: null,
    captainVotes: {},
    score: 0,
  };
}

/**
 * Create a new room, returning the room code and the host's player ID.
 * @param {string} playerName
 * @param {string} socketId
 * @returns {{ roomCode: string, playerId: string, room: import('./types').Room }}
 */
function createRoom(playerName, socketId) {
  const roomCode = generateRoomCode();
  const playerId = randomUUID();

  /** @type {import('./types').Player} */
  const player = {
    id: playerId,
    socketId,
    name: sanitizeName(playerName),
    team: null,
    isConnected: true,
  };

  /** @type {import('./types').Room} */
  const room = {
    code: roomCode,
    phase: 'lobby',
    players: { [playerId]: player },
    teams: {
      blue: createTeamState(),
      red: createTeamState(),
    },
    activeTeam: null,
    turnTeam: null,
    coinTossWinner: null,
    selectedCategory: null,
    usedQuestionIds: [],
    usedCategories: [],
    activeQuestion: null,
    surrenderVote: null,
    categoryPickTeam: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    hostId: playerId,
  };

  rooms.set(roomCode, room);
  return { roomCode, playerId, room };
}

/**
 * Join an existing room.
 * @param {string} roomCode
 * @param {string} playerName
 * @param {string} socketId
 * @returns {{ error?: string, playerId?: string, room?: import('./types').Room }}
 */
function joinRoom(roomCode, playerName, socketId) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found.' };
  if (room.phase !== 'lobby') return { error: 'Game is already in progress.' };

  const totalPlayers = Object.keys(room.players).length;
  if (totalPlayers >= 6) return { error: 'Room is full (max 6 players).' };

  const playerId = randomUUID();
  room.players[playerId] = {
    id: playerId,
    socketId,
    name: sanitizeName(playerName),
    team: null,
    isConnected: true,
  };
  room.lastActivityAt = Date.now();

  return { playerId, room };
}

/**
 * Re-link a socket to an existing player record (handles page refresh).
 * @param {string} roomCode
 * @param {string} playerId
 * @param {string} socketId
 * @returns {import('./types').Room | null}
 */
function reconnectPlayer(roomCode, playerId, socketId) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  const player = room.players[playerId];
  if (!player) return null;

  player.socketId = socketId;
  player.isConnected = true;
  room.lastActivityAt = Date.now();
  return room;
}

/**
 * Mark a player as disconnected. Cleans up the room if all players disconnect.
 * @param {string} roomCode
 * @param {string} playerId
 * @returns {import('./types').Room | null} Updated room, or null if room was cleaned up.
 */
function disconnectPlayer(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  const player = room.players[playerId];
  if (player) {
    player.isConnected = false;
    room.lastActivityAt = Date.now();

    // If player was captain mid-game, promote next team member
    if (player.team && room.phase !== 'lobby' && room.phase !== 'finished') {
      const team = room.teams[player.team];
      if (team.captain === playerId) {
        const nextCaptain = team.players.find((id) => id !== playerId && room.players[id]?.isConnected);
        team.captain = nextCaptain || null;
      }
    }
  }

  const allDisconnected = Object.values(room.players).every((p) => !p.isConnected);
  if (allDisconnected) {
    cleanupRoom(roomCode);
    return null;
  }

  return room;
}

/**
 * Move a player to a team. Enforces max 3 players per team.
 * @param {string} roomCode
 * @param {string} playerId
 * @param {'blue' | 'red'} team
 * @returns {{ error?: string, room?: import('./types').Room }}
 */
function joinTeam(roomCode, playerId, team) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found.' };
  if (room.phase !== 'lobby') return { error: 'Cannot change teams after the game has started.' };

  const player = room.players[playerId];
  if (!player) return { error: 'Player not found.' };

  const targetTeam = room.teams[team];
  if (targetTeam.players.length >= 3) return { error: `The ${team} team is full (max 3 players).` };

  // Remove from current team first
  if (player.team) {
    const oldTeam = room.teams[player.team];
    oldTeam.players = oldTeam.players.filter((id) => id !== playerId);
    if (oldTeam.captain === playerId) {
      oldTeam.captain = null;
      oldTeam.captainVotes = {};
    }
    // Cancel any running election for the old team
    clearCaptainElection(roomCode, player.team);
  }

  player.team = team;
  targetTeam.players.push(playerId);
  room.lastActivityAt = Date.now();

  return { room };
}

/**
 * Remove a player from their current team.
 * @param {string} roomCode
 * @param {string} playerId
 * @returns {{ error?: string, room?: import('./types').Room }}
 */
function leaveTeam(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found.' };
  if (room.phase !== 'lobby') return { error: 'Cannot leave team after game has started.' };

  const player = room.players[playerId];
  if (!player || !player.team) return { error: 'You are not in a team.' };

  const team = room.teams[player.team];
  team.players = team.players.filter((id) => id !== playerId);
  if (team.captain === playerId) {
    team.captain = null;
    team.captainVotes = {};
  }

  clearCaptainElection(roomCode, player.team);
  player.team = null;
  room.lastActivityAt = Date.now();

  return { room };
}

/**
 * Cancel an ongoing captain election for a team.
 * @param {string} roomCode
 * @param {'blue' | 'red'} team
 */
function clearCaptainElection(roomCode, team) {
  const key = `${roomCode}_${team}`;
  const handle = captainElectionHandles.get(key);
  if (handle) {
    clearTimeout(handle);
    captainElectionHandles.delete(key);
  }
}

/**
 * Start a captain election for a team with a 60s auto-resolve timeout.
 * Returns the election handle key.
 * @param {string} roomCode
 * @param {'blue' | 'red'} team
 * @param {Function} onResolve Callback invoked when the election resolves (either by vote or timeout).
 */
function startCaptainElection(roomCode, team, onResolve) {
  const key = `${roomCode}_${team}`;
  clearCaptainElection(roomCode, team);

  const handle = setTimeout(() => {
    captainElectionHandles.delete(key);
    onResolve(roomCode, team);
  }, 60_000);

  captainElectionHandles.set(key, handle);
}

/**
 * Get a room by code.
 * @param {string} roomCode
 * @returns {import('./types').Room | undefined}
 */
function getRoom(roomCode) {
  return rooms.get(roomCode);
}

/**
 * Sanitize a room object for client delivery.
 * - Strips `answer` from the active question (ANTI-CHEAT).
 * - Strips server-only timer handles.
 * @param {import('./types').Room} room
 * @returns {object}
 */
function sanitizeRoom(room) {
  const clone = JSON.parse(
    JSON.stringify(room, (key, value) => {
      // Strip all server-side timer/interval handles
      if (key === 'timerHandle' || key === 'tickHandle' || key === 'timeoutHandle') return undefined;
      return value;
    }),
  );

  // ANTI-CHEAT: Remove correct answer from active question
  if (clone.activeQuestion?.question?.answer !== undefined) {
    delete clone.activeQuestion.question.answer;
  }
  // Also strip explanation
  if (clone.activeQuestion?.question?.explanation !== undefined) {
    delete clone.activeQuestion.question.explanation;
  }

  return clone;
}

/**
 * Remove a room and clear all associated timers.
 * @param {string} roomCode
 */
function cleanupRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Clear question timers
  if (room.activeQuestion?.timerHandle) clearTimeout(room.activeQuestion.timerHandle);
  if (room.activeQuestion?.tickHandle) clearInterval(room.activeQuestion.tickHandle);

  // Clear captain election timers
  clearCaptainElection(roomCode, 'blue');
  clearCaptainElection(roomCode, 'red');

  rooms.delete(roomCode);
}

/**
 * Sweep and remove rooms that have been inactive for more than 2 hours.
 * Call this on a periodic setInterval.
 */
function cleanupStaleRooms() {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivityAt > TWO_HOURS) {
      cleanupRoom(code);
      console.log(`[RoomManager] Cleaned up stale room: ${code}`);
    }
  }
}

module.exports = {
  createRoom,
  joinRoom,
  reconnectPlayer,
  disconnectPlayer,
  joinTeam,
  leaveTeam,
  startCaptainElection,
  clearCaptainElection,
  getRoom,
  sanitizeRoom,
  cleanupRoom,
  cleanupStaleRooms,
};
