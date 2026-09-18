import type { GameModeKey } from '@/types';
import modeData from '@/data/game-modes.json';

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

/** Stakes the Wager mode offers. Generated from server/gameModes.js. */
export const WAGER_OPTIONS: number[] = modeData.wagerOptions;

/**
 * Win targets, for copy that has to name a number BEFORE a room exists (the
 * create form, the footer). Once a room exists the UI reads room.winThreshold
 * instead — that is authoritative.
 *
 * These were hardcoded as "100" in five places and all five went stale the
 * moment the thresholds were rebalanced, so the values are now GENERATED from
 * server/gameModes.js by scripts/sync-game-modes.js and pinned to it by
 * tests/game_modes_test.js.
 */
export const MODE_WIN_THRESHOLD: Record<GameModeKey, number> =
  modeData.winThreshold as Record<GameModeKey, number>;

/** The headline target shown in generic copy. */
export const DEFAULT_WIN_THRESHOLD = MODE_WIN_THRESHOLD.classic;

export function isWagerMode(mode: GameModeKey | undefined): boolean {
  return mode === 'wager';
}

export function isSurvivalMode(mode: GameModeKey | undefined): boolean {
  return mode === 'survival';
}
