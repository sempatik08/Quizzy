export type GamePhase =
  | 'lobby'
  | 'coin_toss'
  | 'category_pick'
  | 'question'
  | 'finished';

export type Category =
  | 'general'
  | 'sports'
  | 'history'
  | 'music'
  | 'cinema'
  | 'anime'
  | 'games'
  | 'technology'
  | 'literature'
  | 'math'
  | 'geography'
  | 'philosophy';
export type TeamColor = 'blue' | 'red';

/** Game modes (PBI 9). Must stay in sync with server/gameModes.js. */
export type GameModeKey = 'classic' | 'fast' | 'survival' | 'wager';

/** Guest avatars (PBI 14). Must stay in sync with AVATARS in server/stats.js. */
export type AvatarName =
  | 'fox' | 'owl' | 'cat' | 'bear' | 'wolf' | 'panda'
  | 'shark' | 'dragon' | 'robot' | 'alien' | 'ninja' | 'wizard';
export type OptionKey = 'A' | 'B' | 'C' | 'D' | 'E';

export interface Player {
  id: string;
  socketId: string;
  name: string;
  team: TeamColor | null;
  isConnected: boolean;
  /**
   * Watching rather than playing (PBI 10). Distinct from `team === null`, which
   * is also true of a player sitting in the lobby who has not picked a side yet.
   */
  isSpectator: boolean;
  /** Knocked out of the current match in Survival mode (PBI 9). */
  isEliminated: boolean;
  /**
   * Chosen avatar (PBI 14). null for a client with no profile.
   * NOTE: the matching `profileId` is deliberately NOT part of this type —
   * sanitizeRoom strips it, because it is the only credential a guest has.
   */
  avatar: AvatarName | null;
}

export interface TeamState {
  players: string[];
  captain: string | null;
  captainVotes: Record<string, string>; // voterId → nomineeId
  score: number;
}

/**
 * Question as received by the client — answer field is STRIPPED by server.
 * text_tr / options_tr are optional Turkish translations.
 */
export interface Question {
  id: string;
  /** null while a Wager-mode question is still hidden (PBI 9). */
  text: string | null;
  text_tr?: string | null;
  options: Record<OptionKey, string> | null;
  options_tr?: Record<OptionKey, string> | null;
}

export interface VoteEntry {
  optionKey: OptionKey;
  timestamp: number;
}

export interface ActiveQuestion {
  /**
   * In Wager mode the server blanks `text` and `options` until the stake is
   * locked in, so these are nullable while `wagerPending` is true (PBI 9).
   */
  question: Question;
  /** Difficulty actually served: 1 easy, 2 medium, 3 hard (PBI 7). */
  difficulty: 1 | 2 | 3;
  disabledOptions: OptionKey[];
  votes: Record<string, VoteEntry>; // playerId → vote
  timerStart: number;
  /** Seconds allotted for the current window — 60 normally, 20 during a steal. */
  duration: number;
  timeLeft: number;
  /** True once the opposing team has taken this question over. */
  isSteal: boolean;
  /** Which team is attempting the steal, if any. */
  stealTeam: TeamColor | null;
  /** Wager mode: the question is hidden until a stake is placed (PBI 9). */
  wagerPending: boolean;
  /** Points staked on this question. null outside Wager mode. */
  wager: number | null;
}

/** Jokers a team still holds this match (PBI 6). */
export interface JokerState {
  /** Strikes out two wrong options. */
  fiftyFifty: boolean;
  /** Adds 15 seconds to the running question. */
  extraTime: boolean;
}

export type JokerType = 'fifty_fifty' | 'extra_time';

export interface SurrenderVote {
  team: TeamColor;
  votes: Record<string, boolean>; // playerId → true (yes) | false (no)
}

export interface Room {
  code: string;
  phase: GamePhase;
  players: Record<string, Player>;
  teams: {
    blue: TeamState;
    red: TeamState;
  };
  activeTeam: TeamColor | null;
  turnTeam: TeamColor | null;
  coinTossWinner: TeamColor | null;
  selectedCategory: Category | null;
  usedQuestionIds: string[];
  usedCategories: Category[];
  activeQuestion: ActiveQuestion | null;
  surrenderVote: SurrenderVote | null;
  categoryPickTeam: TeamColor | null;
  /** Fresh questions each team has answered in the current category (PBI 3). */
  categoryAnswerCount: Record<TeamColor, number>;
  /** Remaining steal attempts per team. A charge burns only on a submitted steal. */
  stealCharges: Record<TeamColor, number>;
  /** Which rule set this match is playing (PBI 9). */
  mode: GameModeKey;
  /** Voting window for a fresh question, resolved from the mode. */
  questionSeconds: number;
  /** Voting window for a steal, resolved from the mode. */
  stealSeconds: number;
  /** Points needed to win this match (PBI 7 / PBI 9). */
  winThreshold: number;
  /** Jokers each team still holds (PBI 6). */
  jokers: Record<TeamColor, JokerState>;
  /** Per-team consent to replay the match once it has finished (PBI 8). */
  rematch: Record<TeamColor, boolean>;
  createdAt: number;
  lastActivityAt: number;
  hostId: string;
}

// ---------------------------------------------------------------------------
// Socket event payloads
// ---------------------------------------------------------------------------

export interface RoomCreatedPayload {
  roomCode: string;
  playerId: string;
  room: Room;
}

export interface RoomJoinedPayload {
  playerId: string;
  room: Room;
}

export interface RoomErrorPayload {
  message: string;
}

export interface GameErrorPayload {
  message: string;
}

export interface AnswerRevealPayload {
  /** null when the window expired with no votes cast. */
  selectedOption: OptionKey | null;
  /**
   * Points this resolution is worth: positive when won, negative when a Wager
   * stake is lost, 0 otherwise. Sent by the server because the client cannot
   * derive it — in Wager mode it is the stake, not the mode's flat award.
   */
  pointsDelta: number;
  /** ANTI-CHEAT: omitted by the server while the question can still be stolen. */
  correctAnswer?: OptionKey;
  isCorrect: boolean;
  activeTeam: TeamColor;
  /** True when this reveal resolves a steal attempt. */
  isSteal: boolean;
  /** True when a steal window is about to open on this question. */
  stealOpens: boolean;
}

export interface TimerTickPayload {
  timeLeft: number;
}

// ---------------------------------------------------------------------------
// Profiles, history and leaderboard (PBI 14)
// ---------------------------------------------------------------------------

/** A guest's stored record. `rank` is null until they have played a match. */
export interface GuestProfile {
  id?: string;
  name: string;
  avatar: AvatarName;
  matches: number;
  wins: number;
  losses: number;
  points: number;
  createdAt?: number;
  lastSeenAt?: number;
  rank?: number | null;
}

export interface MatchHistoryEntry {
  roomCode: string;
  mode: GameModeKey;
  team: TeamColor;
  won: boolean;
  myScore: number;
  theirScore: number;
  category: Category | null;
  questions: number;
  durationMs: number | null;
  finishedAt: number;
}

/** A board row. Carries no profile id — the board is public. */
export interface LeaderboardEntry {
  rank: number;
  name: string;
  avatar: AvatarName;
  matches: number;
  wins: number;
  losses: number;
  points: number;
}

export interface LeaderboardPayload {
  entries: LeaderboardEntry[];
  total: number;
}

/** Reaction names, validated server-side against server/emoji.js (PBI 11). */
export type EmojiName =
  | 'thumbs_up'
  | 'fire'
  | 'laugh'
  | 'shock'
  | 'sad'
  | 'clap'
  | 'thinking'
  | 'heart';

export interface EmojiReactionPayload {
  /** `${playerId}-${timestamp}` — unique per reaction, used as the React key. */
  id: string;
  playerId: string;
  playerName: string;
  /** null for a player who has not joined a team. */
  team: TeamColor | null;
  emoji: EmojiName;
  at: number;
}
