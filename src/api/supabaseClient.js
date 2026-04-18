// src/api/supabaseClient.js
// 修復 C1, C4：匿名 auth 取代 localStorage guest id
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // 用 throw 而不是 console.error，讓 bootstrap 就失敗，避免後續神祕錯誤
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'spyparty-auth',
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

/**
 * 確保已登入（匿名也算）。回傳 auth user id。
 * 之所以用匿名 auth 而不是 localStorage 隨便生 id：
 *   auth.uid() 是 server 簽過的 JWT，RLS 才能信任；
 *   localStorage id 可以被任意竄改成別人的 id。
 */
export async function ensureAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}
