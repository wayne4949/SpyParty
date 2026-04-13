import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/LangContext';
import { getSpyCount, shuffleArray } from '@/lib/gameUtils';
import { assignNewWords } from '@/lib/wordUtils';
import LobbyPhase from '@/components/game/LobbyPhase';
import SpeakingPhase from '@/components/game/SpeakingPhase';
import VotingPhase from '@/components/game/VotingPhase';
import GameOverPhase from '@/components/game/GameOverPhase';
import InterstitialAd from '@/components/ads/InterstitialAd';

const getOrCreateGuestId = () => {
  let guestId = localStorage.getItem('guest_session_id');
  if (!guestId) {
    guestId = 'guest_' + Math.random().toString(36).substring(2) + Date.now();
    localStorage.setItem('guest_session_id', guestId);
  }
  return guestId;
};

export default function Game() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('roomId');
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [votes, setVotes] = useState([]);
  const [myGuestId] = useState(() => getOrCreateGuestId());
  const [myPlayer, setMyPlayer] = useState(null);
  const [showAd, setShowAd] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [startingGame, setStartingGame] = useState(false);
  const { t, lang } = useLang();

  const roomRef = useRef(null);
  const playersRef = useRef([]);
  const isHostRef = useRef(false);

  // ─── 1. 初始載入 ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) { navigate('/'); return; }

    const load = async () => {
      const [{ data: roomData }, { data: playersData }, { data: votesData }] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).single(),
        supabase.from('players').select('*').eq('room_id', roomId),
        supabase.from('votes').select('*').eq('room_id', roomId),
      ]);

      if (!roomData) { navigate('/'); return; }
      if (roomData.game_status === 'cancelled') { navigate('/'); return; }

      setRoom(roomData);
      roomRef.current = roomData;
      setPlayers(playersData || []);
      playersRef.current = playersData || [];
      setVotes(votesData || []);

      const mine = (playersData || []).find(p => p.user_id === myGuestId);
      if (!mine) { navigate('/'); return; }
      setMyPlayer(mine);
      isHostRef.current = roomData.host_id === myGuestId;
    };

    load();
  }, [roomId]);

  // ─── 2. Realtime 訂閱 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`game-${roomId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`
      }, (payload) => {
        if (payload.eventType === 'DELETE' || payload.new?.game_status === 'cancelled') {
          if (!isHostRef.current) { alert(t.hostLeft); navigate('/'); }
          return;
        }
        if (payload.new) { setRoom(payload.new); roomRef.current = payload.new; }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}`
      }, (payload) => {
        setPlayers(prev => {
          if (prev.find(p => p.id === payload.new.id)) return prev;
          const next = [...prev, payload.new];
          playersRef.current = next;
          return next;
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}`
      }, (payload) => {
        setPlayers(prev => {
          const next = prev.map(p => p.id === payload.new.id ? payload.new : p);
          playersRef.current = next;
          return next;
        });
        if (payload.new.user_id === myGuestId) setMyPlayer(payload.new);
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}`
      }, (payload) => {
        setPlayers(prev => {
          const next = prev.filter(p => p.id !== payload.old.id);
          playersRef.current = next;
          const activeStatuses = ['speaking', 'voting', 'assigning'];
          if (isHostRef.current && activeStatuses.includes(roomRef.current?.game_status) && next.length < 4) {
            supabase.from('rooms').update({ game_status: 'cancelled' }).eq('id', roomRef.current.id);
          }
          return next;
        });
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}`
      }, (payload) => {
        setVotes(prev => {
          if (prev.find(v => v.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}`
      }, (payload) => {
        setVotes(prev => prev.filter(v => v.id !== payload.old.id));
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [roomId]);

  const isHost = !!(myGuestId && room && room.host_id === myGuestId);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  // ─── 3. 離開時清理 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!myPlayer || !room) return;
    const handleUnload = () => {
      if (myPlayer?.id) supabase.from('players').delete().eq('id', myPlayer.id);
      if (isHostRef.current && room?.id) {
        supabase.from('rooms').update({ game_status: 'cancelled' }).eq('id', room.id);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [myPlayer?.id, room?.id]);

  // ─── 4. 動態勝負判定 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isHost || !room) return;
    const status = room.game_status;
    if (status !== 'speaking' && status !== 'voting') return;
    const alivePlayers = players.filter(p => p.is_alive);
    const aliveSpies = alivePlayers.filter(p => p.role === 'spy').length;
    const aliveCivilians = alivePlayers.filter(p => p.role === 'civilian').length;
    if (alivePlayers.some(p => p.role === 'unassigned')) return;
    if (alivePlayers.length === 0) return;
    if (aliveSpies === 0) {
      supabase.from('rooms').update({ game_status: 'game_over', winner: 'civilians' }).eq('id', room.id);
    } else if (aliveSpies >= aliveCivilians) {
      supabase.from('rooms').update({ game_status: 'game_over', winner: 'spies' }).eq('id', room.id);
    }
  }, [players, isHost, room?.game_status]);

  // ─── 5. 開始遊戲 ────────────────────────────────────────────────────────────
  const handleStartGame = async () => {
    if (!isHost || startingGame) return;
    setStartingGame(true);

    try {
      const { civilian_word, spy_word, new_played_word_ids } = assignNewWords({
        played_word_ids: room.played_word_ids || [],
      });

      const spyCount = getSpyCount(players.length);
      const shuffled = shuffleArray(players);
      const spyIds = shuffled.slice(0, spyCount).map(p => p.id);

      await Promise.all(
        players.map(p => {
          const isSpy = spyIds.includes(p.id);
          const word = isSpy
            ? (spy_word[lang] || spy_word['zh'])
            : (civilian_word[lang] || civilian_word['zh']);
          return supabase.from('players').update({
            role: isSpy ? 'spy' : 'civilian',
            is_alive: true,
            assigned_word: word,
          }).eq('id', p.id);
        })
      );

      await supabase.from('rooms').update({
        game_status: 'speaking',
        civilian_word,
        spy_word,
        played_word_ids: new_played_word_ids,
        current_round: 1,
        winner: '',
      }).eq('id', room.id);
    } catch (e) {
      console.error('Start game error:', e);
    } finally {
      // ✅ 修復：無論成功或失敗都重置，避免按鈕永久 disable
      setStartingGame(false);
    }
  };

  const handleGoToVoting = async () => {
    if (!isHost) return;
    await supabase.from('rooms').update({ game_status: 'voting' }).eq('id', room.id);
  };

  // ─── 6. 計票結算 ────────────────────────────────────────────────────────────
  const handleVoteComplete = useCallback(async (roundVotes) => {
    if (!isHostRef.current) return;

    // ✅ 修復：空票時不 crash
    if (roundVotes.length === 0) {
      // 沒人投票，直接進下一輪
      await supabase.from('votes').delete().eq('room_id', roomRef.current.id);
      await supabase.from('rooms').update({
        game_status: 'speaking',
        current_round: (roomRef.current.current_round || 1) + 1,
      }).eq('id', roomRef.current.id);
      return;
    }

    const tally = {};
    roundVotes.forEach(v => { tally[v.target_id] = (tally[v.target_id] || 0) + 1; });
    const maxVotes = Math.max(...Object.values(tally));
    const topTargets = Object.keys(tally).filter(id => tally[id] === maxVotes);

    let isTie = topTargets.length > 1;

    if (!isTie) {
      await supabase.from('players').update({ is_alive: false }).eq('id', topTargets[0]);
    }

    const { data: updatedPlayers } = await supabase
      .from('players').select('*').eq('room_id', roomRef.current.id);

    const aliveSpies = (updatedPlayers || []).filter(p => p.role === 'spy' && p.is_alive).length;
    const aliveCivilians = (updatedPlayers || []).filter(p => p.role === 'civilian' && p.is_alive).length;

    if (aliveSpies === 0) {
      await supabase.from('rooms').update({ game_status: 'game_over', winner: 'civilians' }).eq('id', roomRef.current.id);
    } else if (aliveSpies >= aliveCivilians) {
      await supabase.from('rooms').update({ game_status: 'game_over', winner: 'spies' }).eq('id', roomRef.current.id);
    } else {
      setPendingAction(isTie ? 'tie' : 'speaking');
      setShowAd(true);
    }
  }, []);

  const handleAdComplete = useCallback(async () => {
    setShowAd(false);
    if ((pendingAction === 'speaking' || pendingAction === 'tie') && isHostRef.current) {
      await supabase.from('votes').delete().eq('room_id', roomRef.current.id);
      await supabase.from('rooms').update({
        game_status: 'speaking',
        current_round: (roomRef.current.current_round || 1) + 1,
      }).eq('id', roomRef.current.id);
    }
    setPendingAction(null);
  }, [pendingAction]);

  // ─── 7. 再玩一局 ────────────────────────────────────────────────────────────
  const handlePlayAgain = async () => {
    if (!isHost) return;

    await supabase.from('votes').delete().eq('room_id', room.id);
    setVotes([]);

    const { civilian_word, spy_word, new_played_word_ids } = assignNewWords({
      played_word_ids: room.played_word_ids || [],
    });
    const spyCount = getSpyCount(players.length);
    const shuffled = shuffleArray(players);
    const spyIds = shuffled.slice(0, spyCount).map(p => p.id);

    await Promise.all(
      players.map(p => {
        const isSpy = spyIds.includes(p.id);
        const word = isSpy
          ? (spy_word[lang] || spy_word['zh'])
          : (civilian_word[lang] || civilian_word['zh']);
        return supabase.from('players').update({
          role: isSpy ? 'spy' : 'civilian',
          is_alive: true,
          assigned_word: word,
        }).eq('id', p.id);
      })
    );

    await supabase.from('rooms').update({
      game_status: 'speaking',
      civilian_word,
      spy_word,
      played_word_ids: new_played_word_ids,
      winner: '',
      current_round: 1,
    }).eq('id', room.id);

    setStartingGame(false);
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (room.game_status === 'cancelled') return null;

  return (
    <>
      <InterstitialAd show={showAd} onComplete={handleAdComplete} />

      {room.game_status === 'lobby' && (
        <LobbyPhase room={room} players={players} isHost={isHost}
          myPlayer={myPlayer} onStartGame={handleStartGame} startingGame={startingGame} />
      )}

      {(room.game_status === 'speaking' || room.game_status === 'assigning') && (
        <SpeakingPhase room={room} players={players} myPlayer={myPlayer}
          isHost={isHost} onGoToVoting={handleGoToVoting} />
      )}

      {room.game_status === 'voting' && (
        <VotingPhase room={room} players={players} myPlayer={myPlayer}
          allVotes={votes} onVoteComplete={handleVoteComplete} isHost={isHost} />
      )}

      {room.game_status === 'game_over' && (
        <GameOverPhase room={room} players={players} isHost={isHost} onPlayAgain={handlePlayAgain} />
      )}
    </>
  );
}
