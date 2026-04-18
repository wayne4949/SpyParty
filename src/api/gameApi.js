// src/api/gameApi.js
// 所有遊戲相關的 server 互動。Client 不再直接對 DB 寫。
import { supabase } from './supabaseClient';

// ─── 錯誤碼對應 ────────────────────────────────────────────────────────────
// server RPC throw 的是 PG exception，message 是我們定義的 key
// 這裡做成 i18n 友善的 error code
export class GameError extends Error {
  constructor(code, original) {
    super(code);
    this.code = code;
    this.original = original;
  }
}

function parseError(pgError) {
  const msg = pgError?.message || '';
  const knownCodes = [
    'unauthenticated', 'room_not_found', 'room_full', 'game_already_started',
    'not_host', 'already_started', 'invalid_player_count', 'not_voting_phase',
    'not_in_room', 'eliminated', 'invalid_target', 'cannot_vote_self',
    'invalid_phase', 'username required', 'rate_limited',
  ];
  for (const code of knownCodes) {
    if (msg.includes(code)) return new GameError(code, pgError);
  }
  // Postgres error codes
  if (pgError?.code === '23505') return new GameError('duplicate', pgError);
  if (pgError?.code === '22023') return new GameError('rate_limited', pgError);
  return new GameError('unknown', pgError);
}

// ─── 房間 ───────────────────────────────────────────────────────────────────

export async function createRoom(username) {
  const { data, error } = await supabase.rpc('create_room', { p_username: username });
  if (error) throw parseError(error);
  return data?.[0]; // { room_id, player_id, room_code }
}

export async function joinRoom(roomCode, username) {
  const { data, error } = await supabase.rpc('join_room', {
    p_room_code: roomCode,
    p_username: username,
  });
  if (error) throw parseError(error);
  return data?.[0]; // { room_id, player_id }
}

export async function leaveRoom(roomId) {
  const { error } = await supabase.rpc('leave_room', { p_room_id: roomId });
  if (error) throw parseError(error);
}

export async function hostHeartbeat(roomId) {
  // 心跳失敗不拋出，只是記 log
  const { error } = await supabase.rpc('host_heartbeat', { p_room_id: roomId });
  if (error) console.warn('heartbeat failed', error);
}

// ─── 遊戲流程 ───────────────────────────────────────────────────────────────

export async function startGame(roomId) {
  const { error } = await supabase.rpc('start_game', { p_room_id: roomId });
  if (error) throw parseError(error);
}

export async function goToVoting(roomId, seconds = 60) {
  const { data, error } = await supabase.rpc('go_to_voting', {
    p_room_id: roomId,
    p_seconds: seconds,
  });
  if (error) throw parseError(error);
  return data; // voting_ends_at timestamp
}

export async function submitVote(roomId, targetId) {
  const { error } = await supabase.rpc('submit_vote', {
    p_room_id: roomId,
    p_target_id: targetId,
  });
  if (error) throw parseError(error);
}

export async function completeVote(roomId) {
  const { data, error } = await supabase.rpc('complete_vote', { p_room_id: roomId });
  if (error) throw parseError(error);
  return data; // { outcome, player_id?, winner? }
}

// ─── 讀取 ───────────────────────────────────────────────────────────────────

export async function getGameReveal(roomId) {
  const { data, error } = await supabase.rpc('get_game_reveal', { p_room_id: roomId });
  if (error) throw parseError(error);
  return data || []; // [{ player_id, username, role, assigned_word, is_alive }]
}

export async function fetchRoomBundle(roomId) {
  // 一次抓齊房間、玩家、票、自己的 secret
  const [roomRes, playersRes, votesRes, secretRes] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).single(),
    supabase.from('players').select('*').eq('room_id', roomId).order('joined_at'),
    supabase.from('votes').select('*').eq('room_id', roomId),
    supabase.from('player_secrets').select('*').eq('room_id', roomId).maybeSingle(),
    // ↑ RLS 會過濾，只會拿到自己的 secret
  ]);

  if (roomRes.error) throw roomRes.error;

  return {
    room: roomRes.data,
    players: playersRes.data || [],
    votes: votesRes.data || [],
    mySecret: secretRes.data || null,
  };
}
