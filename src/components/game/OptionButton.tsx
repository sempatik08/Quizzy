'use client';

import { XCircle, CheckCircle } from 'lucide-react';
import type { Player } from '@/types';
import { VoteBubble } from './VoteBubble';

interface OptionButtonProps {
  optionKey: string;
  text: string;
  voters: Player[];
  disabled: boolean;      // option eliminated by a wrong answer
  isMyVote: boolean;
  isCorrect: boolean | null;   // null = not revealed yet, true = correct reveal
  isWrongReveal: boolean;      // this option was selected and was wrong
  isMyTurn: boolean;
  onVote: () => void;
}

export function OptionButton({
  optionKey,
  text,
  voters,
  disabled,
  isMyVote,
  isCorrect,
  isWrongReveal,
  isMyTurn,
  onVote,
}: OptionButtonProps) {
  let containerClass =
    'relative w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all duration-200 flex items-center gap-3';

  if (disabled) {
    containerClass += ' bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed opacity-60';
  } else if (isCorrect === true) {
    containerClass += ' bg-green-50 border-green-400 text-green-800 cursor-default';
  } else if (isWrongReveal) {
    containerClass += ' bg-red-pale border-red-soft text-red-soft cursor-default';
  } else if (isMyVote) {
    // Show my vote highlight regardless of turn, but only clickable on my turn
    containerClass += ' bg-blue-pale border-blue-soft text-quizzy-text shadow-sm';
    containerClass += isMyTurn ? ' cursor-pointer' : ' cursor-default';
  } else if (isMyTurn) {
    containerClass +=
      ' bg-quizzy-card border-quizzy-border text-quizzy-text hover:border-blue-soft hover:bg-blue-pale/30 hover:shadow-md cursor-pointer';
  } else {
    containerClass += ' bg-quizzy-card border-quizzy-border text-quizzy-text cursor-default';
  }

  const clickable = !disabled && isMyTurn && isCorrect === null;

  return (
    <button
      onClick={clickable ? onVote : undefined}
      disabled={!clickable}
      className={containerClass}
    >
      {/* Option label badge */}
      <span
        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold border ${
          disabled
            ? 'bg-gray-100 border-gray-200 text-gray-400'
            : isCorrect === true
            ? 'bg-green-400 border-green-400 text-white'
            : isWrongReveal
            ? 'bg-red-soft border-red-soft text-white'
            : isMyVote
            ? 'bg-blue-soft border-blue-soft text-white'
            : 'bg-quizzy-bg border-quizzy-border text-quizzy-muted'
        }`}
      >
        {optionKey}
      </span>

      {/* Option text */}
      <span className="flex-1 text-sm font-medium leading-snug">{text}</span>

      {/* Teammate vote bubbles */}
      {voters.length > 0 && !disabled && (
        <div className="flex items-center -space-x-1.5 ml-2">
          {voters.slice(0, 4).map((v) => (
            <VoteBubble key={v.id} player={v} />
          ))}
          {voters.length > 4 && (
            <span className="text-[10px] font-bold text-quizzy-muted ml-1">+{voters.length - 4}</span>
          )}
        </div>
      )}

      {/* Right state icon */}
      {disabled        && <XCircle     size={18} className="text-gray-400   shrink-0 ml-2" />}
      {isCorrect === true && <CheckCircle size={18} className="text-green-500  shrink-0 ml-2" />}
      {isWrongReveal   && <XCircle     size={18} className="text-red-soft   shrink-0 ml-2" />}
    </button>
  );
}
