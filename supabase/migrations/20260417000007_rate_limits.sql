-- =============================================================================
-- SpyParty: Rate Limiting (DB layer)
-- 修復 M6：惡意 client 無限建房 / 投票 / join
--
-- 設計：用一張 rate_limits 表 + sliding window。
-- 每個 RPC 開頭呼叫 rate_limit_check(key, limit, window_sec)，超過就 raise。
--
-- 選擇 DB 層而非 Edge Function 的原因：
--   1. 任何走 supabase.rpc() 的攻擊都擋得到，包括直接打 REST API
--   2. 不需要額外部署 function，運維簡單
--   3. 跟 auth.uid() 天然整合
-- 缺點：
--   1. DB CPU 會多一點點（每個 RPC 多一次 upsert）
--   2. 跨 region 時窗不夠精準（同一個 DB 所以還好）
-- =============================================================================

-- ─── rate_limits 表 ─────────────────────────────────────────────────────────
create table if not exists public.rate_limits (
  bucket      text not null,                    -- e.g. "create_room:<uid>" or "vote:<uid>"
  window_start timestamptz not null,
  count       int not null default 0,
  primary key (bucket, window_start)
);

create index if not exists rate_limits_window_idx
  on public.rate_limits (window_start);

-- 自動清舊資料（1 小時前的）
create or replace function public.purge_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - interval '1 hour';
$$;

-- ─── 核心 rate limit 檢查 ───────────────────────────────────────────────────
-- 語意：「過去 p_window_sec 秒內，p_key 這個 bucket 最多 p_limit 次」
-- 實作：sliding window with fixed bucket (每 window_sec 一個 bucket)
create or replace function public.rate_limit_check(
  p_key        text,
  p_limit      int,
  p_window_sec int default 60
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket_start timestamptz;
  v_current      int;
  v_prev_bucket  timestamptz;
  v_prev         int;
  v_elapsed_frac numeric;
  v_estimated    numeric;
begin
  -- 對齊到 window 起點
  v_bucket_start := date_trunc('second', now())
                    - (extract(epoch from now())::bigint % p_window_sec) * interval '1 second';
  v_prev_bucket  := v_bucket_start - (p_window_sec || ' seconds')::interval;

  -- 這個 bucket 的 count
  select coalesce(count, 0) into v_current
    from public.rate_limits
   where bucket = p_key and window_start = v_bucket_start;

  -- 上一個 bucket 的 count
  select coalesce(count, 0) into v_prev
    from public.rate_limits
   where bucket = p_key and window_start = v_prev_bucket;

  -- 用上個 bucket 剩餘比例估算 sliding window
  v_elapsed_frac := extract(epoch from now() - v_bucket_start)::numeric / p_window_sec;
  v_estimated    := v_prev * (1 - v_elapsed_frac) + v_current;

  if v_estimated >= p_limit then
    raise exception 'rate_limited' using
      errcode = '22023',
      detail  = format('key=%s limit=%s/%ss', p_key, p_limit, p_window_sec),
      hint    = 'too_many_requests';
  end if;

  -- 增加計數
  insert into public.rate_limits (bucket, window_start, count)
  values (p_key, v_bucket_start, 1)
  on conflict (bucket, window_start)
  do update set count = public.rate_limits.count + 1;
end;
$$;

-- ─── RLS: 只有 security definer functions 能讀寫 ────────────────────────────
alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;

drop policy if exists rate_limits_none on public.rate_limits;
create policy rate_limits_none on public.rate_limits
  for all using (false) with check (false);

grant execute on function public.rate_limit_check(text, int, int) to authenticated, anon;
revoke execute on function public.purge_rate_limits() from public;
grant execute on function public.purge_rate_limits() to service_role;

-- ─── 每小時清舊 bucket ──────────────────────────────────────────────────────
-- 在 cron_jobs migration 後執行；如果 pg_cron 還沒裝就略過
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-rate-limits', '0 * * * *',
                          $sql$ select public.purge_rate_limits(); $sql$);
  end if;
end $$;
