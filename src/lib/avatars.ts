import type { AvatarName } from '@/types';

/**
 * Guest avatars (PBI 14).
 *
 * A closed set of names, not uploads and not arbitrary text — the same reasoning
 * as the emoji allow-list. An avatar is drawn on other players' screens, so it
 * has to be a token the server can validate rather than content it has to
 * sanitize. No uploads also means no storage, no moderation and no image
 * pipeline for a 20-pixel decoration.
 *
 * Must stay in sync with AVATARS in server/stats.js.
 */
export const AVATARS: AvatarName[] = [
  'fox', 'owl', 'cat', 'bear', 'wolf', 'panda',
  'shark', 'dragon', 'robot', 'alien', 'ninja', 'wizard',
];

export const DEFAULT_AVATAR: AvatarName = 'fox';

/** The glyph each name draws as. The client owns this, so a glyph can change
 *  without a protocol change. */
export const AVATAR_GLYPHS: Record<AvatarName, string> = {
  fox: '🦊',
  owl: '🦉',
  cat: '🐱',
  bear: '🐻',
  wolf: '🐺',
  panda: '🐼',
  shark: '🦈',
  dragon: '🐲',
  robot: '🤖',
  alien: '👽',
  ninja: '🥷',
  wizard: '🧙',
};

export function isAvatarName(value: unknown): value is AvatarName {
  return typeof value === 'string' && (AVATARS as string[]).includes(value);
}

/** Falls back rather than rendering a blank for an unknown name from a newer server. */
export function avatarGlyph(name: string | null | undefined): string {
  return isAvatarName(name) ? AVATAR_GLYPHS[name] : AVATAR_GLYPHS[DEFAULT_AVATAR];
}
