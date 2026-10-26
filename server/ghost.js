'use strict';

/**
 * Ghost opponents for matchmaking (PBI 35).
 *
 * With a few dozen visitors a month, two strangers are almost never online at
 * the same moment, so a live queue alone would leave everyone waiting forever.
 * Instead every finished free-for-all run is kept as a recording — the
 * questions, the option the player chose and how long they took — and a player
 * who finds nobody live plays against one of those runs.
 *
 * The opponent is a real person's real performance: the name shown is the
 * nickname they played under and the label says when they played. Nothing is
 * invented. Scoring is not replayed from the recording either: the ghost's
 * answers are cast at their recorded moments through the normal answer path,
 * so the live rules score both players identically.
 *
 * Recording shape (one per player per finished match):
 *   { id, name, avatar, profileId, playedAt,
 *     rounds: [{ questionId, category, option|null, elapsedMs|null }] }
 *
 * `profileId` only exists so nobody is matched against their own run; it never
 * leaves the server (sanitizeRoom strips the whole script).
 */

const { randomUUID } = require('crypto');
const { QUESTIONS } = require('./questions');
const store = require('./store');

const KEY_GHOSTS = 'quizzy:ghosts';
/** Newest recordings kept. Old ones drop off, so the pool tracks the live bank. */
const MAX_GHOSTS = 50;
/** A run with fewer answers than this is someone who left — no opponent at all. */
const MIN_ANSWERED = 10;

/** questionId -> { question, category }, built once. */
let questionIndex = null;
function lookupQuestion(id) {
  if (!questionIndex) {
    questionIndex = new Map();
    for (const [category, list] of Object.entries(QUESTIONS)) {
      for (const q of list) questionIndex.set(q.id, { question: q, category });
    }
  }
  return questionIndex.get(id) ?? null;
}

/**
 * Turn a finished free-for-all room into recordings, one per real player.
 * Pure: the caller decides whether to store them.
 */
function recordingsFrom(room, now = Date.now()) {
  const log = room.ffa?.log ?? [];
  if (log.length === 0) return [];
  const out = [];
  for (const id of Object.keys(room.ffa.players ?? {})) {
    const player = room.players[id];
    if (!player || player.isGhost) continue;
    const rounds = log.map((round) => {
      const vote = round.votes[id];
      return {
        questionId: round.questionId,
        category: round.category,
        option: vote?.optionKey ?? null,
        elapsedMs: vote ? vote.elapsedMs : null,
      };
    });
    if (rounds.filter((r) => r.option).length < MIN_ANSWERED) continue;
    out.push({
      id: randomUUID(),
      name: player.name,
      avatar: player.avatar ?? null,
      profileId: player.profileId ?? null,
      playedAt: now,
      rounds,
    });
  }
  return out;
}

/** Add a finished match's runs to the pool. Fire and forget; never throws. */
async function saveMatch(room) {
  try {
    const fresh = recordingsFrom(room);
    if (fresh.length === 0) return 0;
    const pool = (await store.getJSON(KEY_GHOSTS)) ?? [];
    await store.setJSON(KEY_GHOSTS, [...fresh, ...pool].slice(0, MAX_GHOSTS));
    return fresh.length;
  } catch (err) {
    console.warn(`[Ghost] save failed: ${err.message}`);
    return 0;
  }
}

/** A recording is usable only if every question is still in the bank. */
function playable(rec) {
  return Array.isArray(rec?.rounds) && rec.rounds.length > 0
    && rec.rounds.every((r) => lookupQuestion(r.questionId));
}

/**
 * A random recording for this player, or null when the pool has none that is
 * playable and not their own.
 */
async function pickGhost(profileId = null, rng = Math.random) {
  const pool = (await store.getJSON(KEY_GHOSTS)) ?? [];
  const candidates = pool.filter((rec) =>
    playable(rec) && !(profileId && rec.profileId && rec.profileId === profileId));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

module.exports = {
  KEY_GHOSTS,
  MAX_GHOSTS,
  MIN_ANSWERED,
  lookupQuestion,
  recordingsFrom,
  saveMatch,
  pickGhost,
};
