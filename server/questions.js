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

  games,

  geography: [
    {
      id: 'geo_01',
      text: 'Which is the largest country in the world by land area?',
      text_tr: 'Yüzölçümü bakımından dünyanın en büyük ülkesi hangisidir?',
      options: { A: 'Canada', B: 'China', C: 'United States', D: 'Brazil', E: 'Russia' },
      options_tr: { A: 'Kanada', B: 'Çin', C: 'Amerika Birleşik Devletleri', D: 'Brezilya', E: 'Rusya' },
      answer: 'E',
      explanation: 'Russia is the largest country in the world, covering approximately 17.1 million km², which is over twice the size of Canada.',
    },
    {
      id: 'geo_02',
      text: 'What is the capital city of Australia?',
      text_tr: 'Avustralya\'nın başkenti neresidir?',
      options: { A: 'Sydney', B: 'Melbourne', C: 'Brisbane', D: 'Canberra', E: 'Perth' },
      options_tr: { A: 'Sidney', B: 'Melbourne', C: 'Brisbane', D: 'Canberra', E: 'Perth' },
      answer: 'D',
      explanation: 'Canberra is the capital of Australia, chosen as a compromise between Sydney and Melbourne when Australia federated in 1901.',
    },
    {
      id: 'geo_03',
      text: 'Which river is the longest in the world?',
      text_tr: 'Dünyanın en uzun nehri hangisidir?',
      options: { A: 'Amazon', B: 'Yangtze', C: 'Mississippi', D: 'Congo', E: 'Nile' },
      options_tr: { A: 'Amazon', B: 'Yangtze', C: 'Mississippi', D: 'Kongo', E: 'Nil' },
      answer: 'E',
      explanation: 'The Nile River in Africa is generally considered the world\'s longest river at approximately 6,650 km, though some studies suggest the Amazon may be longer.',
    },
    {
      id: 'geo_04',
      text: 'Which mountain range separates Europe from Asia in Russia?',
      text_tr: 'Rusya\'da Avrupa\'yı Asya\'dan ayıran dağ silsilesi hangisidir?',
      options: { A: 'Caucasus Mountains', B: 'Ural Mountains', C: 'Altai Mountains', D: 'Carpathian Mountains', E: 'Zagros Mountains' },
      options_tr: { A: 'Kafkas Dağları', B: 'Ural Dağları', C: 'Altay Dağları', D: 'Karpatlar', E: 'Zagros Dağları' },
      answer: 'B',
      explanation: 'The Ural Mountains form the traditional geographic boundary between Europe and Asia, stretching about 2,500 km through Russia.',
    },
    {
      id: 'geo_05',
      text: 'Which strait separates Europe (Spain) from Africa (Morocco)?',
      text_tr: 'Avrupa\'yı (İspanya) Afrika\'dan (Fas) ayıran boğaz hangisidir?',
      options: { A: 'Strait of Messina', B: 'Strait of Otranto', C: 'Strait of Gibraltar', D: 'Strait of Bosporus', E: 'Strait of Hormuz' },
      options_tr: { A: 'Messina Boğazı', B: 'Otranto Boğazı', C: 'Cebelitarık Boğazı', D: 'İstanbul Boğazı', E: 'Hürmüz Boğazı' },
      answer: 'C',
      explanation: 'The Strait of Gibraltar separates the Iberian Peninsula (Europe) from Morocco (Africa) and connects the Atlantic Ocean to the Mediterranean Sea.',
    },
  ],
};

module.exports = { QUESTIONS };
