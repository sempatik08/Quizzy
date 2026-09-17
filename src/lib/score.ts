import type { Room, TeamColor } from '@/types';

/**
 * Points needed to win, from the room rather than a constant.
 *
 * The threshold varies by game mode (PBI 9), and three call sites previously
 * hardcoded 100 — the scoreboard, the winner screen and the win sound. A mode
 * change would have left all three lying.
 */
export function winThresholdOf(room: Pick<Room, 'winThreshold'>): number {
  return room.winThreshold ?? 100;
}

/** The winning team, or null while the match is still live. */
export function winnerOf(room: Pick<Room, 'teams' | 'winThreshold'>): TeamColor | null {
  const target = winThresholdOf(room);
  if (room.teams.blue.score >= target) return 'blue';
  if (room.teams.red.score >= target) return 'red';
  return null;
}
