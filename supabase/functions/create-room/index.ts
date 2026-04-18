// supabase/functions/create-room/index.ts
// IP-based rate limit → 轉呼叫 create_room RPC（用使用者的 JWT）
//
// 部署：supabase functions deploy create-room
// Client 改呼叫 supabase.functions.invoke('create-room', { body: { username } })
//   而不是直接 supabase.rpc('create_room', ...)
//
// 注意：這是**可選的強化**；如果不想加一層就跳過，直接用 DB 層的 rate limit。
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  checkIpRateLimit, getClientIp, getServiceClient, json, RateLimitError,
} from '../_shared/rateLimit.ts';

const IP_LIMIT      = 10;   // 每 IP 每分鐘最多 10 次 create_room 嘗試
const IP_WINDOW_SEC = 60;

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    // ─── 第一層：IP rate limit ──────────────────────────────────────────
    const ip = getClientIp(req);
    const adminDb = getServiceClient();
    await checkIpRateLimit(adminDb, ip, 'create_room', IP_LIMIT, IP_WINDOW_SEC);

    // ─── 解析 request ───────────────────────────────────────────────────
    const { username } = await req.json().catch(() => ({}));
    if (!username || typeof username !== 'string') {
      return json({ error: 'username_required' }, 400);
    }

    // ─── 用 caller 的 JWT 呼叫 RPC（保留 auth.uid()） ─────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthenticated' }, 401);

    const userDb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data, error } = await userDb.rpc('create_room', { p_username: username });
    if (error) {
      if (error.message?.includes('rate_limited')) {
        return json({ error: 'rate_limited' }, 429);
      }
      return json({ error: error.message }, 400);
    }

    return json({ data: data?.[0] });
  } catch (e) {
    if (e instanceof RateLimitError) {
      return json({ error: 'rate_limited' }, 429);
    }
    console.error(e);
    return json({ error: 'internal_error' }, 500);
  }
});
