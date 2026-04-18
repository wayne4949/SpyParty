// src/hooks/useGameRoom.js
// 修復：M1（reconnect）、M2（ref 最新值）、H3（pagehide 改用）、H4（presence 偵測）
// 把 Game.jsx 400 行裡的 realtime / presence / heartbeat / cleanup 全部收進這個 hook
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { fetchRoomBundle, hostHeartbeat, leaveRoom } from '@/api/gameApi';

const HEARTBEAT_INTERVAL_MS = 30_000;

export function useGameRoom({ roomId, userId, onRoomCancelled }) {
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [votes, setVotes] = useState([]);
  const [mySecret, setMySecret] = useState(null);  // { role, assigned_word }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // connecting|connected|reconnecting

  // ref 永遠指向最新值（修復 M2）
  const roomRef = useRef(null);
  const isHost = !!(userId && room && room.host_id === userId);
  const isHostRef = useRef(false);
  isHostRef.current = isHost;

  // ─── 初始載入 + 重連時 refetch ────────────────────────────────────────
  const reload = useCallback(async () => {
    if (!roomId) return;
    try {
      const bundle = await fetchRoomBundle(roomId);
      if (!bundle.room) {
        onRoomCancelled?.('not_found');
        return;
      }
      if (bundle.room.game_status === 'cancelled') {
        onRoomCancelled?.('cancelled');
        return;
      }
      setRoom(bundle.room);
      roomRef.current = bundle.room;
      setPlayers(bundle.players);
      setVotes(bundle.votes);
      setMySecret(bundle.mySecret);
      setLoading(false);
    } catch (e) {
      setError(e);
      setLoading(false);
    }
  }, [roomId, onRoomCancelled]);

  useEffect(() => { reload(); }, [reload]);

  // ─── Realtime 訂閱 ────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !userId) return;

    const channel = supabase.channel(`game-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          onRoomCancelled?.('deleted');
          return;
        }
        if (payload.new?.game_status === 'cancelled' && payload.new.host_id !== userId) {
          onRoomCancelled?.('cancelled');
          return;
        }
        if (payload.new) {
          setRoom(payload.new);
          roomRef.current = payload.new;
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        setPlayers(prev => prev.find(p => p.id === payload.new.id) ? prev : [...prev, payload.new]);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        setPlayers(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        setPlayers(prev => prev.filter(p => p.id !== payload.old.id));
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        setVotes(prev => prev.find(v => v.id === payload.new.id) ? prev : [...prev, payload.new]);
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        setVotes(prev => prev.filter(v => v.id !== payload.old.id));
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'player_secrets', filter: `user_id=eq.${userId}`,
      }, (payload) => {
        if (payload.new?.room_id === roomId) setMySecret(payload.new);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
          // 重連後做一次 refetch，防止斷線期間漏事件（修復 M1）
          reload();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus('reconnecting');
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [roomId, userId, reload, onRoomCancelled]);

  // ─── Presence: 偵測 host 離線 ─────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !userId) return;

    const presence = supabase.channel(`presence-${roomId}`, {
      config: { presence: { key: userId } },
    });

    presence
      .on('presence', { event: 'leave' }, ({ key }) => {
        const r = roomRef.current;
        if (!r) return;
        // 房主離線且遊戲還在進行 → 等 server cleanup cron 處理
        // 不在 client 主動 cancel 房間（避免任意人偽造 "host 離開了"）
        if (key === r.host_id && key !== userId) {
          // 只是個提示，真正的 cancel 由 server cron 根據 host_last_seen 做
          console.info('[presence] host went offline');
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presence.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(presence); };
  }, [roomId, userId]);

  // ─── Host heartbeat ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isHost || !roomId) return;
    hostHeartbeat(roomId);
    const t = setInterval(() => hostHeartbeat(roomId), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [isHost, roomId]);

  // ─── 離開頁面清理（修復 H3）──────────────────────────────────────────
  // 行動瀏覽器的正確組合：visibilitychange(hidden) + pagehide
  useEffect(() => {
    if (!roomId) return;

    const handleLeave = () => {
      // sendBeacon 不可用（supabase-js 會走 fetch），
      // 這裡改為：立刻呼叫 leaveRoom（fetch keepalive），
      // 如果瀏覽器已經卡 unload，至少 3 分鐘後 cleanup_stale_rooms 會清。
      leaveRoom(roomId).catch(() => {});
    };

    const onVis = () => { if (document.visibilityState === 'hidden') handleLeave(); };
    window.addEventListener('pagehide', handleLeave);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', handleLeave);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [roomId]);

  const myPlayer = players.find(p => p.user_id === userId) || null;

  return {
    room, players, votes, mySecret, myPlayer,
    isHost, loading, error, connectionStatus, reload,
  };
}
