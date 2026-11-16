'use strict';

/**
 * "Find an opponent" queue (PBI 35).
 *
 * A player who asks for an opponent waits up to WAIT_MS for someone else to ask
 * too. Two waiting players are paired at once; a player still alone when the
 * wait runs out is handed back for a ghost match (see ghost.js). The queue only
 * decides who meets whom — creating the room and starting the match stay in
 * server.js, which owns the socket bookkeeping.
 *
 * Process-local on purpose: like every timer handle in this server, a restart
 * drops it, and a player mid-search just searches again.
 */

function envInt(name, fallback) {
  const v = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** How long to look for a live opponent before falling back to a ghost. */
const WAIT_MS = envInt('QUIZZY_MATCH_WAIT_MS', 12000);

/** socketId -> { socketId, request, handle, joinedAt } in arrival order. */
const waiting = new Map();

/**
 * Join the queue. Calls `onPair(first, second)` as soon as someone else is
 * waiting, or `onTimeout(entry)` when the wait runs out alone.
 * @returns {{ queued: boolean, paired: boolean }}
 */
function enqueue(socketId, request, { onPair, onTimeout }) {
  if (waiting.has(socketId)) return { queued: false, paired: false };

  // First come, first served: the longest-waiting player gets the newcomer.
  const partner = waiting.values().next().value;
  if (partner) {
    leave(partner.socketId);
    onPair(partner, { socketId, request });
    return { queued: false, paired: true };
  }

  const entry = { socketId, request, joinedAt: Date.now(), handle: null };
  entry.handle = setTimeout(() => {
    if (waiting.get(socketId) !== entry) return;
    waiting.delete(socketId);
    onTimeout(entry);
  }, WAIT_MS);
  waiting.set(socketId, entry);
  return { queued: true, paired: false };
}

/** Leave the queue (cancel or disconnect). Returns whether the socket was in it. */
function leave(socketId) {
  const entry = waiting.get(socketId);
  if (!entry) return false;
  clearTimeout(entry.handle);
  waiting.delete(socketId);
  return true;
}

function isWaiting(socketId) {
  return waiting.has(socketId);
}

module.exports = { WAIT_MS, enqueue, leave, isWaiting };
