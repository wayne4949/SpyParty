-- =============================================================================
-- SpyParty: Row Level Security Policies
-- 修復對應漏洞：C1（RLS 全開）、C2（詞洩漏）、C3（投票冒名）、C4（假 host）
--
-- 前提：client 必須先呼叫 supabase.auth.signInAnonymously()，
--       所有 auth.uid() 才會是真實 UUID。
-- =============================================================================

-- ─── 開啟 RLS ────────────────────────────────────────────────────────────────
alter table public.rooms           enable row level security;
alter table public.players         enable row level security;
alter table public.player_secrets  enable row level security;
alter table public.votes           enable row level security;
alter table public.words_library   enable row level security;

-- 強制 RLS，即使是 table owner 也要過 policy（除了 security definer function 內部）
alter table public.rooms           force row level security;
alter table public.players         force row level security;
alter table public.player_secrets  force row level security;
alter table public.votes           force row level security;
alter table public.words_library   force row level security;

-- 清掉舊 policy（方便重複執行 migration）
drop policy if exists rooms_select             on public.rooms;
drop policy if exists rooms_insert             on public.rooms;
drop policy if exists rooms_update_host        on public.rooms;
drop policy if exists rooms_delete_none        on public.rooms;
drop policy if exists players_select           on public.players;
drop policy if exists players_insert_self      on public.players;
drop policy if exists players_update_self      on public.players;
drop policy if exists players_delete_self      on public.players;
drop policy if exists secrets_select_own       on public.player_secrets;
drop policy if exists secrets_no_client_write  on public.player_secrets;
drop policy if exists votes_select             on public.votes;
drop policy if exists votes_insert_self        on public.votes;
drop policy if exists votes_no_update          on public.votes;
drop policy if exists votes_delete_none        on public.votes;
drop policy if exists words_no_read            on public.words_library;

-- ─── Helper：檢查 uid 是否為該房間的玩家 ────────────────────────────────────
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.players
     where room_id = p_room_id
       and user_id = auth.uid()
  );
$$;

-- ─── ROOMS ───────────────────────────────────────────────────────────────────

-- 讀：任何已登入 user 可讀（房間資訊本來就需要分享 code 加入，不敏感）
create policy rooms_select on public.rooms
  for select
  using (auth.uid() is not null);

-- 寫：禁止 client 直接 insert/update/delete rooms。
-- 所有房間變更都必須走 RPC（security definer functions）。
-- 這是 C4 的根本修復：client 沒辦法直接改 game_status / winner / host_id。
create policy rooms_insert on public.rooms
  for insert
  with check (false);

create policy rooms_update_host on public.rooms
  for update
  using (false)
  with check (false);

create policy rooms_delete_none on public.rooms
  for delete
  using (false);

-- ─── PLAYERS ─────────────────────────────────────────────────────────────────

-- 讀：同房玩家互相看得到（看名字、is_alive、is_host）
create policy players_select on public.players
  for select
  using (public.is_room_member(room_id));

-- 寫：player 的 insert/update/delete 都走 RPC。
-- 直接寫會被擋，防止偽造 is_host、改別人 username 等。
create policy players_insert_self on public.players
  for insert
  with check (false);

create policy players_update_self on public.players
  for update
  using (false)
  with check (false);

create policy players_delete_self on public.players
  for delete
  using (false);

-- ─── PLAYER_SECRETS ──────────────────────────────────────────────────────────
-- 修復 C2：只有自己讀得到自己的 role 和詞

create policy secrets_select_own on public.player_secrets
  for select
  using (user_id = auth.uid());

-- client 完全不能寫 secrets，只有 RPC 的 security definer 可以
create policy secrets_no_client_write on public.player_secrets
  for all
  using (false)
  with check (false);

-- ─── VOTES ───────────────────────────────────────────────────────────────────

-- 讀：同房玩家看得到票
create policy votes_select on public.votes
  for select
  using (public.is_room_member(room_id));

-- 修復 C3：投票只能以自己的 player row 身份投
create policy votes_insert_self on public.votes
  for insert
  with check (
    voter_id in (
      select id from public.players
       where user_id = auth.uid()
         and room_id = votes.room_id
         and is_alive = true
    )
  );

-- 投完不能改
create policy votes_no_update on public.votes
  for update using (false);

-- 刪除只能透過 RPC
create policy votes_delete_none on public.votes
  for delete using (false);

-- ─── WORDS_LIBRARY ───────────────────────────────────────────────────────────
-- 完全不讓 client 看詞庫（防止作弊者預先把詞對照整理出來）
create policy words_no_read on public.words_library
  for all using (false) with check (false);
