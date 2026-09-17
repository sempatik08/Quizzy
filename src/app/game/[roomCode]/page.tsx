'use client';

import { useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Zap } from 'lucide-react';
import { useGame } from '@/hooks/useGame';
import { ScoreBoard } from '@/components/game/ScoreBoard';
import { QuestionCard } from '@/components/game/QuestionCard';
import { VotingTimer } from '@/components/game/VotingTimer';
import { WinnerScreen } from '@/components/game/WinnerScreen';
import { StealBanner } from '@/components/game/StealBanner';
import { SurrenderPanel } from '@/components/game/SurrenderPanel';
import { JokerPanel } from '@/components/game/JokerPanel';
import { EmojiBar } from '@/components/game/EmojiBar';
import { WagerPanel } from '@/components/game/WagerPanel';
import { WAGER_OPTIONS } from '@/lib/gameModes';
import { RoomCodeBadge } from '@/components/shared/RoomCodeBadge';
import { SpectatorBanner } from '@/components/shared/SpectatorBanner';
import { CategoryPicker } from '@/components/lobby/CategoryPicker';
import { useLanguage } from '@/context/LanguageContext';
import { useSound } from '@/context/SoundContext';
import { winnerOf } from '@/lib/score';

export default function GamePage() {
  const params = useParams();
  const roomCode = (params.roomCode as string).toUpperCase();
  const router = useRouter();
  const { t } = useLanguage();
  const { play } = useSound();

  const {
    room,
    playerId,
    myTeam,
    isCaptain,
    isSpectator,
    isEliminated,
    isWagerPending,
    canPlaceWager,
    spectators,
    timeLeft,
    answerReveal,
    isMyTurn,
    isStealActive,
    isMyStealTurn,
    myJokers,
    canUseJoker,
    reactions,
    myTeamWantsRematch,
    opponentWantsRematch,
    gameError,
    actions,
  } = useGame(roomCode);

  // Guard: redirect if no session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pid = sessionStorage.getItem(`quizzy_player_${roomCode}`);
      if (!pid) router.replace('/');
    }
  }, [roomCode, router]);

  // If game goes back to lobby phase, redirect (but NOT for mid-game category pick)
  useEffect(() => {
    if (room?.phase === 'lobby' || room?.phase === 'coin_toss') {
      router.replace(`/lobby/${roomCode}`);
    }
  }, [room?.phase, roomCode, router]);

  // ---- Sound cues (PBI 15) -------------------------------------------------
  // Reveals are keyed by identity rather than by a boolean: the same payload
  // shape repeats every question, so a plain dependency on answerReveal would
  // re-fire the cue on unrelated re-renders.
  const lastRevealRef = useRef<object | null>(null);
  useEffect(() => {
    if (!answerReveal || answerReveal === lastRevealRef.current) return;
    lastRevealRef.current = answerReveal;

    if (answerReveal.isCorrect) play('correct');
    else if (answerReveal.selectedOption === null) play('timeUp');
    else play('wrong');
  }, [answerReveal, play]);

  // Urgency ticks over the last few seconds. Keyed on the second so a re-render
  // inside the same second cannot double-tick.
  const lastTickRef = useRef<number>(-1);
  useEffect(() => {
    if (room?.phase !== 'question' || answerReveal) return;
    if (timeLeft > 5 || timeLeft <= 0) return;
    if (lastTickRef.current === timeLeft) return;
    lastTickRef.current = timeLeft;
    play('tick');
  }, [timeLeft, room?.phase, answerReveal, play]);

  // Fire the win/lose sting once, when the match actually ends.
  const finishedRef = useRef(false);
  useEffect(() => {
    if (room?.phase !== 'finished') {
      finishedRef.current = false;
      return;
    }
    if (finishedRef.current) return;
    finishedRef.current = true;

    const winner = winnerOf(room);
    if (!winner) return;
    play(myTeam === winner ? 'win' : 'lose');
  }, [room?.phase, room?.teams.blue.score, room?.teams.red.score, myTeam, play]);

  if (!room || !playerId) {
    return (
      <div className="min-h-screen bg-quizzy-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-quizzy-muted" size={32} />
      </div>
    );
  }

  const categoryLabel: Record<string, string> = {
    general:    t.generalCulture,
    sports:     t.sports,
    history:    t.history,
    music:      t.music,
    cinema:     t.cinema,
    anime:      t.anime,
    games:      t.games,
    technology: t.technology,
    literature: t.literature,
    math:       t.math,
    geography:  t.geography,
    philosophy: t.philosophy,
    cinema_music: t.cinemaMusic,
  };

  const teamAccent = myTeam === 'blue'
    ? { bg: 'bg-blue-pale', border: 'border-blue-light', text: 'text-blue-soft', label: t.blueTeam }
    : myTeam === 'red'
    ? { bg: 'bg-red-pale', border: 'border-red-light', text: 'text-red-soft', label: t.redTeam }
    : { bg: 'bg-quizzy-bg', border: 'border-transparent', text: 'text-quizzy-muted', label: '' };

  const activeTeamLabel = room.activeTeam === 'blue' ? t.blueTeam : t.redTeam;

  return (
    <main className="min-h-screen bg-quizzy-bg px-4 py-6 flex flex-col items-center">
      {/* Team color banner */}
      {myTeam && (
        <div className={`w-full ${teamAccent.bg} border-b ${teamAccent.border} py-1.5 mb-4 text-center text-xs font-bold uppercase tracking-widest ${teamAccent.text}`}>
          {teamAccent.label}
        </div>
      )}

      {/* Top bar */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Zap size={18} className={myTeam === 'red' ? 'text-red-soft' : 'text-blue-soft'} fill={myTeam === 'red' ? '#FF6B6B' : '#4D96FF'} />
          <span className="font-extrabold text-lg text-quizzy-text">Quizzy</span>
          {room.selectedCategory && (
            <span className="text-xs text-quizzy-muted bg-quizzy-card border border-quizzy-border rounded-full px-2.5 py-0.5 ml-1 font-medium">
              {categoryLabel[room.selectedCategory] ?? room.selectedCategory}
            </span>
          )}
          {/* Mode badge (PBI 9) — the mode changes the clock and the target, so
              it has to be visible for the scoreboard to make sense. */}
          {room.mode && room.mode !== 'classic' && (
            <span
              data-testid="mode-badge"
              data-mode={room.mode}
              className="text-xs rounded-full px-2.5 py-0.5 font-semibold border border-blue-light bg-blue-pale text-blue-soft"
            >
              {room.mode === 'fast'
                ? t.modeFast
                : room.mode === 'survival'
                ? t.modeSurvival
                : t.modeWager}
            </span>
          )}

          {/* The stake, once it is locked in. */}
          {room.phase === 'question' && room.activeQuestion?.wager != null && (
            <span
              data-testid="wager-badge"
              data-wager-amount={room.activeQuestion.wager}
              className="text-xs rounded-full px-2.5 py-0.5 font-semibold border border-amber-300 bg-amber-50 text-amber-600"
            >
              {t.wagerStaked} {room.activeQuestion.wager}
            </span>
          )}

          {/* Difficulty of the question on the table (PBI 7). Shown because an
              invisible curve just reads as inconsistent question quality. */}
          {room.phase === 'question' && !isWagerPending && room.activeQuestion && (
            <span
              data-testid="difficulty-badge"
              data-difficulty={room.activeQuestion.difficulty}
              className={`text-xs rounded-full px-2.5 py-0.5 font-semibold border ${
                room.activeQuestion.difficulty === 1
                  ? 'text-green-600 border-green-300 bg-green-50'
                  : room.activeQuestion.difficulty === 3
                  ? 'text-red-soft border-red-light bg-red-pale'
                  : 'text-amber-600 border-amber-300 bg-amber-50'
              }`}
            >
              {room.activeQuestion.difficulty === 1
                ? t.difficultyEasy
                : room.activeQuestion.difficulty === 3
                ? t.difficultyHard
                : t.difficultyMedium}
            </span>
          )}
        </div>
        <RoomCodeBadge code={roomCode} />
      </div>

      {/* Error */}
      {gameError && (
        <div className="w-full max-w-2xl mb-4 px-4 py-3 rounded-xl bg-red-pale border border-red-light text-red-soft text-sm font-medium flex items-center justify-between">
          <span>{gameError}</span>
          <button onClick={actions.clearErrors} className="ml-4 text-xs underline">{t.dismiss}</button>
        </div>
      )}

      {/* Spectator notice / watcher count (PBI 10) */}
      <SpectatorBanner isSpectator={isSpectator} spectators={spectators} />

      {/* Survival elimination notice (PBI 9). Without it an eliminated player
          just sees their votes rejected with no explanation. */}
      {isEliminated && (
        <div
          id="eliminated-banner"
          className="w-full max-w-2xl mb-4 px-4 py-2.5 rounded-xl bg-red-pale border border-red-light flex items-center gap-2"
        >
          <span className="text-xs font-bold uppercase tracking-widest text-red-soft">
            {t.eliminated}
          </span>
          <span className="text-xs text-quizzy-muted">{t.modeSurvivalDesc}</span>
        </div>
      )}

      {/* Scoreboard */}
      <div className="w-full max-w-2xl mb-5">
        <ScoreBoard room={room} playerId={playerId} />
      </div>

      {/* Mid-game category pick */}
      {room.phase === 'category_pick' && room.categoryPickTeam && (
        <div className="w-full max-w-2xl mb-5">
          <div className="bg-quizzy-card rounded-2xl shadow-card border border-quizzy-border p-6 animate-fade-in">
            <div className="text-center mb-4">
              <p className="text-sm font-semibold text-quizzy-muted uppercase tracking-widest">
                {t.categoryExhausted}
              </p>
              <p className="text-xs text-quizzy-subtle mt-1">{t.lowerScoreTeamPicks}</p>
            </div>
            <CategoryPicker
              winnerTeam={room.categoryPickTeam}
              isCaptain={isCaptain && room.teams[room.categoryPickTeam].captain === playerId}
              onPick={actions.pickCategory}
              usedCategories={[
                ...(room.usedCategories ?? []),
                ...(room.selectedCategory && !(room.usedCategories ?? []).includes(room.selectedCategory)
                  ? [room.selectedCategory]
                  : []),
              ]}
            />
          </div>
        </div>
      )}

      {/* Steal banner — same question, handed to the opposing team */}
      {room.phase === 'question' && !isWagerPending && isStealActive && room.activeQuestion?.stealTeam && (
        <div className="w-full max-w-2xl mb-4">
          <StealBanner
            stealTeam={room.activeQuestion.stealTeam}
            chargesLeft={room.stealCharges?.[room.activeQuestion.stealTeam] ?? 0}
            isMyStealTurn={isMyStealTurn}
            onPass={actions.passSteal}
            passDisabled={!!answerReveal}
          />
        </div>
      )}

      {/* Blind wager step (PBI 9). The question is genuinely absent from state
          here, so this replaces the question card rather than overlaying it. */}
      {room.phase === 'question' && isWagerPending && (
        <div className="w-full max-w-2xl">
          <WagerPanel
            options={WAGER_OPTIONS}
            canPlace={canPlaceWager}
            onPlace={actions.placeWager}
          />
        </div>
      )}

      {/* Question + Timer row */}
      {room.phase === 'question' && !isWagerPending && room.activeQuestion && (
        <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-4 items-start">
          <div className="flex-1">
            <QuestionCard
              room={room}
              playerId={playerId}
              isMyTurn={isMyTurn}
              answerReveal={answerReveal}
              onVote={actions.castVote}
              onFinalize={actions.finalizeVote}
            />
          </div>

          <div className="sm:mt-6 flex sm:flex-col items-center gap-3 sm:sticky sm:top-6">
            {/* Hide timer while answer is being revealed */}
            {!answerReveal && (
              <VotingTimer
                timeLeft={timeLeft}
                total={room.activeQuestion.duration ?? room.questionSeconds ?? 60}
              />
            )}

            {/* Active turn label */}
            {room.activeTeam && (
              <span
                className={`text-[11px] font-bold uppercase tracking-wide ${
                  isMyTurn
                    ? teamAccent.text
                    : room.activeTeam === 'blue' ? 'text-blue-soft' : 'text-red-soft'
                }`}
              >
                {isMyTurn ? t.yourTurn : `${activeTeamLabel} ${t.teamsTurn}`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Jokers — only the captain of the team on turn gets buttons (PBI 6) */}
      {room.phase === 'question' && !isWagerPending && myTeam && isCaptain
        && room.activeTeam === myTeam && (
        <div className="w-full max-w-2xl mt-4">
          <JokerPanel
            team={myTeam}
            jokers={myJokers}
            usable={canUseJoker && !answerReveal}
            reason={isStealActive ? t.jokerNotInSteal : t.jokerCaptainOnly}
            onUse={actions.useJoker}
          />
        </div>
      )}

      {/* Surrender panel — visible during active game */}
      {room.phase === 'question' && myTeam && !isEliminated && (
        <div className="w-full max-w-2xl mt-4">
          <SurrenderPanel
            room={room}
            playerId={playerId}
            myTeam={myTeam}
            onInitiate={actions.initiateSurrender}
            onVote={actions.voteSurrender}
          />
        </div>
      )}

      {/* Emoji reactions (PBI 11) — available to anyone in the room, spectators
          included: a reaction carries no information about the answer, and it is
          the one thing a watcher can meaningfully do. */}
      {(myTeam || isSpectator) && (
        <div className="w-full max-w-2xl mt-6">
          <EmojiBar reactions={reactions} onSend={actions.sendEmoji} />
        </div>
      )}

      {/* Winner screen overlay */}
      {room.phase === 'finished' && (
        <WinnerScreen
          room={room}
          playerId={playerId}
          myTeamWantsRematch={myTeamWantsRematch}
          opponentWantsRematch={opponentWantsRematch}
          onRematch={actions.requestRematch}
        />
      )}
    </main>
  );
}
