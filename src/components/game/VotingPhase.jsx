import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import PlayerAvatar from './PlayerAvatar';
import { cn } from '@/lib/utils';
import { useLang } from '@/lib/LangContext';

const TIMER_SECONDS = 10;

export default function VotingPhase({ room, players, myPlayer, allVotes, onVoteComplete, isHost }) {
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const voteCompleteCalledRef = useRef(false);
  const { t } = useLang();

  const currentRound = room.current_round || 1;
  const alivePlayers = players.filter(p => p.is_alive);
  const roundVotes = allVotes.filter(v => v.round_number === currentRound);
  const votedCount = roundVotes.length;
  const myVote = roundVotes.find(v => v.voter_id === myPlayer?.id);

  // 重新連線後恢復投票狀態
  useEffect(() => {
    if (myVote) {
      setHasVoted(true);
      setSelectedTarget(myVote.target_id);
    }
  }, [myVote?.id]);

  // 回合切換時重置
  useEffect(() => {
    voteCompleteCalledRef.current = false;
    setTimeLeft(TIMER_SECONDS);
    setHasVoted(false);
    setSelectedTarget(null);
  }, [currentRound]);

  // ─── 倒數計時 ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!voteCompleteCalledRef.current && isHost) {
            voteCompleteCalledRef.current = true;
            const latestVotes = allVotes.filter(v => v.round_number === currentRound);
            onVoteComplete(latestVotes);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentRound]);

  // ─── 全員投完提早結算 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (alivePlayers.length === 0) return;
    const allVoted = alivePlayers.every(p => roundVotes.some(v => v.voter_id === p.id));
    if (allVoted && !voteCompleteCalledRef.current && isHost) {
      voteCompleteCalledRef.current = true;
      onVoteComplete(roundVotes);
    }
  }, [votedCount, alivePlayers.length]);

  // ─── 投票送出 ───────────────────────────────────────────────────────────────
  const submitVote = async () => {
    if (!selectedTarget || hasVoted || !myPlayer?.is_alive || processing) return;
    setProcessing(true);
    setHasVoted(true);

    // 防重複（UNIQUE 約束已在 DB 層保護，這裡是前端防護）
    const { data: existing } = await supabase
      .from('votes')
      .select('id')
      .eq('room_id', room.id)
      .eq('round_number', currentRound)
      .eq('voter_id', myPlayer.id)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from('votes').insert({
        room_id: room.id,
        round_number: currentRound,
        voter_id: myPlayer.id,
        target_id: selectedTarget,
      });
    }

    setProcessing(false);
  };

  const progressPercent = (timeLeft / TIMER_SECONDS) * 100;

  return (
    <div className="relative min-h-screen flex flex-col px-6 pt-12 pb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 max-w-sm mx-auto w-full space-y-6"
      >
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold mb-2">{t.votingPhase}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {votedCount}/{alivePlayers.length} {t.playersVoted}
          </p>
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-1000 ease-linear"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {!myPlayer?.is_alive ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t.youreEliminated}</p>
          </div>
        ) : hasVoted ? (
          <div className="text-center py-8 space-y-2">
            <Check className="w-12 h-12 mx-auto text-primary" />
            <p className="text-muted-foreground">{t.voted}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{t.chooseSpy}</p>
            <AnimatePresence>
              {alivePlayers.filter(p => p.id !== myPlayer?.id).map((player, i) => (
                <motion.button
                  key={player.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  disabled={processing}
                  onClick={() => !hasVoted && setSelectedTarget(player.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-4 rounded-xl transition-all border-2',
                    selectedTarget === player.id
                      ? 'bg-amber-500/20 border-amber-500'
                      : 'bg-secondary/50 border-transparent active:scale-[0.98]',
                    processing && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <PlayerAvatar name={player.username} index={i} />
                  <span className="font-medium flex-1 text-left">{player.username}</span>
                  {selectedTarget === player.id && (
                    <Check className="w-5 h-5 text-amber-500" />
                  )}
                </motion.button>
              ))}
            </AnimatePresence>

            <Button
              onClick={submitVote}
              disabled={!selectedTarget || processing}
              className="w-full h-14 text-base font-bold rounded-xl mt-4"
            >
              {processing ? t.voting : t.confirmVote}
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
