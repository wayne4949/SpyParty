import React from 'react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Trophy, RotateCcw, EyeOff, Shield } from 'lucide-react';
import PlayerAvatar from './PlayerAvatar';
import { useLang } from '@/lib/LangContext';

export default function GameOverPhase({ room, players, isHost, onPlayAgain }) {
  const { t } = useLang();
  const spiesWon = room.winner === 'spies';

  // ✅ 從 players 讀詞，不再從 rooms 讀
  // 找出臥底和平民各自的詞
  const spyPlayer = players.find(p => p.role === 'spy');
  const civilianPlayer = players.find(p => p.role === 'civilian');
  const spyWord = spyPlayer?.assigned_word || '?';
  const civilianWord = civilianPlayer?.assigned_word || '?';

  return (
    <div className="min-h-screen flex flex-col px-6 pt-12 pb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 max-w-sm mx-auto w-full space-y-6"
      >
        {/* 勝負宣告 */}
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="text-center space-y-4 py-6"
        >
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${
            spiesWon ? 'bg-destructive/20' : 'bg-primary/20'
          }`}>
            <Trophy className={`w-10 h-10 ${spiesWon ? 'text-destructive' : 'text-primary'}`} />
          </div>
          <h2 className="text-2xl font-black">
            {spiesWon ? t.spiesWin : t.civiliansWin}
          </h2>
        </motion.div>

        {/* 詞語揭曉 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
            <Shield className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground mb-1">{t.civilianWord}</p>
            <p className="font-bold text-primary">{civilianWord}</p>
          </div>
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-center">
            <EyeOff className="w-5 h-5 mx-auto mb-1 text-destructive" />
            <p className="text-xs text-muted-foreground mb-1">{t.spyWord}</p>
            <p className="font-bold text-destructive">{spyWord}</p>
          </div>
        </div>

        {/* 身份揭曉 */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{t.roleReveal}</p>
          {players.map((player, i) => (
            <div
              key={player.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
                player.role === 'spy' ? 'bg-destructive/10 border border-destructive/20' : 'bg-secondary/50'
              }`}
            >
              <PlayerAvatar name={player.username} index={i} isAlive={player.is_alive} />
              <span className="font-medium flex-1 truncate">{player.username}</span>
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                player.role === 'spy'
                  ? 'bg-destructive/20 text-destructive'
                  : 'bg-primary/20 text-primary'
              }`}>
                {player.role === 'spy' ? t.spy : t.civilian}
              </span>
              {!player.is_alive && (
                <span className="text-xs text-muted-foreground">{t.eliminatedBadge}</span>
              )}
            </div>
          ))}
        </div>

        {/* 再玩一局 */}
        {isHost && (
          <Button onClick={onPlayAgain} className="w-full h-14 text-base font-bold rounded-xl">
            <RotateCcw className="w-5 h-5 mr-2" />
            {t.playAgain}
          </Button>
        )}
      </motion.div>
    </div>
  );
}
