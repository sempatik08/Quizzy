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
  | 'geography';
export type TeamColor = 'blue' | 'red';
export type OptionKey = 'A' | 'B' | 'C' | 'D' | 'E';

export interface Player {
  id: string;
  socketId: string;
  name: string;
  team: TeamColor | null;
  isConnected: boolean;
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
  text: string;
  text_tr?: string;
  options: Record<OptionKey, string>;
  options_tr?: Record<OptionKey, string>;
}

export interface VoteEntry {
  optionKey: OptionKey;
  timestamp: number;
}

export interface ActiveQuestion {
  question: Question;
  disabledOptions: OptionKey[];
  votes: Record<string, VoteEntry>; // playerId → vote
  timerStart: number;
  timeLeft: number;
}

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
  selectedOption: OptionKey;
  correctAnswer: OptionKey;
  isCorrect: boolean;
  activeTeam: TeamColor;
}

export interface TimerTickPayload {
  timeLeft: number;
}
