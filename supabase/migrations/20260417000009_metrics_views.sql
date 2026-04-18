-- =============================================================================
-- SpyParty: Operational Views & Metrics
-- 給營運 dashboard 用的 views，不含敏感資料
-- =============================================================================

-- ─── 活躍房間數（即時）──────────────────────────────────────────────────────
create or replace view public.v_active_rooms as
select
  game_status,
  count(*)                        as room_count,
  avg(current_round)::numeric(5,2) as avg_round,
  min(created_at)                 as oldest_created_at
from public.rooms
where game_status not in ('cancelled','game_over')
group by game_status;

-- ─── 過去 24h 遊戲漏斗 ──────────────────────────────────────────────────────
create or replace view public.v_funnel_24h as
with buckets as (
  select
    count(*) filter (where created_at >= now() - interval '24 hours') as rooms_created,
    count(*) filter (
      where created_at >= now() - interval '24 hours'
        and game_status in ('speaking','voting','game_over')
    ) as rooms_started,
    count(*) filter (
      where created_at >= now() - interval '24 hours'
        and game_status = 'game_over'
    ) as rooms_finished,
    count(*) filter (
      where created_at >= now() - interval '24 hours'
        and game_status = 'cancelled'
    ) as rooms_cancelled
  from public.rooms
)
select
  rooms_created,
  rooms_started,
  rooms_finished,
  rooms_cancelled,
  case when rooms_created > 0
       then round(rooms_started::numeric / rooms_created * 100, 1)
       else 0 end as start_rate_pct,
  case when rooms_started > 0
       then round(rooms_finished::numeric / rooms_started * 100, 1)
       else 0 end as finish_rate_pct
from buckets;

-- ─── 每小時建房量（24h）──────────────────────────────────────────────────
create or replace view public.v_rooms_hourly_24h as
select
  date_trunc('hour', created_at) as hour,
  count(*)                       as rooms_created,
  count(*) filter (where game_status = 'game_over')  as finished,
  count(*) filter (where game_status = 'cancelled')  as cancelled,
  avg(current_round)::numeric(4,2)                   as avg_rounds
from public.rooms
where created_at >= now() - interval '24 hours'
group by 1
order by 1 desc;

-- ─── Rate limit 命中 ────────────────────────────────────────────────────────
create or replace view public.v_rate_limit_pressure as
select
  split_part(bucket, ':', 1)            as action,
  split_part(bucket, ':', 2)            as subject_type,  -- 'uid' or 'ip'
  date_trunc('minute', window_start)    as minute,
  sum(count)::int                       as total_calls,
  count(distinct bucket)                as distinct_subjects
from public.rate_limits
where window_start > now() - interval '1 hour'
group by 1, 2, 3
order by 3 desc, 4 desc;

-- ─── 授權：view 只給 service_role 讀（營運）──────────────────────────────
revoke all on public.v_active_rooms         from public;
revoke all on public.v_funnel_24h           from public;
revoke all on public.v_rooms_hourly_24h     from public;
revoke all on public.v_rate_limit_pressure  from public;

grant select on public.v_active_rooms        to service_role;
grant select on public.v_funnel_24h          to service_role;
grant select on public.v_rooms_hourly_24h    to service_role;
grant select on public.v_rate_limit_pressure to service_role;
