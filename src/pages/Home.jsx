// src/pages/Home.jsx
// 修復 H1（無限迴圈）、H2（race）、H10（validation）、M6（rate limit）
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, DoorOpen, Eye, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import BannerAd from '@/components/ads/BannerAd';
import RulesModal from '@/components/game/RulesModal';
import { useLang } from '@/lib/LangContext';
import { useAuth } from '@/lib/AuthContext';
import { createRoom, joinRoom, GameError } from '@/api/gameApi';
import { trackGameEvent } from '@/lib/monitoring';

const USERNAME_REGEX = /^[\w\u4e00-\u9fff \-]{1,12}$/;

export default function Home() {
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { t } = useLang();
  const { isLoadingAuth, authError } = useAuth();

  const errorMessage = (e) => {
    if (!(e instanceof GameError)) return e.message;
    switch (e.code) {
      case 'room_not_found':        return t.roomNotFound;
      case 'room_full':             return t.roomFull || '房間已滿（最多 8 人）';
      case 'game_already_started':  return t.gameAlreadyStarted;
      case 'unauthenticated':       return t.pleaseWait || '正在連線，請稍候';
      case 'rate_limited':          return t.rateLimited || '操作太頻繁，請稍等幾秒再試';
      default:                      return t.unknownError || '發生錯誤，請重試';
    }
  };

  const validateUsername = () => {
    const trimmed = username.trim();
    if (!trimmed) return false;
    if (!USERNAME_REGEX.test(trimmed)) {
      setError(t.invalidUsername || '暱稱只能包含中英文、數字、空格、連字號');
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!validateUsername() || loading || isLoadingAuth) return;
    setLoading(true);
    setError('');
    trackGameEvent('create_room_attempt');
    try {
      const result = await createRoom(username.trim());
      trackGameEvent('create_room_success', { room_id: result.room_id });
      navigate(`/Game?roomId=${result.room_id}`);
    } catch (e) {
      trackGameEvent('create_room_failed', { code: e.code });
      setError(t.createFailed + errorMessage(e));
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!validateUsername() || !roomCode.trim() || loading || isLoadingAuth) return;
    if (!/^[0-9]{4}$/.test(roomCode.trim())) {
      setError(t.invalidCode || '房間代碼為 4 位數字');
      return;
    }
    setLoading(true);
    setError('');
    trackGameEvent('join_room_attempt');
    try {
      const result = await joinRoom(roomCode.trim(), username.trim());
      trackGameEvent('join_room_success', { room_id: result.room_id });
      navigate(`/Game?roomId=${result.room_id}`);
    } catch (e) {
      trackGameEvent('join_room_failed', { code: e.code });
      setError(t.joinFailed + errorMessage(e));
      setLoading(false);
    }
  };

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p className="text-destructive">連線失敗，請重新整理頁面</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 pb-20">
      <div className="absolute top-4 right-16 flex items-center">
        <button onClick={() => setShowRules(true)}
          className="p-2 rounded-xl bg-secondary/60 hover:bg-secondary transition-colors text-muted-foreground">
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-2">
            <Eye className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">{t.appTitle}</h1>
          <p className="text-muted-foreground text-sm">{t.appSubtitle}</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">{t.yourNickname}</label>
          <Input value={username} onChange={e => setUsername(e.target.value)}
            placeholder={t.nicknamePlaceholder}
            className="h-12 text-base bg-secondary border-border" maxLength={12} />
        </div>

        {error && <p className="text-sm text-destructive text-center" role="alert">{error}</p>}

        {!mode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <Button onClick={() => setMode('create')} disabled={!username.trim() || isLoadingAuth}
              className="w-full h-14 text-base font-bold rounded-xl">
              <UserPlus className="w-5 h-5 mr-2" />{t.createRoom}
            </Button>
            <Button onClick={() => setMode('join')} disabled={!username.trim() || isLoadingAuth}
              variant="secondary" className="w-full h-14 text-base font-bold rounded-xl">
              <DoorOpen className="w-5 h-5 mr-2" />{t.joinRoom}
            </Button>
          </motion.div>
        )}

        {mode === 'create' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <Button onClick={handleCreate} disabled={loading}
              className="w-full h-14 text-base font-bold rounded-xl">
              {loading ? t.creating : t.confirmCreate}
            </Button>
            <Button variant="ghost" onClick={() => setMode(null)} className="w-full">{t.back}</Button>
          </motion.div>
        )}

        {mode === 'join' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <Input value={roomCode}
              onChange={e => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder={t.roomCodePlaceholder}
              className="h-12 text-center text-2xl tracking-[0.5em] font-bold bg-secondary border-border"
              maxLength={4} inputMode="numeric" />
            <Button onClick={handleJoin} disabled={loading || roomCode.length < 4}
              className="w-full h-14 text-base font-bold rounded-xl">
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
