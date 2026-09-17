'use strict';

/**
 * Question pool — each category lives in its own file under /questions/.
 * Add a new category by:
 *   1. Creating server/questions/<key>.js that exports { <key>: [...] }
 *   2. Requiring it here and spreading it into QUESTIONS
 *   3. Adding the key to the Category union in src/types/index.ts
 *
 * CATEGORY_KEYS is derived from QUESTIONS and is the ONLY category allow-list on
 * the server. gameLogic.js used to keep a second hand-written list, which silently
 * dropped `philosophy` — the UI offered it and the server answered "Invalid category."
 */

const { general } = require('./questions/general');
const { cinema } = require('./questions/cinema');
const { games } = require('./questions/games');
const { sports } = require('./questions/sports');
const { history } = require('./questions/history');
const { music } = require('./questions/music');
const { anime } = require('./questions/anime');
const { technology } = require('./questions/technology');
const { literature } = require('./questions/literature');
const { math } = require('./questions/math');
const { geography } = require('./questions/geography');
const { philosophy } = require('./questions/philosophy');

const QUESTIONS = {
  general,
  cinema,
  sports,
  history,
  music,
  anime,
  technology,
  literature,
  math,
  geography,
  philosophy,

  games,
};

/** Canonical category allow-list. Derived, never hand-maintained. */
const CATEGORY_KEYS = Object.keys(QUESTIONS);

module.exports = { QUESTIONS, CATEGORY_KEYS };
