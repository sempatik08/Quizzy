import type { EmojiName } from '@/types';

/**
 * Client-side half of the emoji reaction set (PBI 11).
 *
 * The server sends and validates names (`fire`), never glyphs. This map is the
 * only place that turns a name into something drawn, so a glyph can be swapped
 * without touching the wire format, and an unknown name from a newer server
 * degrades to a blank rather than crashing the render.
 */
export const EMOJI_GLYPHS: Record<EmojiName, string> = {
  thumbs_up: '👍',
  fire: '🔥',
  laugh: '😂',
  shock: '😱',
  sad: '😢',
  clap: '👏',
  thinking: '🤔',
  heart: '❤️',
};

/** Display order in the bar. Must stay in sync with server/emoji.js. */
export const EMOJI_ORDER: EmojiName[] = [
  'thumbs_up',
  'fire',
  'laugh',
  'shock',
  'sad',
  'clap',
  'thinking',
  'heart',
];

/** Mirrors EMOJI_COOLDOWN_MS in server/emoji.js so the button can lock locally. */
export const EMOJI_COOLDOWN_MS = 2000;

/** How long a floating reaction stays on screen — matches the CSS animation. */
export const EMOJI_VISIBLE_MS = 2600;
