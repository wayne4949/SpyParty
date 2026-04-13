import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Copy, Play, Users, HelpCircle, Check } from 'lucide-react';
import PlayerList from './PlayerList';
import BannerAd from '@/components/ads/BannerAd';
import RulesModal from './RulesModal';
import { useLang } from '@/lib/LangContext';

export default function LobbyPhase({ room, players, isHost, myPlayer, onStartGame, startingGame }) {
  const canStart = players.length >= 4;
  const [copied, setCopied] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const { t } = useLang();

  const copyCode = () => {
    navigator.clipboard.writeText(room.room_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative min-h-screen flex flex-col px-6 pt-12 pb-24">
      {/* Rules button */}
      <div className="absolute top-4 right-16 flex items-center">
        <button
          onClick={() => setShowRules(true)}
          className="p-2 rounded-xl bg-secondary/60 hover:bg-secondary transition-colors text-muted-foreground"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 max-w-sm mx-auto w-full space-y-6"
      >
        {/* Room Code */}
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground uppercase tracking-widest">{t.roomCode}</p>
          <button
            onClick={copyCode}
            className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-primary/10 border border-primary/20 active:scale-95 transition-transform"
          >
            <span className="text-4xl font-black tracking-[0.3em] text-primary">
              {room.room_code}
            </span>
            {copied
              ? <Check className="w-5 h-5 text-primary" />
              : <Copy className="w-5 h-5 text-primary/60" />
            }
          </button>
          <p className="text-xs text-muted-foreground">
            {copied ? `✅ ${t.copied}` : t.copyCode}
          </p>
        </div>

        {/* Player Count */}
        <div className="flex items-center gap-2 justify-center text-muted-foreground">
          <Users className="w-4 h-4" />
          <span className="text-sm font-medium">{players.length} {t.playersJoined}</span>
        </div>

        {/* Players */}
        <PlayerList players={players} hostId={room.host_id} myUserId={myPlayer?.user_id} />

        {/* Start button for host */}
        {isHost && (
          <div className="pt-4 space-y-2">
            <Button
              onClick={onStartGame}
              disabled={!canStart || startingGame}
              className="w-full h-14 text-base font-bold rounded-xl"
            >
              {startingGame ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin mr-2" />
              ) : (
                <Play className="w-5 h-5 mr-2" />
              )}
              {startingGame ? t.creating : t.startGame}
            </Button>
            {!canStart && (
              <p className="text-center text-xs text-muted-foreground">
                {t.needMorePlayers} {players.length}/4）
              </p>
            )}
          </div>
        )}

        {!isHost && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground animate-pulse">{t.waitingForHost}</p>
          </div>
        )}
      </motion.div>

      <BannerAd />
      <RulesModal show={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
}