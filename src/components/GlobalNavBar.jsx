import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Home } from 'lucide-react';
import { useLang } from '@/lib/LangContext';

const getOrCreateGuestId = () => {
  let guestId = localStorage.getItem('guest_session_id');
  if (!guestId) {
    guestId = 'guest_' + Math.random().toString(36).substring(2) + Date.now();
    localStorage.setItem('guest_session_id', guestId);
  }
  return guestId;
};

export default function GlobalNavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, toggleLang } = useLang();

  const urlParams = new URLSearchParams(location.search);
  const roomId = urlParams.get('roomId');

  const handleHome = async () => {
    if (!roomId) { navigate('/'); return; }
    const confirmed = window.confirm(t.confirmLeave);
    if (!confirmed) return;

    try {
      const guestId = getOrCreateGuestId();
      const { data: players } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', guestId);

      if (players?.length) {
        const me = players[0];
        await supabase.from('players').delete().eq('id', me.id);
        const { data: room } = await supabase
          .from('rooms').select('*').eq('id', roomId).single();
        if (room?.host_id === guestId) {
          await supabase.from('rooms')
            .update({ game_status: 'cancelled' }).eq('id', roomId);
        }
      }
    } catch (_) {}

    navigate('/');
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 pointer-events-none">
      <button
        onClick={handleHome}
        className="pointer-events-auto p-2 rounded-xl bg-secondary/70 hover:bg-secondary backdrop-blur-sm transition-colors text-muted-foreground"
      >
        <Home className="w-5 h-5" />
      </button>
      <button
        onClick={toggleLang}
        className="pointer-events-auto px-3 py-1.5 rounded-xl bg-secondary/70 hover:bg-secondary backdrop-blur-sm transition-colors text-muted-foreground text-xs font-bold"
      >
        {lang === 'zh-TW' ? 'EN' : '中'}
      </button>
    </div>
  );
}
