// src/components/game/VotingPhase.jsx
// 修復 C3（投票只走 RPC）、M4（server-authoritative timer）
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import PlayerAvatar from './PlayerAvatar';
import { cn } from '@/lib/utils';
import { useLang } from '@/lib/LangContext';
import { submitVote, GameError } from '@/api/gameApi';

const FALLBACK_SECONDS = 60;

export default function VotingPhase({ room, players, myPlayer, allVotes, onVoteComplete, isHost }) {
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(FALLBACK_SECONDS);
  const voteCompleteCalledRef = useRef(false);
  const { t } = useLang();

  const currentRound = room.current_round || 1;
  const alivePlayers = players.filter(p => p.is_alive);
  const roundVotes = allVotes.filter(v => v.round_number === currentRound);
  const votedCount = roundVotes.length;
  const myVote = roundVotes.find(v => v.voter_id === myPlayer?.id);
  const hasVoted = !!myVote;

  // ─── Server timer: 根據 room.voting_ends_at 倒數 ─────────────────────
  useEffect(() => {
    voteCompleteCalledRef.current = false;
    setError('');
    setSelectedTarget(myVote?.target_id ?? null);

    const endsAt = room.voting_ends_at ? new Date(room.voting_ends_at).getTime() : null;

    const tick = () => {
      if (!endsAt) { setTimeLeft(FALLBACK_SECONDS); return; }
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0 && !voteCompleteCalledRef.current && isHost) {
        voteCompleteCalledRef.current = true;
        onVoteComplete();
      }
    };

    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [room.voting_ends_at, currentRound, isHost, onVoteComplete, myVote?.target_id]);

  // ─── 全員投完就結算 ──────────────────────────────────────────────────
  useEffect(() => {
    if (alivePlayers.length === 0 || !isHost) return;
    const allVoted = alivePlayers.every(p => roundVotes.some(v => v.voter_id === p.id));
    if (allVoted && !voteCompleteCalledRef.current) {
      voteCompleteCalledRef.current = true;
      onVoteComplete();
    }
  }, [votedCount, alivePlayers.length, isHost, onVoteComplete, roundVotes]);

  const handleSubmit = async () => {
    if (!selectedTarget || hasVoted || !myPlayer?.is_alive || processing) return;
    setProcessing(true);
    setError('');
    try {
      await submitVote(room.id, selectedTarget);
    } catch (e) {
      if (e instanceof GameError && e.code === 'duplicate') {
        // DB UNIQUE 擋下來的重複投票；靜默處理，realtime 會同步
      } else {
        setError(t.voteFailed || '投票失敗，請重試');
      }
    } finally {
      setProcessing(false);
    }
  };

  const progressPercent = (timeLeft / FALLBACK_SECONDS) * 100;

  return (
    <div className="relative min-h-screen flex flex-col px-6 pt-12 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex-1 max-w-sm mx-auto w-full space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold mb-2">{t.votingPhase}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {votedCount}/{alivePlayers.length} {t.playersVoted}
          </p>
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 transition-all duration-1000 ease-linear"
              style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{timeLeft} {t.secondsSuffix || '秒'}</p>
        </div>

        {error && <p className="text-sm text-destructive text-center" role="alert">{error}</p>}

        {!myPlayer?.is_alive ? (
          <div className="text-center py-8 text-muted-foreground"><p>{t.youreEliminated}</p></div>
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
                <motion.button key={player.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  disabled={processing}
                  onClick={() => setSelectedTarget(player.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-4 rounded-xl transition-all border-2',
                    selectedTarget === player.id
                      ? 'bg-amber-500/20 border-amber-500'
                      : 'bg-secondary/50 border-transparent active:scale-[0.98]',
                    processing && 'opacity-50 cursor-not-allowed',
                  )}>
                  <PlayerAvatar name={player.username} index={i} />
                  <span className="font-medium flex-1 text-left">{player.username}</span>
                  {selectedTarget === player.id && <Check className="w-5 h-5 text-amber-500" />}
                </motion.button>
              ))}
            </AnimatePresence>

            <Button onClick={handleSubmit} disabled={!selectedTarget || processing}
              className="w-full h-14 text-base font-bold rounded-xl mt-4">
              {processing ? t.voting : t.confirmVote}
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
