'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Flame, Ghost, RotateCcw, Search, Trophy, XCircle } from 'lucide-react';
import type { Category, OptionKey, Room } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useSound } from '@/context/SoundContext';
import { avatarGlyph } from '@/lib/avatars';
import { ghostWhen } from '@/lib/ghost';
import { VotingTimer } from '@/components/game/VotingTimer';
import { Confetti } from '@/components/game/Confetti';
import { FfaCategoryPick } from './FfaCategoryPick';

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D', 'E'];

/**
 * One colour per option, Kahoot-style, so a player can answer by colour as
 * well as by letter. Shades chosen for at least 4.5:1 contrast with white text.
 */
const OPTION_COLORS: Record<OptionKey, string> = {
  A: 'bg-rose-600 border-rose-600',
  B: 'bg-blue-600 border-blue-600',
  C: 'bg-amber-700 border-amber-700',
  D: 'bg-green-700 border-green-700',
  E: 'bg-violet-600 border-violet-600',
};

interface FfaGameProps {
  room: Room;
  playerId: string;
  timeLeft: number;
  isSpectator: boolean;
  onAnswer: (optionKey: string) => void;
  onPick: (category: Category) => void;
  onRematch: () => void;
}

interface Row {
  playerId: string;
  name: string;
  avatar: string | null;
  score: number;
  rank: number;
  /** A recorded run rather than a live player (PBI 35). */
  ghost?: boolean;
}

/** Live ranking from room.ffa.players — same ordering rule as the server. */
function rankRows(room: Room): Row[] {
  const ffa = room.ffa;
  if (!ffa) return [];
  const order = Object.keys(room.players);
  const rows = Object.entries(ffa.players)
    .map(([id, s]) => ({
      playerId: id,
      name: room.players[id]?.name ?? '?',
      avatar: room.players[id]?.avatar ?? null,
      ghost: Boolean(room.players[id]?.isGhost),
      score: s.score,
      correct: s.correct,
      join: order.indexOf(id),
    }))
    .sort((a, b) => b.score - a.score || b.correct - a.correct || a.join - b.join);
  let rank = 0;
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.score !== r.score || prev.correct !== r.correct) rank = i + 1;
    return { playerId: r.playerId, name: r.name, avatar: r.avatar, score: r.score, rank, ghost: r.ghost };
  });
}

/**
 * The whole in-match screen for free-for-all (PBI 19): category pick, the
 * question, the per-round result with the top five, and the final podium.
 */
export function FfaGame({ room, playerId, timeLeft, isSpectator, onAnswer, onPick, onRematch }: FfaGameProps) {
  const { t, language } = useLanguage();
  const { play } = useSound();
  const router = useRouter();
  const ffa = room.ffa;
  const aq = room.activeQuestion;
  const total = room.totalQuestions ?? 15;
  const qNum = ffa?.questionNumber ?? 0;

  // The server hides everyone's option until the reveal — mine included, since
  // the broadcast is the same for the whole room. So my choice is kept here.
  const [mine, setMine] = useState<{ q: number; option: OptionKey } | null>(null);
  const myOption = mine?.q === qNum ? mine.option : null;
  const answered = Boolean(aq?.votes?.[playerId]);
  const revealed = aq?.revealed === true;
  const iAmPlaying = Boolean(ffa?.players[playerId]);

  const rows = useMemo(() => rankRows(room), [room]);
  const myRow = rows.find((r) => r.playerId === playerId) ?? null;
  const myResult = revealed ? ffa?.lastRound?.results[playerId] ?? null : null;

  // Result sound, once per round.
  const soundedRef = useRef(0);
  useEffect(() => {
    if (!revealed || !myResult || soundedRef.current === qNum) return;
    soundedRef.current = qNum;
    if (myResult.isCorrect) play('correct');
    else if (myResult.optionKey === null) play('timeUp');
    else play('wrong');
  }, [revealed, myResult, qNum, play]);

  // Countdown ticks in the last five seconds.
  const tickRef = useRef(-1);
  useEffect(() => {
    if (room.phase !== 'question' || revealed || timeLeft > 5 || timeLeft <= 0) return;
    if (tickRef.current === timeLeft) return;
    tickRef.current = timeLeft;
    play('tick');
  }, [timeLeft, room.phase, revealed, play]);

  const finishedRef = useRef(false);
  useEffect(() => {
    if (room.phase !== 'finished') {
      finishedRef.current = false;
      return;
    }
    if (finishedRef.current || !myRow) return;
    finishedRef.current = true;
    play(myRow.rank === 1 ? 'win' : 'lose');
  }, [room.phase, myRow, play]);

  if (!ffa) return null;

  // ---- Category pick ------------------------------------------------------
  if (room.phase === 'category_pick') {
    return (
      <div className="w-full max-w-2xl">
        <FfaCategoryPick room={room} playerId={playerId} onPick={onPick} />
        {qNum > 0 && <Leaderboard rows={rows} playerId={playerId} title={t.ffaTop} pts={t.ffaPts} />}
      </div>
    );
  }

  // ---- Finished -----------------------------------------------------------
  if (room.phase === 'finished') {
    const standings = (ffa.standings ?? rows).map((row) => ({
      ...row,
      ghost: Boolean(room.players[row.playerId]?.isGhost),
    }));
    const isGhostMatch = Boolean(room.ghostMatch);
    const findNew = () => {
      sessionStorage.removeItem(`quizzy_player_${room.code}`);
      router.push('/?find=1');
    };
    const podium = standings.slice(0, 3);
    const backHome = () => {
      sessionStorage.removeItem(`quizzy_player_${room.code}`);
      router.push('/');
    };
    return (
      <div id="ffa-finished" className="w-full max-w-md bg-quizzy-card rounded-3xl shadow-card border border-quizzy-border p-6 text-center animate-slide-up">
        {myRow?.rank === 1 && <Confetti team="blue" />}
        <Trophy size={36} className="mx-auto text-amber-500 mb-2" />
        <h2 className="text-2xl font-extrabold text-quizzy-text mb-4">{t.ffaFinalStandings}</h2>

        <div className="flex items-end justify-center gap-3 mb-6" aria-hidden>
          {[1, 0, 2].map((i) => {
            const row = podium[i];
            if (!row) return <div key={i} className="w-20" />;
            const height = i === 0 ? 'h-24' : i === 1 ? 'h-16' : 'h-12';
            return (
              <div key={i} className="w-20 flex flex-col items-center">
                <span className="text-2xl">{avatarGlyph(row.avatar)}</span>
                <span className="text-xs font-semibold text-quizzy-text truncate w-full">{row.name}</span>
                <div className={`${height} w-full mt-1 rounded-t-lg bg-blue-pale border border-blue-light flex items-start justify-center pt-1`}>
                  <span className="text-lg font-extrabold text-blue-soft">{row.rank}</span>
                </div>
              </div>
            );
          })}
        </div>

        <ol id="ffa-standings" className="text-left mb-6 space-y-1">
          {standings.map((row) => (
            <li
              key={row.playerId}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                row.playerId === playerId ? 'bg-blue-pale font-semibold' : ''
              }`}
            >
              <span className="w-6 text-quizzy-muted">{row.rank}.</span>
              <span aria-hidden>{avatarGlyph(row.avatar)}</span>
              <span className="flex-1 truncate text-quizzy-text">
                {row.name}
                {row.ghost && <GhostMark />}
              </span>
              <span className="tabular-nums text-quizzy-text">{row.score}</span>
            </li>
          ))}
        </ol>

        {/* Against a ghost a rematch would replay the same recording — the
            player would know every answer — so a new opponent is offered. */}
        {!isSpectator && isGhostMatch && (
          <button
            id="find-new-opponent"
            onClick={findNew}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-soft text-white font-semibold hover:bg-blue-500 active:scale-95 transition-all mb-2.5"
          >
            <Search size={17} />
            {t.findNewOpponent}
          </button>
        )}
        {!isSpectator && !isGhostMatch && (
          <button
            id="rematch-button"
            onClick={onRematch}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-soft text-white font-semibold hover:bg-blue-500 active:scale-95 transition-all mb-2.5"
          >
            <RotateCcw size={17} />
            {t.playAgain}
          </button>
        )}
        <button
          onClick={backHome}
          className="w-full py-3 rounded-xl bg-quizzy-text text-quizzy-card font-semibold hover:opacity-80 active:scale-95 transition-all"
        >
          {t.backToHome}
        </button>
      </div>
    );
  }

  if (room.phase !== 'question' || !aq) return null;

  // ---- Question / reveal --------------------------------------------------
  const question = aq.question;
  const text = (language === 'tr' && question.text_tr) || question.text || '';
  const options = (language === 'tr' && question.options_tr) || question.options;
  const answeredCount = Object.keys(aq.votes ?? {}).filter((id) => ffa.players[id]).length;
  const playingCount = Object.keys(ffa.players).length;
  const correct = revealed ? aq.revealedAnswer ?? ffa.lastRound?.correctAnswer ?? null : null;
  const canAnswer = iAmPlaying && !answered && !revealed && timeLeft > 0;

  const answer = (key: OptionKey) => {
    if (!canAnswer) return;
    setMine({ q: qNum, option: key });
    onAnswer(key);
  };

  return (
    <div className="w-full max-w-2xl" id="ffa-round" data-question={qNum}>
      {room.ghostMatch && (
        <div
          id="ghost-banner"
          title={t.ghostHint}
          className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-sm text-violet-900"
        >
          <Ghost size={16} className="shrink-0" />
          <span className="truncate">
            {t.ghostVs
              .replace('{name}', room.ghostMatch.name)
              .replace('{when}', ghostWhen(room.ghostMatch.playedAt, t))}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between mb-3 text-xs font-semibold text-quizzy-muted uppercase tracking-widest">
        <span>{t.ffaQuestionOf.replace('{n}', String(qNum)).replace('{total}', String(total))}</span>
        <span id="ffa-answered">
          {t.ffaAnswered.replace('{n}', String(answeredCount)).replace('{total}', String(playingCount))}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="flex-1 w-full">
          <div className="bg-quizzy-card rounded-2xl shadow-card border border-quizzy-border p-5 mb-4">
            <p className="text-lg font-bold text-quizzy-text leading-snug">{text}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {OPTION_KEYS.map((key) => {
              const label = options?.[key];
              if (!label) return null;
              const isMine = myOption === key;
              const isRight = correct === key;
              const dimmed = revealed ? !isRight : (answered && !isMine);
              return (
                <button
                  key={key}
                  data-option={key}
                  onClick={() => answer(key)}
                  disabled={!canAnswer}
                  className={`relative flex items-center gap-3 text-left px-4 py-3.5 rounded-xl border-2 text-white font-semibold transition-all ${
                    OPTION_COLORS[key]
                  } ${dimmed ? 'opacity-35' : ''} ${
                    canAnswer ? 'hover:brightness-110 hover:shadow-md active:scale-[0.98] cursor-pointer' : 'cursor-default'
                  } ${isMine ? 'ring-4 ring-offset-2 ring-quizzy-text' : ''} ${
                    key === 'E' ? 'sm:col-span-2' : ''
                  }`}
                >
                  <span className="shrink-0 w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-sm font-bold">
                    {key}
                  </span>
                  <span className="flex-1 text-sm leading-snug">{label}</span>
                  {revealed && isRight && <CheckCircle size={18} className="shrink-0" />}
                  {revealed && isMine && !isRight && <XCircle size={18} className="shrink-0" />}
                </button>
              );
            })}
          </div>

          {!revealed && answered && (
            <p id="ffa-locked" className="mt-4 text-center text-sm text-quizzy-muted animate-pulse-soft">
              {t.ffaLocked}
            </p>
          )}
          {isSpectator && !revealed && (
            <p className="mt-4 text-center text-xs text-quizzy-muted">{t.ffaWatching}</p>
          )}
        </div>

        {!revealed && (
          // First on phones: below five stacked options the clock is off-screen.
          <div className="order-first sm:order-none sm:mt-2 flex sm:flex-col items-center gap-3 self-center sm:self-start">
            <VotingTimer timeLeft={timeLeft} total={aq.duration ?? room.questionSeconds ?? 20} />
          </div>
        )}
      </div>

      {revealed && (
        <div className="mt-5 animate-fade-in">
          {myResult && (
            <div
              id="ffa-my-result"
              data-correct={myResult.isCorrect}
              className={`rounded-2xl border p-4 mb-4 text-center ${
                myResult.isCorrect ? 'bg-green-50 border-green-300' : 'bg-red-pale border-red-light'
              }`}
            >
              <p className={`text-lg font-extrabold ${myResult.isCorrect ? 'text-green-700' : 'text-red-soft'}`}>
                {myResult.isCorrect ? t.ffaCorrect : myResult.optionKey === null ? t.ffaNoAnswer : t.ffaWrong}
                {myResult.points > 0 && ` +${myResult.points}`}
              </p>
              {myResult.streak >= 2 && (
                <p className="mt-1 flex items-center justify-center gap-1 text-sm font-semibold text-amber-700">
                  <Flame size={15} />
                  {t.ffaStreak.replace('{n}', String(myResult.streak))}
                </p>
              )}
              {myRow && (
                <p className="mt-1 text-xs text-quizzy-muted">{t.ffaYourRank.replace('{n}', String(myRow.rank))}</p>
              )}
            </div>
          )}
          <Leaderboard rows={rows} playerId={playerId} title={t.ffaTop} pts={t.ffaPts} />
        </div>
      )}
    </div>
  );
}

function Leaderboard({ rows, playerId, title, pts }: { rows: Row[]; playerId: string; title: string; pts: string }) {
  const top = rows.slice(0, 5);
  return (
    <div id="ffa-leaderboard" className="bg-quizzy-card rounded-2xl shadow-card border border-quizzy-border p-4 mt-4">
      <p className="text-xs font-semibold text-quizzy-muted uppercase tracking-widest mb-2">{title}</p>
      <ol className="space-y-1">
        {top.map((row) => (
          <li
            key={row.playerId}
            className={`flex items-center gap-2 px-2 py-1 rounded-lg text-sm ${
              row.playerId === playerId ? 'bg-blue-pale font-semibold' : ''
            }`}
          >
            <span className="w-6 text-quizzy-muted">{row.rank}.</span>
            <span aria-hidden>{avatarGlyph(row.avatar)}</span>
            <span className="flex-1 truncate text-quizzy-text">
              {row.name}
              {row.ghost && <GhostMark />}
            </span>
            <span className="tabular-nums text-quizzy-text">
              {row.score} <span className="text-xs text-quizzy-muted">{pts}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Marks a recorded opponent wherever names are listed (PBI 35). */
function GhostMark() {
  return <Ghost size={13} aria-label="ghost" className="inline ml-1 -mt-0.5 text-violet-600" />;
}
