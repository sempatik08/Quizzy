'use strict';

/**
 * Emoji reaction configuration (PBI 11).
 *
 * Lives in its own module rather than in server.js so tests and the client can
 * import the allow-list without requiring server.js — which starts listening on
 * import and would have a test fighting the real server for the port.
 */

/**
 * Reactions are picked from a fixed allow-list.
 *
 * Accepting an arbitrary string would let a client push any text — or any length
 * of it — onto every other player's screen. A closed set makes the payload a
 * token rather than user content: nothing to sanitize, nothing to render as
 * markup, and no way to smuggle a message through the reaction channel.
 *
 * The keys are names, not the glyphs themselves, so the client owns how each one
 * is drawn and the wire format stays stable if a glyph is ever swapped.
 */
const ALLOWED_EMOJI = [
  'thumbs_up',
  'fire',
  'laugh',
  'shock',
  'sad',
  'clap',
  'thinking',
  'heart',
];

/**
 * Per-player cooldown. The global 500 ms rate limiter is far too loose for
 * something that renders on everyone else's screen.
 */
const EMOJI_COOLDOWN_MS = 2000;

function isValidEmoji(val) {
  return typeof val === 'string' && ALLOWED_EMOJI.includes(val);
}

module.exports = { ALLOWED_EMOJI, EMOJI_COOLDOWN_MS, isValidEmoji };
