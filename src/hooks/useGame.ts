'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { EMOJI_VISIBLE_MS } from '@/lib/emoji';
import type {
  AnswerRevealPayload,
  Category,
  EmojiName,
  EmojiReactionPayload,
  GameErrorPayload,
  JokerState,
  JokerType,
  Room,
  RoomCreatedPayload,
  RoomErrorPayload,
  RoomJoinedPayload,
  TeamColor,
  TimerTickPayload,
} from '@/types';

const SESSION_KEY = (roomCode: string) => `quizzy_player_${roomCode}`;

export interface UseGameReturn {
  room: Room | null;
  playerId: string | null;
  timeLeft: number;
  answerReveal: AnswerRevealPayload | null;
  roomError: string | null;
  gameError: string | null;
  /** Reactions currently floating on screen (PBI 11). */
  reactions: EmojiReactionPayload[];

  myPlayer: Room['players'][string] | null;
  myTeam: TeamColor | null;
  isCaptain: boolean;
  isMyTurn: boolean;
  isHost: boolean;
  myVote: string | null;
  /** A steal window is open on the current question. */
  isStealActive: boolean;
  /** My team is the one attempting the steal. */
  isMyStealTurn: boolean;
  /** Steal charges my team has left (0 when I'm not on a team). */
  myStealCharges: number;
  /** Jokers my team still holds (PBI 6). */
  myJokers: JokerState;
  /** True when I may spend a joker right now. */
  canUseJoker: boolean;
  /** My team has already agreed to a rematch (PBI 8). */
  myTeamWantsRematch: boolean;
  /** The other team has agreed and is waiting on mine. */
  opponentWantsRematch: boolean;

  actions: {
    joinTeam: (team: TeamColor) => void;
    leaveTeam: () => void;
    voteCaptain: (nomineeId: string) => void;
    lockTeams: () => void;
    pickCategory: (category: Category) => void;
    castVote: (optionKey: string) => void;
    finalizeVote: () => void;
    clearErrors: () => void;
    initiateSurrender: () => void;
    voteSurrender: (vote: boolean) => void;
    passSteal: () => void;
    useJoker: (type: JokerType) => void;
    sendEmoji: (emoji: EmojiName) => void;
    requestRematch: () => void;
  };
}

export function useGame(roomCode: string): UseGameReturn {
  const [room, setRoom] = useState<Room | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [answerReveal, setAnswerReveal] = useState<AnswerRevealPayload | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [reactions, setReactions] = useState<EmojiReactionPayload[]>([]);

  const playerId = useMemo<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(SESSION_KEY(roomCode));
  }, [roomCode]);

  const playerIdRef = useRef(playerId);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);

  // Ref to cancel stale reveal auto-clear timeouts
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to cancel stale gameError auto-clear timeouts
  const gameErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socket = getSocket();

    if (!socket.connected) socket.connect();

    const reconnect = () => {
      const pid = playerIdRef.current;
      if (pid && roomCode) socket.emit('room:reconnect', { roomCode, playerId: pid });
    };

    socket.on('connect', reconnect);
    if (socket.connected) reconnect();

    // -------------------------------------------------------------------------
    // Inbound events
    // -------------------------------------------------------------------------

    const onRoomCreated = (payload: RoomCreatedPayload) => {
      sessionStorage.setItem(SESSION_KEY(payload.roomCode), payload.playerId);
      setRoom(payload.room);
    };

    const onRoomJoined = (payload: RoomJoinedPayload) => {
      if (payload.playerId) sessionStorage.setItem(SESSION_KEY(roomCode), payload.playerId);
      setRoom(payload.room);
    };

    const onRoomUpdate = (updatedRoom: Room) => {
      setRoom(updatedRoom);

      if (updatedRoom.phase === 'question' || updatedRoom.phase === 'category_pick') {
        // Clear reveal when a new voting window opens or category pick interrupts
        if (revealTimeoutRef.current) {
          clearTimeout(revealTimeoutRef.current);
          revealTimeoutRef.current = null;
        }
        setAnswerReveal(null);

        // Immediately sync timer display — don't wait for first timer_tick
        if (updatedRoom.activeQuestion) {
          setTimeLeft(updatedRoom.activeQuestion.timeLeft);
        }
      }
    };

    const onRoomError = (payload: RoomErrorPayload) => setRoomError(payload.message);

    const onGameError = (payload: GameErrorPayload) => {
      setGameError(payload.message);
      // Auto-dismiss game errors after 4s
      if (gameErrorTimeoutRef.current) clearTimeout(gameErrorTimeoutRef.current);
      gameErrorTimeoutRef.current = setTimeout(() => {
        setGameError(null);
        gameErrorTimeoutRef.current = null;
      }, 4000);
    };

    const onAnswerReveal = (payload: AnswerRevealPayload) => {
      // Cancel any pending auto-clear from a previous reveal
      if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current);
      setAnswerReveal(payload);
      revealTimeoutRef.current = setTimeout(() => {
        setAnswerReveal(null);
        revealTimeoutRef.current = null;
      }, 3000);
    };

    const onTimerTick = (payload: TimerTickPayload) => setTimeLeft(payload.timeLeft);

    // Reactions are ephemeral and are not part of room state, so they live here
    // and are dropped once their float animation has finished. Filtering by
    // timestamp rather than per-reaction timeouts means a burst cannot leave a
    // pile of pending timers behind on unmount.
    const onEmojiReaction = (payload: EmojiReactionPayload) => {
      setReactions((prev) => {
        const cutoff = Date.now() - EMOJI_VISIBLE_MS;
        return [...prev.filter((rx) => rx.at > cutoff), payload];
      });
    };

    socket.on('room:created', onRoomCreated);
    socket.on('room:joined', onRoomJoined);
    socket.on('room:update', onRoomUpdate);
    socket.on('room:error', onRoomError);
    socket.on('game:error', onGameError);
    socket.on('answer_reveal', onAnswerReveal);
    socket.on('timer_tick', onTimerTick);
    socket.on('emoji:reaction', onEmojiReaction);

    return () => {
      socket.off('connect', reconnect);
      socket.off('room:created', onRoomCreated);
      socket.off('room:joined', onRoomJoined);
      socket.off('room:update', onRoomUpdate);
      socket.off('room:error', onRoomError);
      socket.off('game:error', onGameError);
      socket.off('answer_reveal', onAnswerReveal);
      socket.off('timer_tick', onTimerTick);
      socket.off('emoji:reaction', onEmojiReaction);
      // Clean up pending timeouts
      if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current);
      if (gameErrorTimeoutRef.current) clearTimeout(gameErrorTimeoutRef.current);
    };
  }, [roomCode]);

  // Prune reactions once the last one has floated away. Without this the final
  // reaction of a burst stays mounted at opacity 0 forever, because the filter
  // in the handler only runs when a NEW reaction arrives.
  useEffect(() => {
    if (reactions.length === 0) return;
    const oldest = Math.min(...reactions.map((rx) => rx.at));
    const delay = Math.max(50, oldest + EMOJI_VISIBLE_MS - Date.now());
    const handle = setTimeout(() => {
      const cutoff = Date.now() - EMOJI_VISIBLE_MS;
      setReactions((prev) => prev.filter((rx) => rx.at > cutoff));
    }, delay);
    return () => clearTimeout(handle);
  }, [reactions]);

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const myPlayer = useMemo(
    () => (room && playerId ? room.players[playerId] ?? null : null),
    [room, playerId],
  );

  const myTeam = myPlayer?.team ?? null;

  const isCaptain = useMemo(() => {
    if (!room || !playerId || !myTeam) return false;
    return room.teams[myTeam].captain === playerId;
  }, [room, playerId, myTeam]);

  const isMyTurn = useMemo(() => {
    if (!room || !myTeam) return false;
    return room.activeTeam === myTeam;
  }, [room, myTeam]);

  const isHost = useMemo(() => {
    if (!room || !playerId) return false;
    return room.hostId === playerId;
  }, [room, playerId]);

  const myVote = useMemo(() => {
    if (!room?.activeQuestion || !playerId) return null;
    return room.activeQuestion.votes[playerId]?.optionKey ?? null;
  }, [room, playerId]);

  const isStealActive = room?.activeQuestion?.isSteal === true;

  const isMyStealTurn = useMemo(() => {
    if (!room?.activeQuestion?.isSteal || !myTeam) return false;
    return room.activeQuestion.stealTeam === myTeam;
  }, [room, myTeam]);

  const myStealCharges = useMemo(() => {
    if (!room || !myTeam) return 0;
    return room.stealCharges?.[myTeam] ?? 0;
  }, [room, myTeam]);

  const myJokers = useMemo<JokerState>(() => {
    if (!room || !myTeam) return { fiftyFifty: false, extraTime: false };
    return room.jokers?.[myTeam] ?? { fiftyFifty: false, extraTime: false };
  }, [room, myTeam]);

  // Mirrors the server's guards in useJoker so the UI never offers a click the
  // server is going to refuse.
  const canUseJoker = useMemo(() => {
    if (!room || !myTeam || !isCaptain) return false;
    if (room.phase !== 'question' || !room.activeQuestion) return false;
    if (room.activeQuestion.isSteal) return false;
    if (room.activeQuestion.timeLeft <= 0) return false;
    return room.activeTeam === myTeam;
  }, [room, myTeam, isCaptain]);

  const myTeamWantsRematch = useMemo(() => {
    if (!room || !myTeam) return false;
    return room.rematch?.[myTeam] === true;
  }, [room, myTeam]);

  const opponentWantsRematch = useMemo(() => {
    if (!room || !myTeam) return false;
    return room.rematch?.[myTeam === 'blue' ? 'red' : 'blue'] === true;
  }, [room, myTeam]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const emit = useCallback((event: string, payload?: object) => {
    getSocket().emit(event, { roomCode, ...payload });
  }, [roomCode]);

  const actions = useMemo(
    () => ({
      joinTeam:     (team: TeamColor)  => emit('team:join',      { team }),
      leaveTeam:    ()                 => emit('team:leave'),
      voteCaptain:  (nomineeId: string)=> emit('captain:vote',   { nomineeId }),
      lockTeams:    ()                 => emit('teams:lock'),
      pickCategory: (category: Category) => emit('category:pick', { category }),
      castVote:         (optionKey: string) => emit('vote:cast',        { optionKey }),
      finalizeVote:     ()                  => emit('vote:finalize'),
      initiateSurrender:()                  => emit('surrender:initiate'),
      voteSurrender:    (vote: boolean)     => emit('surrender:vote',    { vote }),
      passSteal:        ()                  => emit('steal:pass'),
      useJoker:         (type: JokerType)   => emit('joker:use',        { type }),
      sendEmoji:        (emoji: EmojiName)  => emit('emoji:send',       { emoji }),
      requestRematch:   ()                  => emit('rematch:request'),
      clearErrors:  () => { setRoomError(null); setGameError(null); },
    }),
    [emit],
  );

  return {
    room,
    playerId,
    timeLeft,
    answerReveal,
    roomError,
    gameError,
    reactions,
    myPlayer,
    myTeam,
    isCaptain,
    isMyTurn,
    isHost,
    myVote,
    isStealActive,
    isMyStealTurn,
    myStealCharges,
    myJokers,
    canUseJoker,
    myTeamWantsRematch,
    opponentWantsRematch,
    actions,
  };
}
