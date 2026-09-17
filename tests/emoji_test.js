'use strict';

/**
 * Emoji reaction test (PBI 11).
 *
 *   node tests/emoji_test.js
 *
 * Requires the Socket.io server to be running.
 *
 * The two things worth guarding: an arbitrary string must never reach other
 * players' screens, and the cooldown must actually hold.
 */

const {
  sleep, RATE_GAP, createReporter, waitFor, setupMatch, myTeam, teardown,
} = require('./helpers');

const { ALLOWED_EMOJI, EMOJI_COOLDOWN_MS } = require('../server/emoji');

const r = createReporter('EMOJI REACTIONS — PBI 11');

async function main() {
  r.banner();

  const { p1, p2, clients } = await setupMatch({ category: 'general', names: ['E1', 'E2'] });

  // =====================================================================
  // 1. A reaction reaches the other player
  // =====================================================================
  r.section('1. Delivery');

  r.check('The allow-list is non-empty', ALLOWED_EMOJI.length > 0, `${ALLOWED_EMOJI.length}`);
  r.check('Cooldown is 2s', EMOJI_COOLDOWN_MS === 2000, `${EMOJI_COOLDOWN_MS}`);

  p1.emojis.length = 0;
  p2.emojis.length = 0;
  p1.s.emit('emoji:send', { emoji: 'fire' });
  await waitFor(() => p2.emojis.length > 0, 'reaction reached the opponent');

  const rx = p2.emojis[0];
  r.check('The opponent receives the reaction', rx.emoji === 'fire', JSON.stringify(rx));
  r.check('The sender sees their own reaction too', p1.emojis.length > 0,
    `${p1.emojis.length}`);
  r.check('Payload carries the sender id', rx.playerId === p1.playerId,
    `${rx.playerId} vs ${p1.playerId}`);
  r.check('Payload carries the sender name', rx.playerName === 'E1', `${rx.playerName}`);
  r.check('Payload carries the sender team', rx.team === myTeam(p1), `${rx.team}`);
  r.check('Payload carries a unique id', typeof rx.id === 'string' && rx.id.length > 0,
    `${rx.id}`);
  r.check('Payload carries a timestamp', typeof rx.at === 'number' && rx.at > 0, `${rx.at}`);

  // Reactions are ephemeral — putting them on the room would grow state
  // forever and replay stale reactions to anyone who reconnects.
  r.check('Reactions are NOT stored on the room',
    p1.room.reactions === undefined && p1.room.emojis === undefined,
    JSON.stringify(Object.keys(p1.room)));

  // =====================================================================
  // 2. The cooldown holds
  // =====================================================================
  r.section('2. Cooldown');

  p2.emojis.length = 0;
  // Five taps back to back; only the first is inside quota.
  for (let i = 0; i < 5; i++) {
    p1.s.emit('emoji:send', { emoji: 'clap' });
    await sleep(80);
  }
  await sleep(700);
  r.check('A burst of five taps delivers at most one reaction',
    p2.emojis.length <= 1, `delivered ${p2.emojis.length}`);

  p1.errors.length = 0;
  r.check('Throttled reactions are dropped silently, not error-flooded',
    p1.errors.length === 0, JSON.stringify(p1.errors));

  // After the cooldown expires the next one goes through.
  p2.emojis.length = 0;
  await sleep(EMOJI_COOLDOWN_MS + 300);
  p1.s.emit('emoji:send', { emoji: 'laugh' });
  await waitFor(() => p2.emojis.length > 0, 'reaction after the cooldown', 5000);
  r.check('A reaction lands again once the cooldown expires',
    p2.emojis[0].emoji === 'laugh', JSON.stringify(p2.emojis));

  // The cooldown is per player, not per room.
  p1.emojis.length = 0;
  p2.s.emit('emoji:send', { emoji: 'heart' });
  await waitFor(() => p1.emojis.length > 0, 'opponent reaction', 5000);
  r.check('The cooldown is per player, not per room',
    p1.emojis[0].emoji === 'heart', JSON.stringify(p1.emojis));

  // =====================================================================
  // 3. Only allow-listed names are accepted
  // =====================================================================
  r.section('3. Allow-list');

  const rejects = [
    ['an arbitrary string', 'not_an_emoji'],
    ['a raw glyph', '🔥'],
    ['a script tag', '<script>alert(1)</script>'],
    ['a long string', 'x'.repeat(500)],
    ['a number', 12345],
    ['null', null],
  ];

  for (const [label, value] of rejects) {
    await sleep(RATE_GAP);
    p1.errors.length = 0;
    p2.emojis.length = 0;
    p1.s.emit('emoji:send', { emoji: value });
    await sleep(500);
    r.check(`Rejects ${label}`,
      p2.emojis.length === 0 && p1.errors.some((e) => /invalid reaction/i.test(e)),
      `delivered=${p2.emojis.length} errors=${JSON.stringify(p1.errors)}`);
  }

  await sleep(RATE_GAP);
  p1.errors.length = 0;
  p2.emojis.length = 0;
  p1.s.emit('emoji:send', {});
  await sleep(500);
  r.check('Rejects a missing emoji field',
    p2.emojis.length === 0 && p1.errors.length > 0,
    `delivered=${p2.emojis.length} errors=${JSON.stringify(p1.errors)}`);

  // =====================================================================
  // 4. Every allow-listed name actually works
  // =====================================================================
  r.section('4. Every allow-listed name');

  let delivered = 0;
  for (const name of ALLOWED_EMOJI) {
    await sleep(EMOJI_COOLDOWN_MS + 200);
    p2.emojis.length = 0;
    p1.s.emit('emoji:send', { emoji: name });
    await sleep(450);
    if (p2.emojis.some((e) => e.emoji === name)) delivered++;
  }
  r.check(`All ${ALLOWED_EMOJI.length} allow-listed reactions are deliverable`,
    delivered === ALLOWED_EMOJI.length,
    `${delivered}/${ALLOWED_EMOJI.length}`);

  teardown(clients);
}

main()
  .then(() => process.exit(r.finish()))
  .catch((err) => {
    console.error(`\n[ERROR] ${err.message}`);
    r.check(`Test run completed without throwing (${err.message})`, false);
    process.exit(r.finish() || 1);
  });
