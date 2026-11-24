import { track as vercelTrack } from '@vercel/analytics';

/**
 * Funnel events (PBI 22). One place lists every event name so the dashboard
 * and the code cannot drift apart:
 *
 *   room_created      { mode }                  a room was opened from the home page
 *   invite_copied     { via }                   invite link copied / shared (link, code, whatsapp)
 *   join_opened       {}                        someone landed on an invite link (/join/…)
 *   match_started     { mode, players }         the first question of a match was shown
 *   match_finished    { mode, players }         the winner / final standings screen was reached
 *   lobby_abandoned   { seconds, players }      left a lobby that never started a match
 *   alone_card_action { action }                what a lonely host chose (PBI 24)
 *   daily_finished    { score, day }            finished the Daily Quiz (PBI 26)
 *   daily_shared      { via }                   shared the Daily Quiz grid
 *   support_clicked   { placement }             clicked "Support Quizzy" (PBI 31)
 *
 * No names, room codes or player ids go in here — only counts and modes.
 * Analytics must never break the game, so every call is wrapped.
 */
export type TrackEvent =
  | 'room_created'
  | 'invite_copied'
  | 'join_opened'
  | 'match_started'
  | 'match_finished'
  | 'lobby_abandoned'
  | 'alone_card_action'
  | 'daily_finished'
  | 'daily_shared'
  | 'support_clicked';

export function track(event: TrackEvent, props?: Record<string, string | number | boolean | null>): void {
  try {
    vercelTrack(event, props);
  } catch {
    // Blocked by an extension or not on Vercel: the game does not care.
  }
}
