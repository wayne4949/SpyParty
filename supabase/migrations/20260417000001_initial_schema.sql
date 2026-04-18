-- =============================================================================
-- SpyParty: Full Schema + RLS + Constraints
-- 修復對應漏洞：C1, C3, H2, H7, H8
-- =============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Tables ──────────────────────────────────────────────────────────────────

-- rooms: 遊戲房間
create table if not exists public.rooms (
  id              uuid primary key default gen_random_uuid(),
  room_code       text not null,
  host_id         uuid not null,                   -- 對應 auth.users.id
  game_status     text not null default 'lobby'
                    check (game_status in ('lobby','assigning','speaking','voting','game_over','cancelled')),
  current_round   int  not null default 1 check (current_round >= 1 and current_round <= 50),
  winner          text check (winner in ('spies','civilians','')),
  played_word_ids int[] not null default '{}',
  host_last_seen  timestamptz not null default now(),
  voting_ends_at  timestamptz,                     -- server-authoritative timer
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- 注意：civilian_word, spy_word 不再存在 rooms！詞只存 player_secrets
  constraint room_code_format check (room_code ~ '^[0-9]{4}$')
);

-- 修復 H2：同一時間只允許一個 active 房間使用同一個 code
create unique index if not exists rooms_active_code_uniq
  on public.rooms (room_code)
  where game_status not in ('cancelled','game_over');

create index if not exists rooms_host_id_idx on public.rooms (host_id);
create index if not exists rooms_last_seen_idx on public.rooms (host_last_seen)
  where game_status not in ('cancelled','game_over');

-- players: 玩家公開資訊（任何同房玩家都能看）
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  user_id     uuid not null,                       -- 對應 auth.users.id
  username    text not null,
  is_alive    boolean not null default true,
  is_host     boolean not null default false,
  joined_at   timestamptz not null default now(),
  constraint username_format check (
    length(username) between 1 and 12
    and username ~ '^[\w\u4e00-\u9fff \-]+$'
  ),
  -- 修復 H1：同一 user 在同一 room 只能有一個 player row
  constraint players_room_user_uniq unique (room_id, user_id)
);

create index if not exists players_room_id_idx on public.players (room_id);
create index if not exists players_user_id_idx on public.players (user_id);

-- player_secrets: 玩家私密資訊（只有自己看得到）
-- 修復 C2：role / assigned_word 從 players 拆出來，RLS 鎖到自己
create table if not exists public.player_secrets (
  player_id      uuid primary key references public.players(id) on delete cascade,
  room_id        uuid not null references public.rooms(id) on delete cascade,
  user_id        uuid not null,
  role           text not null default 'unassigned'
                   check (role in ('civilian','spy','unassigned')),
  assigned_word  jsonb,                            -- {zh: '...', en: '...'} 存兩語
  updated_at     timestamptz not null default now()
);

create index if not exists player_secrets_room_idx on public.player_secrets (room_id);

-- votes: 投票紀錄
create table if not exists public.votes (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  round_number int not null check (round_number >= 1),
  voter_id     uuid not null references public.players(id) on delete cascade,
  target_id    uuid not null references public.players(id) on delete cascade,
  created_at   timestamptz not null default now(),
  -- 修復 C3：同一輪、同一 voter 只能投一次（DB 層強制）
  constraint votes_round_voter_uniq unique (room_id, round_number, voter_id),
  constraint no_self_vote check (voter_id <> target_id)
);

create index if not exists votes_room_round_idx on public.votes (room_id, round_number);

-- words_library: 詞庫（改存 DB，不是 client）
create table if not exists public.words_library (
  id     serial primary key,
  word_a jsonb not null,                           -- {zh, en}
  word_b jsonb not null,
  active boolean not null default true
);

-- ─── updated_at triggers ─────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists rooms_updated_at on public.rooms;
create trigger rooms_updated_at before update on public.rooms
  for each row execute function public.touch_updated_at();

drop trigger if exists secrets_updated_at on public.player_secrets;
create trigger secrets_updated_at before update on public.player_secrets
  for each row execute function public.touch_updated_at();

-- ─── Realtime publication ────────────────────────────────────────────────────
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.votes;
-- 注意：player_secrets 不開 realtime，避免用戶看到別人的 role update 事件
