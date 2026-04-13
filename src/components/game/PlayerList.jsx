import React from 'react';
import PlayerAvatar from './PlayerAvatar';
import { Crown, Skull } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PlayerList({ players, hostId, myUserId, showStatus = false }) {
  return (
    <div className="space-y-2">
      {players.map((player, i) => {
        const isMe = myUserId && player.user_id === myUserId;
        return (
          <div
            key={player.id}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
              isMe ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50',
              !player.is_alive && showStatus && 'opacity-40'
            )}
          >
            <PlayerAvatar name={player.username} index={i} isAlive={player.is_alive} />
            <span className="font-medium flex-1 truncate">{player.username}</span>
            {isMe && (
              <span className="text-xs text-primary font-semibold shrink-0">你 / You</span>
            )}
            {hostId && player.user_id === hostId && (
              <Crown className="w-4 h-4 text-primary shrink-0" />
            )}
            {showStatus && !player.is_alive && (
              <Skull className="w-4 h-4 text-destructive shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}