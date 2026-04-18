// src/components/game/SpeakingPhase.jsx
// 修復 M3（雙語支援）：assigned_word 是 {zh, en}，render 用自己的 lang
import React from 'react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { MessageCircle, Vote } from 'lucide-react';
import PlayerList from './PlayerList';
import { useLang } from '@/lib/LangContext';

export default function SpeakingPhase({
  room, players, myPlayer, mySecret, lang,
  isHost, onGoToVoting,
}) {
  const { t } = useLang();

  const getDisplayWord = () => {
    if (!myPlayer?.is_alive) return t.eliminated;
    if (!mySecret?.assigned_word) return '...';
    // assigned_word 是 {zh, en}；若該語言缺失則 fallback
    return mySecret.assigned_word[lang]
        || mySecret.assigned_word.zh
        || mySecret.assigned_word.en
        || '...';
  };

  return (
    <div className="relative min-h-screen flex flex-col px-6 pt-12 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex-1 max-w-sm mx-auto w-full space-y-6">
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground uppercase tracking-widest">
            {t.round} {room.current_round || 1}{t.roundSuffix && ` ${t.roundSuffix}`}
          </p>
          <h2 className="text-xl font-bold">{t.speakingPhase}</h2>
        </div>

        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="p-6 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 text-center space-y-2">
          <p className="text-sm text-primary/80 font-medium">{t.yourWord}</p>
          <p className="text-3xl font-black text-primary">{getDisplayWord()}</p>
        </motion.div>

        <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/50">
          <MessageCircle className="w-5 h-5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">{t.speakingInstruction}</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{t.alivePlayers}</p>
          <PlayerList players={players} hostId={room.host_id} myUserId={myPlayer?.user_id} showStatus={true} />
        </div>

        {isHost && (
          <Button onClick={onGoToVoting} className="w-full h-14 text-base font-bold rounded-xl">
            <Vote className="w-5 h-5 mr-2" />
            {t.startVoting}
          </Button>
        )}

        {!isHost && (
          <p className="text-center text-sm text-muted-foreground animate-pulse pt-4">
            {t.waitingForVote}
          </p>
        )}
      </motion.div>
    </div>
  );
}
