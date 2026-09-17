'use strict';

const { randomUUID } = require('crypto');
const { modeSettingsFor, getMode } = require('./gameModes');
const store = require('./store');

/** @type {Map<string, import('./types').Room>} */
const rooms = new Map();

/**
 * Steal attempts each team gets per match. Lives here rather than in gameLogic
 * because createRoom seeds it and gameLogic already imports from this module.
 */
const STEAL_CHARGES_PER_TEAM = 2;

/** Players who can actually take a turn: 3 per team. */
const MAX_PLAYERS = 6;
/**
 * Spectators get their own, larger allowance and do NOT consume player slots
 * (PBI 10). Sharing one cap would let a crowd of watchers lock out the sixth
 * player, which is backwards.
 */
const MAX_SPECTATORS = 20;

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
function createRoom(playerName, socketId, modeKey, identity = {}) {
  const roomCode = generateRoomCode();
  const playerId = randomUUID();
  // Resolved at creation so editing the defaults cannot change an in-flight match.
  const modeSettings = modeSettingsFor(modeKey);

  /** @type {import('./types').Player} */
  const player = {
    id: playerId,
    socketId,
    name: sanitizeName(playerName),
    team: null,
    isConnected: true,
    isSpectator: false,
    isEliminated: false,
    // Guest profile identity (PBI 14). Client-supplied and validated by the
    // caller; null when the browser has no profile yet.
    profileId: identity.profileId ?? null,
    avatar: identity.avatar ?? null,
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
    /** Fresh questions each team has answered in the CURRENT category (PBI 3). */
    categoryAnswerCount: { blue: 0, red: 0 },
    stealCharges: { blue: STEAL_CHARGES_PER_TEAM, red: STEAL_CHARGES_PER_TEAM },
    /**
     * Mode key plus the timings and threshold it resolved to (PBI 9). Stored on
     * the room rather than read from a constant so the difficulty ramp (PBI 7)
     * and the client scoreboard read the same numbers.
     */
    ...modeSettings,
    /** One 50/50 and one extra-time joker per team, per match (PBI 6). */
    jokers: {
      blue: { fiftyFifty: true, extraTime: true },
      red:  { fiftyFifty: true, extraTime: true },
    },
    /** Per-team consent to replay the match once it has finished (PBI 8). */
    rematch: { blue: false, red: false },
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    hostId: playerId,
  };

  rooms.set(roomCode, room);
  return { roomCode, playerId, room };
}

/**
 * Join an existing room, as a player or as a spectator (PBI 10).
 *
 * A spectator may join at ANY phase — that is the whole point, since a match
 * worth watching is one already in progress. Players are still refused once the
 * game has started, because teams are locked and turn order is fixed.
 *
 * @param {string} roomCode
 * @param {string} playerName
 * @param {string} socketId
 * @param {boolean} [asSpectator]
 * @returns {{ error?: string, playerId?: string, room?: import('./types').Room }}
 */
function joinRoom(roomCode, playerName, socketId, asSpectator = false, identity = {}) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found.' };

  const roster = Object.values(room.players);

  if (asSpectator) {
    const spectators = roster.filter((p) => p.isSpectator).length;
    if (spectators >= MAX_SPECTATORS) {
      return { error: `Too many spectators (max ${MAX_SPECTATORS}).` };
    }
  } else {
    if (room.phase !== 'lobby') {
      return { error: 'Game is already in progress. You can join as a spectator instead.' };
    }
    const players = roster.filter((p) => !p.isSpectator).length;
    if (players >= MAX_PLAYERS) return { error: `Room is full (max ${MAX_PLAYERS} players).` };
  }

  const playerId = randomUUID();
  room.players[playerId] = {
    id: playerId,
    socketId,
    name: sanitizeName(playerName),
    team: null,
    isConnected: true,
    isSpectator: Boolean(asSpectator),
    isEliminated: false,
    profileId: identity.profileId ?? null,
    avatar: identity.avatar ?? null,
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
    // Only discard the room outright when there is nothing to come back to.
    //
    // Before persistence existed (PBI 13) an empty room was worthless, so it was
    // always dropped. Now that state survives, tearing down a match in progress
    // the moment the last socket blips means a 1v1 dies to a lost wifi
    // connection and `room:reconnect` has nothing to find. An in-progress match
    // is kept instead and collected by cleanupStaleRooms on the 2h clock, which
    // matches the store's own TTL.
    const worthKeeping = room.phase !== 'lobby' && room.phase !== 'finished';
    if (!worthKeeping) {
      cleanupRoom(roomCode);
      return null;
    }
    // Timers are pointless with nobody listening, and a question that resolves
    // into an empty room would burn through the pool unattended.
    if (room.activeQuestion?.timerHandle) clearTimeout(room.activeQuestion.timerHandle);
    if (room.activeQuestion?.tickHandle) clearInterval(room.activeQuestion.tickHandle);
    if (room.activeQuestion) {
      room.activeQuestion.timerHandle = null;
      room.activeQuestion.tickHandle = null;
    }
    console.log(`[RoomManager] ${roomCode} is empty but in progress — kept for reconnect.`);
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

  // Taking a team in the lobby converts a spectator into a player. joinTeam
  // already refuses once the game has started, so this cannot happen mid-match.
  player.isSpectator = false;

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
 * Put a room loaded from the store back into the working set (PBI 13).
 *
 * Used only at boot, by restoreRooms in server.js. It does not re-arm timers —
 * that needs io, which roomManager deliberately knows nothing about.
 * @param {import('./types').Room} room
 */
function adoptRoom(room) {
  if (!room?.code) return null;
  rooms.set(room.code, room);
  return room;
}

/** Every room currently in the working set. */
function allRooms() {
  return [...rooms.values()];
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

  // ANTI-CHEAT (PBI 14): strip every player's profile id. It is the only
  // credential a guest identity has, so leaking it to the rest of the room
  // would let anyone in the match claim someone else's record.
  for (const player of Object.values(clone.players ?? {})) {
    delete player.profileId;
  }

  // ANTI-CHEAT: Remove correct answer from active question
  if (clone.activeQuestion?.question?.answer !== undefined) {
    delete clone.activeQuestion.question.answer;
  }
  // Also strip explanation
  if (clone.activeQuestion?.question?.explanation !== undefined) {
    delete clone.activeQuestion.question.explanation;
  }

  // ANTI-CHEAT (Wager mode, PBI 9): the team stakes points BEFORE seeing the
  // question, so the text and options are withheld from the payload entirely
  // until the stake is locked in. Hiding them only in the UI would leave the
  // whole question sitting in the socket frame for anyone who opened devtools,
  // which would defeat the mode.
  if (clone.activeQuestion?.wagerPending) {
    clone.activeQuestion.question = {
      id: clone.activeQuestion.question?.id ?? null,
      text: null,
      text_tr: null,
      options: null,
      options_tr: null,
    };
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
  // Drop the stored copy too, or an abandoned room is resurrected at next boot.
  store.deleteRoom(roomCode);
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
  STEAL_CHARGES_PER_TEAM,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  getMode,
  adoptRoom,
  allRooms,
};
