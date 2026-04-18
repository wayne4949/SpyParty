// supabase/functions/_shared/rateLimit.ts
// IP-based rate limit，用 Postgres 同一張 rate_limits 表
// 這是**可選的**第二層防禦；DB 層 rate_limit_check 已是主要防線。
// 需要加這層的場景：同一 IP 狂開匿名帳號繞過 per-uid 的 limit。

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

/**
 * 取 request 的 client IP。Supabase Edge 會帶 cf-connecting-ip。
 */
export function getClientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip')
      || req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || 'unknown';
}

/**
 * 呼叫 DB 的 rate_limit_check(key)。超過就 throw。
 */
export async function checkIpRateLimit(
  db: SupabaseClient,
  ip: string,
  action: string,
  limit: number,
  windowSec: number,
): Promise<void> {
  const { error } = await db.rpc('rate_limit_check', {
    p_key: `ip:${action}:${ip}`,
    p_limit: limit,
    p_window_sec: windowSec,
  });
  if (error) {
    // PG errcode 22023 = rate_limited
    if (error.code === '22023' || error.message?.includes('rate_limited')) {
      throw new RateLimitError();
    }
    throw error;
  }
}

export class RateLimitError extends Error {
  constructor() { super('rate_limited'); }
}

/**
 * JSON response 的簡化 helper
 */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
