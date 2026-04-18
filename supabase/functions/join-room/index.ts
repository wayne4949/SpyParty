// supabase/functions/join-room/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  checkIpRateLimit, getClientIp, getServiceClient, json, RateLimitError,
} from '../_shared/rateLimit.ts';

const IP_LIMIT      = 30;
const IP_WINDOW_SEC = 60;

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const ip = getClientIp(req);
    const adminDb = getServiceClient();
    await checkIpRateLimit(adminDb, ip, 'join_room', IP_LIMIT, IP_WINDOW_SEC);

    const { roomCode, username } = await req.json().catch(() => ({}));
    if (!roomCode || !username) return json({ error: 'missing_params' }, 400);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthenticated' }, 401);

    const userDb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data, error } = await userDb.rpc('join_room', {
      p_room_code: roomCode, p_username: username,
    });
    if (error) {
      if (error.message?.includes('rate_limited')) return json({ error: 'rate_limited' }, 429);
      return json({ error: error.message }, 400);
    }

    return json({ data: data?.[0] });
  } catch (e) {
    if (e instanceof RateLimitError) return json({ error: 'rate_limited' }, 429);
    console.error(e);
    return json({ error: 'internal_error' }, 500);
  }
});
