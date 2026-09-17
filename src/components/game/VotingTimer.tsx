'use client';

import { useLanguage } from '@/context/LanguageContext';

interface VotingTimerProps {
  timeLeft: number;
  total?: number;
}

export function VotingTimer({ timeLeft, total = 60 }: VotingTimerProps) {
  const { t } = useLanguage();
  const pct = (timeLeft / total) * 100;

  // Color transitions — proportional so the short 20s steal window scales too
  const color =
    timeLeft <= total * 0.1
      ? '#FF6B6B'
      : timeLeft <= total * 0.25
      ? '#F59E0B'
      : '#4D96FF';

  const size = 72;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.3s ease' }}
          />
        </svg>

        {/* Number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-xl font-extrabold tabular-nums"
            style={{ color }}
          >
            {timeLeft}
          </span>
        </div>
      </div>

      <span className="text-[10px] text-quizzy-muted uppercase tracking-wide font-medium">
        {t.seconds}
      </span>
    </div>
  );
}
