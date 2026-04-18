-- =============================================================================
-- SpyParty: Scheduled Jobs
-- 需要在 Supabase Dashboard 開啟 pg_cron extension
-- =============================================================================

create extension if not exists pg_cron;

-- 每分鐘掃描 host_last_seen 超過 3 分鐘的房間，cancel 之
-- 修復 H3, H4：host 離線但 beforeunload 沒觸發的殭屍房
select cron.schedule(
  'cleanup-stale-rooms',
  '* * * * *',                      -- 每分鐘
  $$ select public.cleanup_stale_rooms(); $$
);

-- 每小時刪除 1 天前的 cancelled / game_over 房間（省 DB 空間）
create or replace function public.purge_old_rooms()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_cnt int;
begin
  with deleted as (
    delete from public.rooms
     where game_status in ('cancelled','game_over')
       and updated_at < now() - interval '1 day'
    returning id
  )
  select count(*) into v_cnt from deleted;
  return v_cnt;
end;
$$;

revoke execute on function public.purge_old_rooms() from public;
grant execute on function public.purge_old_rooms() to service_role;

select cron.schedule(
  'purge-old-rooms',
  '0 * * * *',                      -- 每小時整點
  $$ select public.purge_old_rooms(); $$
);
