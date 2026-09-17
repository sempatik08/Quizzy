'use strict';

/**
 * Score-based difficulty selection (PBI 7).
 *
 * SCORING IS UNTOUCHED. A correct answer is +5 and a stolen one is +10 whatever
 * the difficulty. Harder questions are not worth more; the difficulty curve
 * exists to stop the last stretch of a match being a formality, not to hand the
 * leader a bigger prize.
 *
 * The curve is driven by the ANSWERING team's own score, so it is
 * self-balancing: the team out in front faces the harder questions while the
 * team behind keeps getting reachable ones. Driving it from the higher of the
 * two scores instead would punish the trailing team for the leader's progress,
 * which is the opposite of what a comeback mechanic should do.
 */

/** Applied to any question with no explicit `difficulty` field. */
const DEFAULT_DIFFICULTY = 2;

/**
 * Where the hard ramp begins, as a fraction of the win threshold.
 *
 * A fraction rather than a hard-coded 60 so the curve survives game modes with
 * a different target (PBI 9's Fast mode wins at 50, where a literal 60 would
 * put the entire ramp past the win condition and it would never fire).
 * At the classic 100-point threshold this is exactly the 60 the PBI asks for.
 */
const HARD_RAMP_START_FRACTION = 0.6;

const DIFFICULTIES = [1, 2, 3];

/**
 * Difficulty of a question, defaulting untagged ones to medium.
 * @param {{ difficulty?: number }} question
 * @returns {1|2|3}
 */
function difficultyOf(question) {
  const d = question?.difficulty;
  return DIFFICULTIES.includes(d) ? d : DEFAULT_DIFFICULTY;
}

/**
 * Probability that the next question should be hard.
 *
 * 0 until the score reaches the ramp start, then rises linearly to 1 at the win
 * threshold — "almost never at 60, almost always approaching 100".
 *
 * @param {number} score answering team's score
 * @param {number} winThreshold points needed to win this mode
 * @returns {number} 0–1
 */
function hardProbability(score, winThreshold = 100) {
  const start = winThreshold * HARD_RAMP_START_FRACTION;
  if (score <= start) return 0;
  const span = winThreshold - start;
  if (span <= 0) return 1;
  return Math.min(1, (score - start) / span);
}

/**
 * Picks the difficulty to aim for.
 *
 * Below the hard ramp the choice slides from easy toward medium as the score
 * climbs, so the opening questions are approachable rather than the flat
 * easy/medium coin flip the PBI's "current behaviour" would give.
 *
 * @param {number} score
 * @param {number} winThreshold
 * @param {() => number} rng injectable so tests can be deterministic
 * @returns {1|2|3}
 */
function pickTargetDifficulty(score, winThreshold = 100, rng = Math.random) {
  if (rng() < hardProbability(score, winThreshold)) return 3;

  const start = winThreshold * HARD_RAMP_START_FRACTION;
  const mediumChance = start > 0 ? Math.min(1, Math.max(0, score) / start) : 1;
  return rng() < mediumChance ? 2 : 1;
}

/**
 * Difficulties to try, nearest first. Ties prefer the easier one — when the
 * hard bucket for a category is empty it is better to hand out a medium
 * question than to escalate.
 * @param {1|2|3} target
 * @returns {number[]}
 */
function fallbackOrder(target) {
  return [...DIFFICULTIES].sort(
    (a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b,
  );
}

/**
 * Chooses the next question from `pool`, skipping used ids, aiming at `target`
 * and stepping to the nearest available difficulty if that bucket is empty.
 *
 * Returns null ONLY when the whole category is exhausted — never because a
 * difficulty bucket ran dry. A "no question found" at full pool would stall the
 * match, and the caller reads null as "category exhausted, pick a new one".
 *
 * @param {Array<object>} pool
 * @param {string[]} usedIds
 * @param {1|2|3} target
 * @param {() => number} rng
 * @returns {object|null}
 */
function selectQuestion(pool, usedIds, target, rng = Math.random) {
  const used = new Set(usedIds);
  const available = pool.filter((q) => !used.has(q.id));
  if (available.length === 0) return null;

  for (const d of fallbackOrder(target)) {
    const bucket = available.filter((q) => difficultyOf(q) === d);
    if (bucket.length > 0) return bucket[Math.floor(rng() * bucket.length)];
  }

  // Unreachable while every difficultyOf() lands in DIFFICULTIES, but a pool is
  // content and content changes; never return null with questions left.
  return available[Math.floor(rng() * available.length)];
}

module.exports = {
  DEFAULT_DIFFICULTY,
  HARD_RAMP_START_FRACTION,
  DIFFICULTIES,
  difficultyOf,
  hardProbability,
  pickTargetDifficulty,
  fallbackOrder,
  selectQuestion,
};
