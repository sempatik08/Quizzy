import { Crown, Wifi, WifiOff } from 'lucide-react';
import type { Player, TeamColor } from '@/types';

interface PlayerTagProps {
  player: Player;
  isCaptain?: boolean;
  team?: TeamColor;
  isMe?: boolean;
}

export function PlayerTag({ player, isCaptain = false, team, isMe = false }: PlayerTagProps) {
  const teamColor = team === 'blue' ? 'bg-blue-pale text-blue-soft border-blue-light'
    : team === 'red' ? 'bg-red-pale text-red-soft border-red-light'
    : 'bg-gray-100 text-gray-500 border-gray-200';

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${teamColor} ${isMe ? 'ring-2 ring-offset-1 ring-current' : ''}`}
    >
      {/* Connection indicator */}
      <span className={player.isConnected ? 'text-green-500' : 'text-gray-400'}>
        {player.isConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
      </span>

      <span className="truncate max-w-[120px]">{player.name}</span>

      {isMe && (
        <span className="ml-auto text-[10px] font-semibold opacity-60 uppercase tracking-wide">
          You
        </span>
      )}

      {isCaptain && (
        <Crown size={14} className="ml-auto shrink-0 text-yellow-500" aria-label="Captain" />
      )}
    </div>
  );
}
