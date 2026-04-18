// src/components/game/GameOverPhase.jsx
// 透過 get_game_reveal RPC 取得所有人的 role 和詞（只在 game_over 才授權）
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Trophy, RotateCcw, EyeOff, Shield } from 'lucide-react';
import PlayerAvatar from './PlayerAvatar';
import { useLang } from '@/lib/LangContext';
import { getGameReveal } from '@/api/gameApi';

export default function GameOverPhase({ room, players, isHost, onPlayAgain }) {
  const { t, lang } = useLang();
  const spiesWon = room.winner === 'spies';
  const [reveal, setReveal] = useState([]);
  const [loadingReveal, setLoadingReveal] = useState(true);

  useEffect(() => {
    let mounted = true;
    getGameReveal(room.id)
      .then(r => { if (mounted) { setReveal(r); setLoadingReveal(false); } })
      .catch(() => { if (mounted) setLoadingReveal(false); });
    return () => { mounted = false; };
  }, [room.id]);

  const spyReveal = reveal.find(r => r.role === 'spy');
  const civReveal = reveal.find(r => r.role === 'civilian');

  const wordText = (w) => {
    if (!w) return '?';
    return w[lang] || w.zh || w.en || '?';
  };

  // 先以 players（realtime 保持最新 is_alive）為主，從 reveal 補 role/word
  const roleByPlayerId = Object.fromEntries(reveal.map(r => [r.player_id, r.role]));

  return (
    <div className="min-h-screen flex flex-col px-6 pt-12 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex-1 max-w-sm mx-auto w-full space-y-6">
        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="text-center space-y-4 py-6">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${
            spiesWon ? 'bg-destructive/20' : 'bg-primary/20'
          }`}>
            <Trophy className={`w-10 h-10 ${spiesWon ? 'text-destructive' : 'text-primary'}`} />
          </div>
          <h2 className="text-2xl font-black">
            {spiesWon ? t.spiesWin : t.civiliansWin}
          </h2>
        </motion.div>

        {loadingReveal ? (
          <p className="text-center text-sm text-muted-foreground">{t.loading || '載入中…'}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
                <Shield className="w-5 h-5 mx-auto mb-1 text-primary" />
                <p className="text-xs text-muted-foreground mb-1">{t.civilianWord}</p>
                <p className="font-bold text-primary">{wordText(civReveal?.assigned_word)}</p>
              </div>
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-center">
                <EyeOff className="w-5 h-5 mx-auto mb-1 text-destructive" />
                <p className="text-xs text-muted-foreground mb-1">{t.spyWord}</p>
                <p className="font-bold text-destructive">{wordText(spyReveal?.assigned_word)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{t.roleReveal}</p>
              {players.map((player, i) => {
                const role = roleByPlayerId[player.id];
                return (
                  <div key={player.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
                      role === 'spy' ? 'bg-destructive/10 border border-destructive/20' : 'bg-secondary/50'
                    }`}>
                    <PlayerAvatar name={player.username} index={i} isAlive={player.is_alive} />
                    <span className="font-medium flex-1 truncate">{player.username}</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                      role === 'spy' ? 'bg-destructive/20 text-destructive' : 'bg-primary/20 text-primary'
                    }`}>
                      {role === 'spy' ? t.spy : t.civilian}
                    </span>
                    {!player.is_alive && (
                      <span className="text-xs text-muted-foreground">{t.eliminatedBadge}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

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
