'use strict';

/**
 * Game mode definitions (PBI 9).
 *
 * Every number a mode can change lives here and nowhere else. Before this, the
 * question length, the steal window and the win threshold were three separate
 * constants read from three different files, so a mode could only be added by
 * threading overrides through all of them.
 *
 * A room stores its mode key plus the resolved values it needs, so an in-flight
 * match is unaffected if these defaults are ever edited.
 *
 * WIN THRESHOLDS WERE HALVED ON 2026-09-19, FROM PLAY DATA
 * A real 60-question Wager match ended 27-40 with nobody near 100. Modelling it
 * with the accuracy that implies (~55% per team) showed why:
 *
 *   classic, target 100, +5      -> ~57 questions, ~23 min
 *   wager,   target 100, +stake  -> ~127 questions, ~51 min
 *
 * At +5 a correct answer, 100 points means twenty correct answers per team,
 * which is simply not a party-game length. Wager was far worse because a lost
 * stake used to cost the full amount: at 55% accuracy that is a random walk with
 * almost no drift, so the score hovers instead of climbing. Hence lossFactor.
 *
 * Current settings model to ~9 min (classic), ~4 min (fast) and ~7 min (wager).
 */

/**
 * @typedef {object} GameMode
 * @property {string} key
 * @property {number} questionSeconds     voting window for a fresh question
 * @property {number} stealSeconds        voting window for a steal
 * @property {number} winThreshold        points needed to win
 * @property {number} correctPoints       awarded for a correct answer
 * @property {number} stealPoints         awarded for a correct steal
 * @property {boolean} eliminateOnWrong   Survival: a wrong answer costs a player
 * @property {number} minPlayersPerTeam   refuse to start below this
 * @property {number[]|null} wagerOptions Wager: stakes the captain may pick
 * @property {number} lossFactor      Wager: fraction of a lost stake actually deducted
 */

/** @type {Record<string, GameMode>} */
const GAME_MODES = {
  /** The original rules. Anything that changes here changes the base game. */
  classic: {
    key: 'classic',
    questionSeconds: 60,
    stealSeconds: 20,
    // 50, not 100: at +5 a correct answer this is ten correct answers rather
    // than twenty, which is ~23 questions instead of ~57.
    winThreshold: 50,
    correctPoints: 5,
    stealPoints: 10,
    eliminateOnWrong: false,
    minPlayersPerTeam: 1,
    wagerOptions: null,
    lossFactor: 1,
  },

  /**
   * Half the clock and half the target, so a match is about half as long rather
   * than twice as frantic. Halving the question window without halving the
   * threshold would just make the same-length match harder.
   */
  fast: {
    key: 'fast',
    questionSeconds: 30,
    stealSeconds: 12,
    winThreshold: 30,
    correctPoints: 5,
    stealPoints: 10,
    eliminateOnWrong: false,
    minPlayersPerTeam: 1,
    wagerOptions: null,
    lossFactor: 1,
  },

  /**
   * A wrong answer costs the answering team the player who chose it; a team with
   * nobody left loses.
   *
   * minPlayersPerTeam is 2 on purpose. With one player per side the first wrong
   * answer ends the match, which is not a game — it is a coin flip with extra
   * steps. The lock is refused with that reason rather than silently producing a
   * one-mistake match.
   */
  survival: {
    key: 'survival',
    questionSeconds: 60,
    stealSeconds: 20,
    winThreshold: 50,
    correctPoints: 5,
    stealPoints: 10,
    eliminateOnWrong: true,
    minPlayersPerTeam: 2,
    wagerOptions: null,
    lossFactor: 1,
  },

  /**
   * The captain stakes points BEFORE seeing the question. Correct wins the
   * stake, wrong loses it.
   *
   * "Without seeing the question" has to be enforced on the server, not just
   * hidden in the UI — the question text and options are withheld from room
   * state entirely until the stake is locked in (see sanitizeRoom).
   *
   * A steal in this mode still pays the standard stealPoints rather than the
   * wager. The wager is the answering team's bet on their own question; the
   * stealing team has already read it and never bet blind, so inheriting the
   * stake would hand them the upside of someone else's risk.
   */
  wager: {
    key: 'wager',
    questionSeconds: 60,
    stealSeconds: 20,
    winThreshold: 40,
    correctPoints: 5, // unused while a wager is set, kept as the fallback
    stealPoints: 10,
    eliminateOnWrong: false,
    minPlayersPerTeam: 1,
    wagerOptions: [3, 5, 10],
    /**
     * A lost stake costs this fraction of it. Symmetric stakes (1.0) made the
     * mode a random walk: at realistic accuracy the expected gain per question
     * is near zero, so scores hover and the match never ends — a real 60-question
     * game finished 27-40 with a target of 100. Half keeps the risk meaningful
     * while guaranteeing the score climbs.
     */
    lossFactor: 0.5,
  },
};

const DEFAULT_MODE = 'classic';
const MODE_KEYS = Object.keys(GAME_MODES);

/**
 * @param {string} key
 * @returns {boolean}
 */
function isValidMode(key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(GAME_MODES, key);
}

/**
 * Resolves a mode, falling back to classic. Never throws: an unknown mode on an
 * old room should degrade to the base game, not break the match.
 * @param {string} [key]
 * @returns {GameMode}
 */
function getMode(key) {
  return GAME_MODES[key] ?? GAME_MODES[DEFAULT_MODE];
}

/**
 * The mode settings a room copies at creation.
 * @param {string} [key]
 */
function modeSettingsFor(key) {
  const mode = getMode(key);
  return {
    mode: mode.key,
    questionSeconds: mode.questionSeconds,
    stealSeconds: mode.stealSeconds,
    winThreshold: mode.winThreshold,
  };
}

module.exports = {
  GAME_MODES,
  MODE_KEYS,
  DEFAULT_MODE,
  isValidMode,
  getMode,
  modeSettingsFor,
};
