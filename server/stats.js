'use strict';

/**
 * Guest profiles, match history and the leaderboard (PBI 14).
 *
 * WHAT A "PROFILE" IS HERE
 * There are no accounts. A profile is a UUID the browser generates once and
 * keeps in localStorage, sent along with room:create / room:join. That is enough
 * to remember someone's name, avatar and record across sessions on one device,
 * and it costs the player nothing — which is the whole point of a party quiz
 * you send to a friend over chat.
 *
 * WHAT THAT MEANS FOR TRUST
 * The profile id is client-supplied, so it can be forged and stats can be
 * farmed. This is a fun record board, not a competitive ranking, and it should
 * not be presented as one. Two cheap guards keep it from being trivially
 * worthless:
 *
 *  - A match only counts if both sides were held by DIFFERENT profile ids, so
 *    opening two tabs and beating yourself does nothing.
 *  - A match only counts if it actually got played (MIN_QUESTIONS_FOR_STATS),
 *    so create-and-surrender loops do not inflate a record.
 *
 * Anything stronger needs real accounts, which the PBI deliberately does not ask
 * for.
 *
 * SCALE
 * The leaderboard reads the profile index, fetches those profiles and sorts in
 * memory. That is fine for the low thousands and honest about its ceiling; past
 * that it wants a Redis sorted set maintained on write. LEADERBOARD_SCAN_CAP
 * stops a large index from turning one request into a huge fetch.
 */

const store = require('./store');

const PROFILE_KEY = (id) => `quizzy:profile:${id}`;
const HISTORY_KEY = (id) => `quizzy:history:${id}`;
const PROFILE_INDEX = 'quizzy:profiles';

/** Matches kept per profile. Enough to show a recent form list, not an archive. */
const HISTORY_LIMIT = 20;
/** Entries returned in one leaderboard response. */
const LEADERBOARD_LIMIT = 25;
/** Upper bound on profiles fetched to build one leaderboard response. */
const LEADERBOARD_SCAN_CAP = 2000;
/** A match shorter than this is not counted — see the note on farming above. */
const MIN_QUESTIONS_FOR_STATS = 4;

/** Avatars a guest can choose. A closed set, for the same reason emoji are. */
const AVATARS = [
  'fox', 'owl', 'cat', 'bear', 'wolf', 'panda',
  'shark', 'dragon', 'robot', 'alien', 'ninja', 'wizard',
];

const DEFAULT_AVATAR = 'fox';

/** Profile ids are the browser's crypto.randomUUID output. */
const PROFILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidProfileId(id) {
  return typeof id === 'string' && PROFILE_ID_PATTERN.test(id);
}

function isValidAvatar(a) {
  return typeof a === 'string' && AVATARS.includes(a);
}

function emptyProfile(id) {
  return {
    id,
    name: 'Player',
    avatar: DEFAULT_AVATAR,
    matches: 0,
    wins: 0,
    losses: 0,
    points: 0,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  };
}

/**
 * Fetch a profile, or a fresh one. Never returns null so callers do not have to
 * branch on "first time".
 * @param {string} id
 */
async function getProfile(id) {
  if (!isValidProfileId(id)) return null;
  const stored = await store.getJSON(PROFILE_KEY(id));
  return stored ?? emptyProfile(id);
}

/**
 * Record the name and avatar someone is playing under. Called on join, so the
 * leaderboard shows what they last called themselves rather than whatever they
 * were called the first time.
 * @param {string} id
 * @param {string} name
 * @param {string} avatar
 */
async function touchProfile(id, name, avatar) {
  if (!isValidProfileId(id)) return null;
  const profile = await getProfile(id);
  if (typeof name === 'string' && name.trim()) profile.name = name.trim().slice(0, 20);
  if (isValidAvatar(avatar)) profile.avatar = avatar;
  profile.lastSeenAt = Date.now();
  await store.setJSON(PROFILE_KEY(id), profile);
  await store.addToSet(PROFILE_INDEX, id);
  return profile;
}

/**
 * Write one finished match into every participating profile.
 *
 * Idempotent per room via `room.statsRecorded`: a match can reach its end
 * through a points win, a surrender or a Survival wipeout, and with persistence
 * in play a restored room could plausibly pass an end state again.
 *
 * @param {object} room
 * @returns {Promise<{ recorded: boolean, reason?: string, participants?: number }>}
 */
async function recordMatch(room) {
  if (!room || room.statsRecorded) return { recorded: false, reason: 'already recorded' };

  const winner = room.teams.blue.score >= room.teams.red.score ? 'blue' : 'red';
  const questionsPlayed = (room.usedQuestionIds ?? []).length;

  // Everyone who actually played, with a usable profile id.
  const participants = Object.values(room.players ?? {}).filter(
    (p) => p.team && !p.isSpectator && isValidProfileId(p.profileId),
  );

  const distinctProfiles = new Set(participants.map((p) => p.profileId));
  const teamsRepresented = new Set(participants.map((p) => p.team));

  // Mark first: a rejected match must not be retried on the next end-state.
  room.statsRecorded = true;

  if (questionsPlayed < MIN_QUESTIONS_FOR_STATS) {
    return { recorded: false, reason: 'match too short to count' };
  }
  if (teamsRepresented.size < 2) {
    return { recorded: false, reason: 'only one side had profiles' };
  }
  if (distinctProfiles.size < 2) {
    // One profile on both sides: someone playing themselves in two tabs.
    return { recorded: false, reason: 'same profile on both sides' };
  }

  const finishedAt = Date.now();
  const durationMs = room.createdAt ? finishedAt - room.createdAt : null;

  for (const player of participants) {
    const profile = await getProfile(player.profileId);
    const won = player.team === winner;

    profile.matches += 1;
    if (won) profile.wins += 1;
    else profile.losses += 1;
    profile.points += room.teams[player.team].score;
    profile.lastSeenAt = finishedAt;
    if (player.name) profile.name = player.name;

    await store.setJSON(PROFILE_KEY(player.profileId), profile);
    await store.addToSet(PROFILE_INDEX, player.profileId);

    const history = (await store.getJSON(HISTORY_KEY(player.profileId))) ?? [];
    history.unshift({
      roomCode: room.code,
      mode: room.mode ?? 'classic',
      team: player.team,
      won,
      myScore: room.teams[player.team].score,
      theirScore: room.teams[player.team === 'blue' ? 'red' : 'blue'].score,
      category: room.selectedCategory ?? null,
      questions: questionsPlayed,
      durationMs,
      finishedAt,
    });
    // Newest first, capped — an unbounded history would grow without limit for
    // a regular player and has no reader past the most recent handful.
    await store.setJSON(HISTORY_KEY(player.profileId), history.slice(0, HISTORY_LIMIT));
  }

  return { recorded: true, participants: participants.length, winner };
}

/**
 * @param {string} id
 * @returns {Promise<object[]>} newest first
 */
async function getHistory(id) {
  if (!isValidProfileId(id)) return [];
  return (await store.getJSON(HISTORY_KEY(id))) ?? [];
}

/**
 * Ranking: wins first, then win rate, then points, then most recently active.
 *
 * Wins lead rather than points because points scale with how many matches
 * someone has played and would just rank by time spent. Win rate breaks ties
 * between people on the same number of wins, and only among those who have
 * played enough for it to mean anything — a single 1-0 record must not outrank a
 * 40-20 one.
 *
 * @returns {Promise<{ entries: object[], total: number }>}
 */
async function getLeaderboard() {
  const ids = (await store.getSet(PROFILE_INDEX)).slice(0, LEADERBOARD_SCAN_CAP);
  if (ids.length === 0) return { entries: [], total: 0 };

  const profiles = (await store.getManyJSON(ids.map(PROFILE_KEY))).filter(Boolean);
  const played = profiles.filter((p) => (p.matches ?? 0) > 0);

  played.sort((a, b) => {
    if ((b.wins ?? 0) !== (a.wins ?? 0)) return (b.wins ?? 0) - (a.wins ?? 0);
    const rateA = a.matches ? a.wins / a.matches : 0;
    const rateB = b.matches ? b.wins / b.matches : 0;
    if (rateB !== rateA) return rateB - rateA;
    if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
    return (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0);
  });

  const entries = played.slice(0, LEADERBOARD_LIMIT).map((p, i) => ({
    rank: i + 1,
    // The profile id is NOT exposed: it is the only credential a guest has, and
    // publishing it would let anyone claim someone else's record.
    name: p.name,
    avatar: p.avatar,
    matches: p.matches,
    wins: p.wins,
    losses: p.losses,
    points: p.points,
  }));

  return { entries, total: played.length };
}

/**
 * A profile's own standing, including a rank that is meaningful even when they
 * are outside the returned page.
 * @param {string} id
 */
async function getMyStanding(id) {
  if (!isValidProfileId(id)) return null;
  const profile = await getProfile(id);
  if (!profile || (profile.matches ?? 0) === 0) {
    return { ...profile, rank: null };
  }

  const ids = (await store.getSet(PROFILE_INDEX)).slice(0, LEADERBOARD_SCAN_CAP);
  const profiles = (await store.getManyJSON(ids.map(PROFILE_KEY))).filter(Boolean);
  const ahead = profiles.filter((p) => {
    if (p.id === id) return false;
    if ((p.matches ?? 0) === 0) return false;
    if ((p.wins ?? 0) !== (profile.wins ?? 0)) return (p.wins ?? 0) > (profile.wins ?? 0);
    const rateP = p.matches ? p.wins / p.matches : 0;
    const rateMe = profile.matches ? profile.wins / profile.matches : 0;
    if (rateP !== rateMe) return rateP > rateMe;
    return (p.points ?? 0) > (profile.points ?? 0);
  }).length;

  return { ...profile, rank: ahead + 1 };
}

module.exports = {
  AVATARS,
  DEFAULT_AVATAR,
  HISTORY_LIMIT,
  LEADERBOARD_LIMIT,
  MIN_QUESTIONS_FOR_STATS,
  isValidProfileId,
  isValidAvatar,
  getProfile,
  touchProfile,
  recordMatch,
  getHistory,
  getLeaderboard,
  getMyStanding,
};
