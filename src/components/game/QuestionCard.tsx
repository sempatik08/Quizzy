'use client';

import { useState, useEffect } from 'react';
import type { AnswerRevealPayload, Room } from '@/types';
import { CheckCheck } from 'lucide-react';
import { OptionButton } from './OptionButton';
import { useLanguage } from '@/context/LanguageContext';

interface QuestionCardProps {
  room: Room;
  playerId: string;
  isMyTurn: boolean;
  answerReveal: AnswerRevealPayload | null;
  onVote: (optionKey: string) => void;
  onFinalize: () => void;
}

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E'] as const;

export function QuestionCard({
  room,
  playerId,
  isMyTurn,
  answerReveal,
  onVote,
  onFinalize,
}: QuestionCardProps) {
  const { t, language } = useLanguage();
  const aq = room.activeQuestion;
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset submitting state whenever the question changes or reveal arrives
  useEffect(() => {
    setIsSubmitting(false);
  }, [aq?.question.id, answerReveal]);

  if (!aq) return null;
  // Wager mode blanks the question server-side until the stake is in, and the
  // page shows WagerPanel instead. Bailing out here keeps every reader below
  // free of null checks (PBI 9).
  if (aq.wagerPending || !aq.question.text || !aq.question.options) return null;

  const myVote  = aq.votes[playerId]?.optionKey ?? null;
  const myTeam  = room.players[playerId]?.team;

  const teamPlayers   = myTeam ? room.teams[myTeam]?.players ?? [] : [];
  const teamVoteCount = teamPlayers.filter((id) => aq.votes[id]).length;
  const canFinalize   = isMyTurn && !answerReveal && !isSubmitting && teamVoteCount > 0;

  const handleFinalize = () => {
    setIsSubmitting(true);
    onFinalize();
  };

  const turnColor = myTeam === 'red' ? 'text-red-soft' : 'text-blue-soft';

  // What the reveal line says depends on whether this was a normal answer,
  // a miss that hands the question over, or the resolution of a steal.
  let revealMessage = '';
  let revealTone = 'text-red-soft';
  if (answerReveal) {
    if (answerReveal.isCorrect) {
      revealMessage = answerReveal.isSteal ? t.correct10 : t.correct5;
      revealTone = 'text-green-600';
    } else if (answerReveal.stealOpens) {
      revealMessage = t.wrongAnswerSteal;
      revealTone = 'text-amber-500';
    } else if (answerReveal.isSteal) {
      // A steal with no submitted answer was a pass — no charge was spent
      revealMessage = answerReveal.selectedOption === null ? t.stealDeclined : t.stealFailed;
      revealTone = answerReveal.selectedOption === null ? 'text-quizzy-muted' : 'text-red-soft';
    } else {
      revealMessage = t.wrongAnswer;
    }
  }

  // Use Turkish question text when language is 'tr' and translation exists
  // Bound to locals after the wagerPending guard above: TypeScript cannot carry
  // the narrowing of aq.question.* into the .map() closure below.
  const options = aq.question.options;
  const optionsTr = aq.question.options_tr ?? null;

  const questionText = language === 'tr' && aq.question.text_tr
    ? aq.question.text_tr
    : aq.question.text;

  return (
    <div className="bg-quizzy-card rounded-2xl shadow-card border border-quizzy-border p-6 animate-fade-in">
      {/* Question text */}
      <p className="text-base font-semibold text-quizzy-text leading-relaxed mb-6">
        {questionText}
      </p>

      {/* Options */}
      <div className="flex flex-col gap-3">
        {OPTION_KEYS.map((key) => {
          const textEn = options[key];
          if (!textEn) return null;

          // Use Turkish option text when available
          const text = language === 'tr' && optionsTr?.[key] ? optionsTr[key] : textEn;

          const isDisabled = aq.disabledOptions.includes(key);

          // Only show teammate votes (same team as me)
          const voters = Object.entries(aq.votes)
            .filter(([, v]) => v.optionKey === key)
            .map(([pid]) => room.players[pid])
            .filter((p): p is NonNullable<typeof p> => !!p && p.team === myTeam);

          const isCorrectReveal  = answerReveal?.correctAnswer === key;
          const isWrongReveal    =
            answerReveal !== null &&
            answerReveal.selectedOption === key &&
            !answerReveal.isCorrect;

          return (
            <OptionButton
              key={key}
              optionKey={key}
              text={text}
              voters={voters}
              disabled={isDisabled}
              isMyVote={myVote === key}
              isCorrect={answerReveal ? (isCorrectReveal ? true : null) : null}
              isWrongReveal={isWrongReveal}
              isMyTurn={isMyTurn && !answerReveal}
              onVote={() => onVote(key)}
            />
          );
        })}
      </div>

      {/* Finalize button */}
      {canFinalize && (
        <button
          onClick={handleFinalize}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm bg-quizzy-text text-quizzy-card hover:opacity-80 active:scale-95 transition-all"
        >
          <CheckCheck size={16} />
          {t.submitFinal} ({teamVoteCount}/{teamPlayers.length} {t.voted})
        </button>
      )}

      {/* Submitting state */}
      {isSubmitting && !answerReveal && (
        <div className="mt-4 w-full py-2.5 rounded-xl text-center text-sm font-medium text-quizzy-muted bg-gray-50 border border-quizzy-border">
          {t.submitting}
        </div>
      )}

      {/* Turn indicator */}
      <div className="mt-3 text-center text-xs text-quizzy-subtle">
        {isMyTurn && !answerReveal && !isSubmitting && (
          <span className={`font-semibold animate-pulse-soft ${turnColor}`}>
            {t.yourTeamVoting}
          </span>
        )}
        {!isMyTurn && !answerReveal && (() => {
          // One phrase with a {team} placeholder, split so the team name keeps
          // its colour. Concatenating fragments produced "Waiting for Blue Team
          // team to vote…" in EN and the same duplication in TR.
          const label = room.activeTeam === 'blue' ? t.blueTeam : t.redTeam;
          const [before, after] = t.waitingForTeamToVote.split('{team}');
          return (
            <span>
              {before}
              <span className={room.activeTeam === 'blue' ? 'text-blue-soft font-semibold' : 'text-red-soft font-semibold'}>
                {label}
              </span>
              {after}
            </span>
          );
        })()}
        {answerReveal && (
          <span className={`font-semibold ${revealTone}`}>{revealMessage}</span>
        )}
      </div>
    </div>
  );
}
