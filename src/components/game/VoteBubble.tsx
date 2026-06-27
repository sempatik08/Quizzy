import type { Player } from '@/types';

interface VoteBubbleProps {
  player: Player;
  size?: 'sm' | 'md';
}

export function VoteBubble({ player, size = 'sm' }: VoteBubbleProps) {
  const initials = player.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const bg = player.team === 'blue' ? '#4D96FF' : '#FF6B6B';
  const dim = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs';

  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-bold text-white shrink-0 shadow-sm border-2 border-white`}
      style={{ backgroundColor: bg }}
      title={player.name}
    >
      {initials}
    </div>
  );
}
