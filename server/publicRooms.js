'use strict';

/**
 * Herkese açık odalar — public free-for-all rooms (PBI 30).
 *
 * "Quick Play" puts a player into an open free-for-all room instead of an
 * empty one of their own: an open lobby if there is one, a running match they
 * can join from the next question, or a new open room others can land in.
 * There is deliberately no room LIST — with little traffic an empty list looks
 * worse than none; this way a lone player still gets a room (and the alone
 * card's "play solo"), and two strangers who press Quick Play a minute apart
 * end up together.
 *
 * An open lobby does not wait for a host who may never press Start: once two
 * connected players are in, it starts by itself after AUTOSTART_MS.
 *
 * Private rooms ("Create room", invite links, matchmaking) are never offered
 * here: only rooms created through Quick Play carry `isPublic`.
 */

function envInt(name, fallback) {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** Countdown once a second player arrives in an open lobby. */
const AUTOSTART_MS = envInt('QUIZZY_PUBLIC_AUTOSTART_MS', 20000);
/** Do not drop someone into a match with fewer questions than this left. */
const MIN_QUESTIONS_LEFT = 4;

const autoStartHandles = new Map(); // roomCode -> timeout

function playingIds(room) {
  return Object.values(room.players).filter((p) => !p.isSpectator).map((p) => p.id);
}

function connectedPlayers(room) {
  return Object.values(room.players).filter((p) => !p.isSpectator && p.isConnected && !p.isGhost);
}

/**
 * Can a stranger take a seat in this room right now?
 * @returns {'lobby'|'late'|null}
 */
function seatKind(room, { cap, totalQuestions }) {
  if (!room.isPublic || room.mode !== 'ffa' || room.ghostMatch) return null;
  if (connectedPlayers(room).length === 0) return null; // nobody to play with
  if (playingIds(room).length >= cap) return null;
  if (room.phase === 'lobby') return 'lobby';
  if ((room.phase === 'question' || room.phase === 'category_pick') && room.ffa) {
    const left = (room.totalQuestions ?? totalQuestions) - room.ffa.questionNumber;
    return left >= MIN_QUESTIONS_LEFT ? 'late' : null;
  }
  return null;
}

/**
 * The best open room: a lobby first (fullest first, so people bunch up),
 * then a running match (earliest in its run first).
 */
function findOpenRoom(rooms, limits) {
  let best = null;
  for (const room of rooms) {
    const kind = seatKind(room, limits);
    if (!kind) continue;
    const score = kind === 'lobby'
      ? 1000 + connectedPlayers(room).length
      : 500 - (room.ffa?.questionNumber ?? 0);
    if (!best || score > best.score) best = { room, kind, score };
  }
  return best ? { room: best.room, kind: best.kind } : null;
}

/**
 * Arm or cancel an open lobby's auto-start to match who is in it. Safe to call
 * on every change; `start(room)` runs when the countdown ends.
 */
function syncAutoStart(room, start) {
  const armed = autoStartHandles.has(room.code);
  const ready = room.isPublic && room.mode === 'ffa' && room.phase === 'lobby'
    && connectedPlayers(room).length >= 2;
  if (ready && !armed) {
    room.autoStartAt = Date.now() + AUTOSTART_MS;
    autoStartHandles.set(room.code, setTimeout(() => {
      autoStartHandles.delete(room.code);
      room.autoStartAt = null;
      if (room.phase === 'lobby' && connectedPlayers(room).length >= 2) start(room);
    }, AUTOSTART_MS));
    return true;
  }
  if (!ready && !armed && room.autoStartAt) {
    // Left over from before a restart: timers do not survive one.
    room.autoStartAt = null;
    return true;
  }
  if (!ready && armed) {
    clearTimeout(autoStartHandles.get(room.code));
    autoStartHandles.delete(room.code);
    room.autoStartAt = null;
    return true;
  }
  return false;
}

module.exports = { AUTOSTART_MS, MIN_QUESTIONS_LEFT, findOpenRoom, syncAutoStart, seatKind };
