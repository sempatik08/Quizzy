import type { GameModeKey } from '@/types';

/**
 * Client-side view of the game modes (PBI 9).
 *
 * The server is authoritative — a room carries its own resolved
 * questionSeconds/stealSeconds/winThreshold, and the UI reads those, not this
 * table. What lives here is only what the client needs BEFORE a room exists
 * (the create form) or cannot get from room state (the wager stakes, which are
 * a rule rather than a resolved value).
 */

export const MODE_KEYS: GameModeKey[] = ['classic', 'fast', 'survival', 'wager'];

/** Stakes the Wager mode offers. Mirrors wagerOptions in server/gameModes.js. */
export const WAGER_OPTIONS = [3, 5, 10];

export function isWagerMode(mode: GameModeKey | undefined): boolean {
  return mode === 'wager';
}

export function isSurvivalMode(mode: GameModeKey | undefined): boolean {
  return mode === 'survival';
}
