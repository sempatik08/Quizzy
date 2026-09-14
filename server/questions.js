'use strict';

/**
 * Question pool — each category lives in its own file under /questions/.
 * Add a new category by:
 *   1. Creating server/questions/<key>.js that exports { <key>: [...] }
 *   2. Requiring it here and spreading it into QUESTIONS
 *   3. Adding the key to isValidCategory() in server.js
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

module.exports = { QUESTIONS };
