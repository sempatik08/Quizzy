'use strict';

/**
 * Room persistence (PBI 13).
 *
 * Rooms lived only in a process-local Map, so every redeploy silently killed
 * every match in progress. This adds a persistence layer with three backends,
 * chosen by environment:
 *
 *   REDIS_URL set        -> redis   (production)
 *   QUIZZY_STORE_FILE    -> file    (single-instance deploys, and the tests)
 *   neither              -> memory  (local dev, exactly the old behaviour)
 *
 * WHY WRITE-BEHIND AND NOT A REDIS-BACKED MAP
 * A room holds live setTimeout/setInterval handles and is read synchronously
 * from about forty places across roomManager and gameLogic. Making the store the
 * source of truth would turn every one of those into an async call and rewrite
 * the whole game loop for a durability guarantee that does not need it. Instead
 * the in-process Map stays the working set and a serialized snapshot is written
 * behind it — from broadcast(), which is the one choke point every state change
 * already passes through on its way to the clients. What the players were told
 * is exactly what gets persisted.
 *
 * WHAT THIS DOES AND DOES NOT BUY
 * It buys restart durability: a redeploy or a crash no longer destroys matches,
 * and it gives PBI 14 somewhere to keep profiles and history. It does NOT by
 * itself buy horizontal scaling — two instances would each keep their own
 * working set and their own timers. That needs per-room sticky routing plus the
 * socket.io Redis adapter, and is deliberately out of scope here.
 *
 * Every path is fail-soft. A store that cannot be reached must degrade to
 * in-memory behaviour, never take the game server down with it.
 */

const fs = require('fs');
const path = require('path');

/** Rooms expire from the store on the same 2h clock as cleanupStaleRooms. */
const ROOM_TTL_SECONDS = 2 * 60 * 60;
const KEY_PREFIX = 'quizzy:room:';

/** Coalesces bursts of writes for the same room into one. */
const WRITE_DEBOUNCE_MS = 400;

let backend = 'memory';
let redis = null;
let filePath = null;

/** code -> serialized JSON string, for the file backend's in-memory mirror. */
const fileMirror = new Map();

/** code -> pending debounce timer. */
const pendingWrites = new Map();

let fileFlushHandle = null;

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Snapshot a room to plain JSON.
 *
 * Timer handles are dropped — they are process-local objects and would
 * serialize to `{}` at best. Unlike sanitizeRoom this KEEPS the answer key and
 * the explanation: this is server-side storage, not a client payload, and a
 * restored question that lost its answer would be unresolvable.
 *
 * @param {object} room
 * @returns {string}
 */
function serializeRoom(room) {
  return JSON.stringify(room, (key, value) => {
    if (key === 'timerHandle' || key === 'tickHandle' || key === 'timeoutHandle') {
      return undefined;
    }
    return value;
  });
}

/**
 * Rehydrate a snapshot into a room that is safe to put back into play.
 *
 * Two deliberate corrections:
 *
 *  - An active question's clock is restarted from now. The stored timerStart is
 *    in the past, often further back than the whole window, so honouring it
 *    would resolve the question the instant the server booted — scoring a
 *    question nobody was able to answer, because the server was down. The clock
 *    did not stop for the players' benefit.
 *  - A pending surrender vote is dropped. It is a 30-second decision; whatever
 *    it meant, it does not survive a restart, and leaving it would show a vote
 *    whose timeout no longer exists.
 *
 * @param {string} json
 * @returns {object|null}
 */
function deserializeRoom(json) {
  let room;
  try {
    room = JSON.parse(json);
  } catch {
    return null;
  }
  if (!room || typeof room.code !== 'string') return null;

  if (room.activeQuestion) {
    room.activeQuestion.timerHandle = null;
    room.activeQuestion.tickHandle = null;
    room.activeQuestion.resolving = false;
    room.activeQuestion.timerStart = Date.now();
    room.activeQuestion.timeLeft = room.activeQuestion.duration;
  }

  room.surrenderVote = null;

  // Nobody is connected until their socket comes back and calls room:reconnect.
  for (const player of Object.values(room.players ?? {})) {
    player.isConnected = false;
  }

  return room;
}

// ---------------------------------------------------------------------------
// Backend setup
// ---------------------------------------------------------------------------

/**
 * Pick and connect a backend. Safe to call once at boot.
 * @returns {Promise<{ backend: string }>}
 */
async function initStore() {
  const url = process.env.REDIS_URL;
  const file = process.env.QUIZZY_STORE_FILE;

  if (url) {
    try {
      // Required lazily so a deployment without the package still boots.
      const Redis = require('ioredis');
      redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        // Without this a Redis outage makes every command hang rather than fail.
        enableOfflineQueue: false,
      });
      // An error listener is mandatory: an unhandled 'error' on an ioredis
      // client is an unhandled exception, which would kill the game server.
      redis.on('error', (err) => {
        console.warn(`[Store] Redis error: ${err.message}`);
      });
      await redis.connect();
      backend = 'redis';
      console.log('[Store] Using Redis persistence');
      return { backend };
    } catch (err) {
      console.warn(`[Store] Redis unavailable (${err.message}); falling back to memory`);
      redis = null;
    }
  }

  if (file) {
    try {
      filePath = path.resolve(file);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      backend = 'file';
      console.log(`[Store] Using file persistence at ${filePath}`);
      return { backend };
    } catch (err) {
      console.warn(`[Store] File store unavailable (${err.message}); falling back to memory`);
      filePath = null;
    }
  }

  backend = 'memory';
  console.log('[Store] In-memory only — matches will not survive a restart');
  return { backend };
}

function getBackend() {
  return backend;
}

// ---------------------------------------------------------------------------
// Reads and writes
// ---------------------------------------------------------------------------

function readFileMap() {
  if (!filePath) return {};
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn(`[Store] Could not read store file: ${err.message}`);
    return {};
  }
}

function writeFileMap() {
  if (!filePath) return;
  try {
    const out = {};
    for (const [code, json] of fileMirror) out[code] = json;
    // Write to a sibling then rename: a crash mid-write must not leave a
    // truncated file that loses every room instead of one.
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(out), 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    console.warn(`[Store] Could not write store file: ${err.message}`);
  }
}

/** Flushes the file mirror on a short delay so a burst becomes one write. */
function scheduleFileFlush() {
  if (!filePath || fileFlushHandle) return;
  fileFlushHandle = setTimeout(() => {
    fileFlushHandle = null;
    writeFileMap();
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Persist a room. Fire and forget: the caller is in the middle of a broadcast
 * and must not wait on IO, and a failed write must not interrupt the game.
 * @param {object} room
 */
function saveRoom(room) {
  if (backend === 'memory' || !room?.code) return;

  const code = room.code;
  // Serialize immediately — the room object keeps mutating, so a debounce that
  // deferred the snapshot would persist a later state than the one broadcast.
  const json = serializeRoom(room);

  if (backend === 'file') {
    fileMirror.set(code, json);
    scheduleFileFlush();
    return;
  }

  // Redis: debounce per room so a flurry of votes is one round trip.
  const existing = pendingWrites.get(code);
  if (existing) clearTimeout(existing.handle);
  const handle = setTimeout(() => {
    const entry = pendingWrites.get(code);
    pendingWrites.delete(code);
    if (!entry || !redis) return;
    redis
      .set(`${KEY_PREFIX}${code}`, entry.json, 'EX', ROOM_TTL_SECONDS)
      .catch((err) => console.warn(`[Store] save ${code} failed: ${err.message}`));
  }, WRITE_DEBOUNCE_MS);
  pendingWrites.set(code, { json, handle });
}

/**
 * Remove a room from the store. Called when a room is cleaned up, so an
 * abandoned room does not come back from the dead on the next boot.
 * @param {string} code
 */
function deleteRoom(code) {
  if (backend === 'memory' || !code) return;

  const pending = pendingWrites.get(code);
  if (pending) {
    clearTimeout(pending.handle);
    pendingWrites.delete(code);
  }

  if (backend === 'file') {
    fileMirror.delete(code);
    scheduleFileFlush();
    return;
  }

  if (redis) {
    redis
      .del(`${KEY_PREFIX}${code}`)
      .catch((err) => console.warn(`[Store] delete ${code} failed: ${err.message}`));
  }
}

/**
 * Load every stored room. Called once at boot, before accepting connections.
 * @returns {Promise<object[]>} rehydrated rooms
 */
async function loadAllRooms() {
  if (backend === 'memory') return [];

  if (backend === 'file') {
    const map = readFileMap();
    const rooms = [];
    for (const [code, json] of Object.entries(map)) {
      fileMirror.set(code, json);
      const room = deserializeRoom(json);
      if (room) rooms.push(room);
    }
    return rooms;
  }

  if (!redis) return [];
  try {
    const keys = [];
    // SCAN rather than KEYS: KEYS blocks the whole Redis instance, which is a
    // bad neighbour on a shared plan.
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', 100);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length === 0) return [];
    const values = await redis.mget(keys);
    return values.map((v) => (v ? deserializeRoom(v) : null)).filter(Boolean);
  } catch (err) {
    console.warn(`[Store] load failed: ${err.message}`);
    return [];
  }
}

/** Flush anything pending. Used on shutdown and by tests. */
async function flush() {
  if (backend === 'file') {
    if (fileFlushHandle) {
      clearTimeout(fileFlushHandle);
      fileFlushHandle = null;
    }
    writeFileMap();
    return;
  }

  if (backend === 'redis' && redis) {
    const writes = [...pendingWrites.entries()];
    pendingWrites.clear();
    await Promise.allSettled(
      writes.map(([code, entry]) => {
        clearTimeout(entry.handle);
        return redis.set(`${KEY_PREFIX}${code}`, entry.json, 'EX', ROOM_TTL_SECONDS);
      }),
    );
  }
}

async function closeStore() {
  await flush();
  if (redis) {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
    redis = null;
  }
}

module.exports = {
  ROOM_TTL_SECONDS,
  KEY_PREFIX,
  initStore,
  getBackend,
  saveRoom,
  deleteRoom,
  loadAllRooms,
  serializeRoom,
  deserializeRoom,
  flush,
  closeStore,
};
