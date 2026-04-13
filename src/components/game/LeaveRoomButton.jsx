import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Home } from 'lucide-react';
import { useLang } from '@/lib/LangContext';

export default function LeaveRoomButton({ myPlayer, room, isHost }) {
  const navigate = useNavigate();
  const { t } = useLang();

  const handleLeave = async () => {
    const confirmed = window.confirm(t.confirmLeave);
    if (!confirmed) return;

    if (myPlayer?.id) {
      await supabase.from('players').delete().eq('id', myPlayer.id);
    }

    if (isHost && room?.id) {
      await supabase.from('rooms').update({ game_status: 'cancelled' }).eq('id', room.id);
    }

    navigate('/');
  };

  return (
    <button
      onClick={handleLeave}
      className="absolute top-4 left-4 p-2 rounded-xl bg-secondary/60 hover:bg-secondary transition-colors text-muted-foreground"
    >
      <Home className="w-5 h-5" />
    </button>
  );
}
