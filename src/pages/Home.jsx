import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateRoomCode } from '@/lib/gameUtils';
import { UserPlus, DoorOpen, Eye, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import BannerAd from '@/components/ads/BannerAd';
import RulesModal from '@/components/game/RulesModal';
import { useLang } from '@/lib/LangContext';

export default function Home() {
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const navigate = useNavigate();
  const { t } = useLang();

  const getOrCreateGuestId = () => {
    let guestId = localStorage.getItem('guest_session_id');
    if (!guestId) {
      guestId = 'guest_' + Math.random().toString(36).substring(2) + Date.now();
      localStorage.setItem('guest_session_id', guestId);
    }
    return guestId;
  };

  const handleCreate = async () => {
    if (!username.trim()) return;
    setLoading(true);
    try {
      const guestId = getOrCreateGuestId();

      // 產生唯一房間碼（碰撞重試）
      let code;
      while (true) {
        code = generateRoomCode();
        const { data: existing } = await supabase
          .from('rooms')
          .select('id, game_status')
          .eq('room_code', code);
        const activeRooms = (existing || []).filter(
          r => r.game_status !== 'cancelled' && r.game_status !== 'game_over'
        );
        if (activeRooms.length === 0) break;
      }

      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .insert({
          room_code: code,
          host_id: guestId,
          game_status: 'lobby',
          current_round: 1,
        })
        .select()
        .single();

      if (roomErr) throw roomErr;

      const { error: playerErr } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          username: username.trim(),
          user_id: guestId,
          role: 'unassigned',
          is_alive: true,
          is_host: true,
        });

      if (playerErr) throw playerErr;

      navigate(`/Game?roomId=${room.id}`);
    } catch (e) {
      setLoading(false);
      alert(t.createFailed + e.message);
    }
  };

  const handleJoin = async () => {
    if (!username.trim() || !roomCode.trim()) return;
    setLoading(true);
    try {
      const guestId = getOrCreateGuestId();

      const { data: rooms, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode.trim())
        .limit(1);

      if (error) throw error;
      if (!rooms || rooms.length === 0) {
        setLoading(false);
        alert(t.roomNotFound);
        return;
      }

      const room = rooms[0];
      if (room.game_status !== 'lobby') {
        setLoading(false);
        alert(t.gameAlreadyStarted);
        return;
      }

      const { count } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room.id);

      if ((count ?? 0) >= 8) {
        setLoading(false);
        alert('房間已滿（最多 8 人）');
        return;
      }

      const { error: playerErr } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          username: username.trim(),
          user_id: guestId,
          role: 'unassigned',
          is_alive: true,
          is_host: false,
        });

      if (playerErr) throw playerErr;

      navigate(`/Game?roomId=${room.id}`);
    } catch (e) {
      setLoading(false);
      alert(t.joinFailed + e.message);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 pb-20">
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
        className="w-full max-w-sm space-y-8"
      >
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-2">
            <Eye className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">{t.appTitle}</h1>
          <p className="text-muted-foreground text-sm">{t.appSubtitle}</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">{t.yourNickname}</label>
          <Input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder={t.nicknamePlaceholder}
            className="h-12 text-base bg-secondary border-border"
            maxLength={12}
          />
        </div>

        {!mode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <Button onClick={() => setMode('create')} disabled={!username.trim()} className="w-full h-14 text-base font-bold rounded-xl">
              <UserPlus className="w-5 h-5 mr-2" />{t.createRoom}
            </Button>
            <Button onClick={() => setMode('join')} disabled={!username.trim()} variant="secondary" className="w-full h-14 text-base font-bold rounded-xl">
              <DoorOpen className="w-5 h-5 mr-2" />{t.joinRoom}
            </Button>
          </motion.div>
        )}

        {mode === 'create' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <Button onClick={handleCreate} disabled={loading} className="w-full h-14 text-base font-bold rounded-xl">
              {loading ? t.creating : t.confirmCreate}
            </Button>
            <Button variant="ghost" onClick={() => setMode(null)} className="w-full">{t.back}</Button>
          </motion.div>
        )}

        {mode === 'join' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <Input
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder={t.roomCodePlaceholder}
              className="h-12 text-center text-2xl tracking-[0.5em] font-bold bg-secondary border-border"
              maxLength={4}
              inputMode="numeric"
            />
            <Button onClick={handleJoin} disabled={loading || roomCode.length < 4} className="w-full h-14 text-base font-bold rounded-xl">
              {loading ? t.joining : t.confirmJoin}
            </Button>
            <Button variant="ghost" onClick={() => setMode(null)} className="w-full">{t.back}</Button>
          </motion.div>
        )}
      </motion.div>

      <BannerAd />
      <RulesModal show={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
}
