// src/pages/Game.jsx
// 重構後只有 ~120 行（原本 400 行）
// 所有 realtime / heartbeat / presence 都丟進 useGameRoom
// 所有遊戲動作走 RPC，沒有 client-side 勝負判定、沒有 client 端寫 is_alive
import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/LangContext';
import { useAuth } from '@/lib/AuthContext';
import { useGameRoom } from '@/hooks/useGameRoom';
import { startGame, goToVoting, completeVote } from '@/api/gameApi';
import { trackGameEvent, captureWarning } from '@/lib/monitoring';
import LobbyPhase from '@/components/game/LobbyPhase';
import SpeakingPhase from '@/components/game/SpeakingPhase';
import VotingPhase from '@/components/game/VotingPhase';
import GameOverPhase from '@/components/game/GameOverPhase';
import InterstitialAd from '@/components/ads/InterstitialAd';

function getRoomId() {
  const raw = new URLSearchParams(window.location.search).get('roomId');
  // 修復 H10：UUID 格式驗證
  if (!raw || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return null;
  }
  return raw;
}

export default function Game() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const { user, isLoadingAuth } = useAuth();
  const roomId = getRoomId();

  const [showAd, setShowAd] = useState(false);
  const [pendingTransition, setPendingTransition] = useState(null);
  const [startingGame, setStartingGame] = useState(false);

  const onRoomCancelled = useCallback((reason) => {
    if (reason === 'not_found' || reason === 'deleted') navigate('/');
    else if (reason === 'cancelled') { alert(t.hostLeft); navigate('/'); }
  }, [navigate, t.hostLeft]);

  const {
    room, players, votes, mySecret, myPlayer,
    isHost, loading, connectionStatus,
  } = useGameRoom({
    roomId,
    userId: user?.id,
    onRoomCancelled,
  });

  // 無效 roomId 或沒 session → 回首頁
  if (!roomId) { navigate('/'); return null; }
  if (isLoadingAuth || loading || !room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!myPlayer) { navigate('/'); return null; }
  if (room.game_status === 'cancelled') return null;

  // ─── Host 動作 ────────────────────────────────────────────────────────
  const handleStartGame = async () => {
    if (!isHost || startingGame) return;
    setStartingGame(true);
    trackGameEvent('start_game_attempt', { room_id: room.id, player_count: players.length });
    try {
      await startGame(room.id);
      trackGameEvent('start_game_success', { room_id: room.id });
    } catch (e) {
      captureWarning('start_game failed', { room_id: room.id, code: e.code });
      alert(t.startFailed || '開始遊戲失敗，請重試');
    } finally {
      setStartingGame(false);
    }
  };

  const handleGoToVoting = async () => {
    if (!isHost) return;
    trackGameEvent('go_to_voting', { room_id: room.id, round: room.current_round });
    try { await goToVoting(room.id, 60); }
    catch (e) { captureWarning('go_to_voting failed', { code: e.code }); }
  };

  const handleVoteComplete = useCallback(async () => {
    if (!isHost) return;
    try {
      const result = await completeVote(room.id);
      trackGameEvent('vote_complete', { room_id: room.id, outcome: result?.outcome, winner: result?.winner });
      if (!result?.winner) {
        setPendingTransition(result?.outcome || 'speaking');
        setShowAd(true);
      } else {
        trackGameEvent('game_over', { room_id: room.id, winner: result.winner });
      }
    } catch (e) {
      captureWarning('complete_vote failed', { code: e.code });
    }
  }, [isHost, room.id]);

  const handleAdComplete = useCallback(() => {
    setShowAd(false);
    setPendingTransition(null);
  }, []);

  const handlePlayAgain = async () => {
    if (!isHost) return;
    // 再玩一局 = 在同房呼叫一次 start_game（server 會重新 shuffle + 選詞）
    try { await startGame(room.id); }
    catch (e) { console.error('play_again', e); }
  };

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <>
      {connectionStatus === 'reconnecting' && (
        <div className="fixed top-0 inset-x-0 bg-amber-500/20 text-amber-600 text-center text-xs py-1 z-50">
          {t.reconnecting || '重新連線中…'}
        </div>
      )}

      <InterstitialAd show={showAd} onComplete={handleAdComplete} />

      {room.game_status === 'lobby' && (
        <LobbyPhase room={room} players={players} isHost={isHost}
          myPlayer={myPlayer} onStartGame={handleStartGame} startingGame={startingGame} />
      )}

      {(room.game_status === 'speaking' || room.game_status === 'assigning') && (
        <SpeakingPhase room={room} players={players} myPlayer={myPlayer}
          mySecret={mySecret} lang={lang}
          isHost={isHost} onGoToVoting={handleGoToVoting} />
      )}

      {room.game_status === 'voting' && (
        <VotingPhase room={room} players={players} myPlayer={myPlayer}
          allVotes={votes} onVoteComplete={handleVoteComplete} isHost={isHost} />
      )}

      {room.game_status === 'game_over' && (
        <GameOverPhase room={room} players={players}
          isHost={isHost} onPlayAgain={handlePlayAgain} />
      )}
    </>
  );
}
