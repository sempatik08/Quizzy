'use strict';

/**
 * Spectator mode test (PBI 10).
 *
 *   node tests/spectator_test.js
 *
 * Requires the Socket.io server to be running.
 *
 * Builds its own room rather than using setupMatch, because the interesting
 * cases need three players plus watchers: a solo-captain 1v1 cannot show that a
 * spectator is excluded from the surrender threshold.
 */

const {
  sleep, RATE_GAP, createReporter, waitFor, makeClient, myTeam,
  clientOnTeam, answerFor, wrongOption, teardown,
} = require('./helpers');

const { MAX_PLAYERS, MAX_SPECTATORS } = require('../server/roomManager');

const r = createReporter('SPECTATOR MODE — PBI 10');

const created = [];
function client(name) {
  const c = makeClient(name);
  created.push(c);
  return c;
}

async function main() {
  r.banner();

  // =====================================================================
  // 1. Joining as a spectator
  // =====================================================================
  r.section('1. Joining');

  const host = client('Host');
  host.s.emit('room:create', { playerName: 'Host' });
  await waitFor(() => host.room, 'room created');
  const code = host.room.code;

  r.check('The room creator is not a spectator',
    host.room.players[host.playerId].isSpectator === false,
    JSON.stringify(host.room.players[host.playerId]));
  r.check('Player and spectator caps are separate',
    MAX_PLAYERS === 6 && MAX_SPECTATORS === 20,
    `${MAX_PLAYERS}/${MAX_SPECTATORS}`);

  const mate = client('Mate');
  mate.s.emit('room:join', { roomCode: code, playerName: 'Mate' });
  await waitFor(() => mate.playerId, 'mate joined');

  const foe = client('Foe');
  foe.s.emit('room:join', { roomCode: code, playerName: 'Foe' });
  await waitFor(() => foe.playerId, 'foe joined');

  const watcher = client('Watcher');
  watcher.s.emit('room:join', { roomCode: code, playerName: 'Watcher', asSpectator: true });
  await waitFor(() => watcher.playerId, 'watcher joined');

  r.check('A spectator is flagged as one',
    host.room.players[watcher.playerId]?.isSpectator === true,
    JSON.stringify(host.room.players[watcher.playerId]));
  r.check('A spectator is on no team',
    host.room.players[watcher.playerId]?.team === null,
    `${host.room.players[watcher.playerId]?.team}`);

  // A truthy non-boolean must not be enough to become a spectator.
  const sneaky = client('Sneaky');
  sneaky.s.emit('room:join', { roomCode: code, playerName: 'Sneaky', asSpectator: 'yes' });
  await waitFor(() => sneaky.playerId, 'sneaky joined');
  r.check('asSpectator is coerced strictly — a truthy string joins as a player',
    host.room.players[sneaky.playerId]?.isSpectator === false,
    JSON.stringify(host.room.players[sneaky.playerId]));

  // =====================================================================
  // 2. Teams: 2 blue vs 1 red, plus a watcher
  // =====================================================================
  r.section('2. Teams');

  await sleep(RATE_GAP);
  host.s.emit('team:join', { roomCode: code, team: 'blue' });
  await sleep(RATE_GAP);
  mate.s.emit('team:join', { roomCode: code, team: 'blue' });
  await sleep(RATE_GAP);
  foe.s.emit('team:join', { roomCode: code, team: 'red' });
  await waitFor(
    () => host.room.teams.blue.players.length === 2 && host.room.teams.red.players.length === 1,
    'teams assigned',
  );

  r.check('A spectator is not in either team roster',
    !host.room.teams.blue.players.includes(watcher.playerId) &&
      !host.room.teams.red.players.includes(watcher.playerId));

  // A spectator may still take a team while the room is in the lobby.
  const convert = client('Convert');
  convert.s.emit('room:join', { roomCode: code, playerName: 'Convert', asSpectator: true });
  await waitFor(() => convert.playerId, 'convert joined');
  r.check('Convert starts as a spectator',
    host.room.players[convert.playerId]?.isSpectator === true);
  await sleep(RATE_GAP);
  convert.s.emit('team:join', { roomCode: code, team: 'red' });
  await waitFor(() => host.room.teams.red.players.length === 2, 'convert took a team');
  r.check('Taking a team in the lobby stops you being a spectator',
    host.room.players[convert.playerId]?.isSpectator === false,
    JSON.stringify(host.room.players[convert.playerId]));

  // =====================================================================
  // 3. Start the match; a player cannot join, a spectator can
  // =====================================================================
  r.section('3. Joining a match in progress');

  await sleep(RATE_GAP);
  host.s.emit('teams:lock', { roomCode: code });
  await waitFor(() => host.room.phase === 'category_pick', 'category_pick', 12000);

  const clients = [host, mate, foe, convert];
  const pickTeam = host.room.categoryPickTeam ?? host.room.coinTossWinner;
  const picker = clients.find((c) => myTeam(c) === pickTeam && host.room.teams[pickTeam].captain === c.playerId)
    ?? clientOnTeam(clients, pickTeam);
  await sleep(RATE_GAP);
  picker.s.emit('category:pick', { roomCode: code, category: 'general' });
  await waitFor(() => host.room.phase === 'question' && host.room.activeQuestion, 'first question');

  const latePlayer = client('LatePlayer');
  latePlayer.s.emit('room:join', { roomCode: code, playerName: 'LatePlayer' });
  await sleep(900);
  r.check('A PLAYER cannot join a match in progress',
    latePlayer.playerId === null &&
      latePlayer.errors.some((e) => /already in progress/i.test(e)),
    JSON.stringify(latePlayer.errors));
  r.check('The refusal points them at spectating',
    latePlayer.errors.some((e) => /spectator/i.test(e)),
    JSON.stringify(latePlayer.errors));

  const lateWatcher = client('LateWatcher');
  lateWatcher.s.emit('room:join', { roomCode: code, playerName: 'LateWatcher', asSpectator: true });
  await waitFor(() => lateWatcher.playerId, 'late spectator joined mid-match', 6000);
  r.check('A SPECTATOR can join a match in progress',
    lateWatcher.playerId !== null && lateWatcher.room?.phase === 'question',
    `phase=${lateWatcher.room?.phase}`);

  // =====================================================================
  // 4. The state a spectator receives hides the answer
  // =====================================================================
  r.section('4. Anti-cheat');

  r.check('The spectator state hides the answer key',
    lateWatcher.room.activeQuestion.question.answer === undefined,
    `${lateWatcher.room.activeQuestion.question.answer}`);
  r.check('The spectator state hides the explanation',
    lateWatcher.room.activeQuestion.question.explanation === undefined);
  r.check('The spectator still sees the question text and options',
    typeof lateWatcher.room.activeQuestion.question.text === 'string' &&
      Object.keys(lateWatcher.room.activeQuestion.question.options).length === 5);

  // =====================================================================
  // 5. Every action is refused
  // =====================================================================
  r.section('5. Actions refused');

  const refusals = [
    ['vote:cast', { optionKey: 'A' }, /spectators cannot vote/i, 'vote'],
    ['joker:use', { type: 'fifty_fifty' }, /spectators cannot use jokers/i, 'use a joker'],
    ['steal:pass', {}, /spectators cannot pass a steal/i, 'pass a steal'],
    ['surrender:initiate', {}, /spectators cannot surrender/i, 'surrender'],
  ];

  for (const [event, payload, pattern, label] of refusals) {
    await sleep(RATE_GAP);
    lateWatcher.errors.length = 0;
    lateWatcher.s.emit(event, payload);
    await sleep(700);
    r.check(`A spectator cannot ${label}`,
      lateWatcher.errors.some((e) => pattern.test(e)),
      JSON.stringify(lateWatcher.errors));
  }

  // The refused vote must not appear in the tally either.
  r.check('A refused spectator vote is not recorded',
    host.room.activeQuestion.votes[lateWatcher.playerId] === undefined,
    JSON.stringify(Object.keys(host.room.activeQuestion.votes)));

  // A spectator must not become a team member mid-match.
  await sleep(RATE_GAP);
  lateWatcher.errors.length = 0;
  lateWatcher.s.emit('team:join', { roomCode: code, team: 'blue' });
  await sleep(700);
  r.check('A spectator cannot take a team mid-match',
    lateWatcher.errors.some((e) => /cannot join a team/i.test(e)),
    JSON.stringify(lateWatcher.errors));
  r.check('The blue roster is unchanged', host.room.teams.blue.players.length === 2,
    `${host.room.teams.blue.players.length}`);

  // =====================================================================
  // 6. A spectator CAN react
  // =====================================================================
  r.section('6. Reactions are allowed');

  host.emojis.length = 0;
  lateWatcher.s.emit('emoji:send', { emoji: 'clap' });
  await waitFor(() => host.emojis.length > 0, 'spectator reaction delivered', 5000);
  r.check('A spectator can send a reaction',
    host.emojis[0].emoji === 'clap', JSON.stringify(host.emojis[0]));
  r.check('The reaction is tagged with no team',
    host.emojis[0].team === null, `${host.emojis[0].team}`);

  // =====================================================================
  // 7. Spectators do not count toward the surrender threshold
  // =====================================================================
  r.section('7. Surrender threshold');

  // Blue has 2 connected players, and there are now 2 spectators in the room.
  // Threshold must be ceil(2 * 0.51) = 2 — the two blue players. If spectators
  // counted, ceil(4 * 0.51) = 3 could never be reached and the vote would be
  // cancelled as impossible instead of surrendering.
  const blueClients = [host, mate].filter((c) => myTeam(c) === 'blue');
  r.check('Blue really has 2 connected players', blueClients.length === 2,
    `${blueClients.length}`);
  const spectatorCount = Object.values(host.room.players).filter((p) => p.isSpectator).length;
  r.check('There are spectators present for this check', spectatorCount >= 2,
    `${spectatorCount}`);

  await sleep(RATE_GAP);
  blueClients[0].s.emit('surrender:initiate', {});
  await waitFor(() => host.room.surrenderVote !== null, 'surrender vote opened', 8000);
  r.check('A 2-player team opens a vote rather than surrendering instantly',
    host.room.surrenderVote?.team === 'blue', JSON.stringify(host.room.surrenderVote));

  await sleep(RATE_GAP);
  blueClients[1].s.emit('surrender:vote', { vote: true });
  await waitFor(() => host.room.phase === 'finished', 'surrender executed', 8000);
  r.check('Two yes votes surrender even with spectators in the room',
    host.room.phase === 'finished', `phase=${host.room.phase}`);
  r.check('The opponents were awarded the win',
    host.room.teams.red.score >= host.room.winThreshold,
    `${host.room.teams.red.score}/${host.room.winThreshold}`);

  // =====================================================================
  // 8. A spectator cannot start a rematch
  // =====================================================================
  r.section('8. Rematch');

  await sleep(RATE_GAP);
  lateWatcher.errors.length = 0;
  lateWatcher.s.emit('rematch:request', {});
  await sleep(800);
  r.check('A spectator cannot start a rematch',
    lateWatcher.errors.some((e) => /spectators cannot start a rematch/i.test(e)),
    JSON.stringify(lateWatcher.errors));
  r.check('No team consent was recorded by the spectator request',
    host.room.rematch.blue === false && host.room.rematch.red === false,
    JSON.stringify(host.room.rematch));

  teardown(created);
}

main()
  .then(() => process.exit(r.finish()))
  .catch((err) => {
    console.error(`\n[ERROR] ${err.message}`);
    r.check(`Test run completed without throwing (${err.message})`, false);
    teardown(created);
    process.exit(r.finish() || 1);
  });
