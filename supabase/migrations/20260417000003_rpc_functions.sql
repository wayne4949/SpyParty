-- =============================================================================
-- SpyParty: Game Logic RPCs (security definer)
-- 修復：C2, C4, H1, H5, H9, H10, M4
--
-- 所有函式都是 security definer，可以繞過 RLS 做該做的事，
-- 但每個 function 內部都會檢查「呼叫者是誰 / 是否有權限」。
-- =============================================================================

-- ─── create_room ─────────────────────────────────────────────────────────────
-- 建立房間 + 建立 host 的 player row，atomic。
-- 修復 H1/H2：retry 限制 + UNIQUE index 保證不碰撞
create or replace function public.create_room(p_username text)
returns table (room_id uuid, player_id uuid, room_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_code   text;
  v_room   uuid;
  v_player uuid;
  v_tries  int := 0;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_username is null or length(btrim(p_username)) = 0 then
    raise exception 'username required';
  end if;

  -- 如果同一 user 已經在某個 active 房間，先把舊的 player row 刪掉
  -- （避免殭屍 player 卡住）
  delete from public.players
   where user_id = v_uid
     and room_id in (
       select id from public.rooms
        where game_status not in ('cancelled','game_over')
     );

  -- 找一個沒被使用的 4 位數 code，最多 retry 20 次
  loop
    v_tries := v_tries + 1;
    v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
    begin
      insert into public.rooms (room_code, host_id, game_status, current_round)
      values (v_code, v_uid, 'lobby', 1)
      returning id into v_room;
      exit;  -- 成功就跳出
    exception
      when unique_violation then
        if v_tries >= 20 then
          raise exception 'unable to allocate room code after % attempts', v_tries;
        end if;
        -- continue loop
    end;
  end loop;

  insert into public.players (room_id, user_id, username, is_host, is_alive)
  values (v_room, v_uid, btrim(p_username), true, true)
  returning id into v_player;

  insert into public.player_secrets (player_id, room_id, user_id, role)
  values (v_player, v_room, v_uid, 'unassigned');

  return query select v_room, v_player, v_code;
end;
$$;

-- ─── join_room ───────────────────────────────────────────────────────────────
create or replace function public.join_room(p_room_code text, p_username text)
returns table (room_id uuid, player_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_room     record;
  v_existing uuid;
  v_player   uuid;
  v_count    int;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_username is null or length(btrim(p_username)) = 0 then
    raise exception 'username required';
  end if;

  -- 找 active 的同 code 房間（透過 UNIQUE partial index 保證最多一個）
  select * into v_room
    from public.rooms
   where room_code = p_room_code
     and game_status not in ('cancelled','game_over')
   limit 1;

  if v_room.id is null then
    raise exception 'room_not_found';
  end if;

  if v_room.game_status <> 'lobby' then
    raise exception 'game_already_started';
  end if;

  -- 已在房間，直接回傳既有 player_id（修復重連情境）
  select id into v_existing
    from public.players
   where room_id = v_room.id and user_id = v_uid
   limit 1;

  if v_existing is not null then
    return query select v_room.id, v_existing;
    return;
  end if;

  -- 檢查人數上限
  select count(*) into v_count from public.players where room_id = v_room.id;
  if v_count >= 8 then
    raise exception 'room_full';
  end if;

  insert into public.players (room_id, user_id, username, is_host, is_alive)
  values (v_room.id, v_uid, btrim(p_username), false, true)
  returning id into v_player;

  insert into public.player_secrets (player_id, room_id, user_id, role)
  values (v_player, v_room.id, v_uid, 'unassigned');

  return query select v_room.id, v_player;
end;
$$;

-- ─── leave_room ──────────────────────────────────────────────────────────────
-- 玩家主動離開。如果是 host 且遊戲進行中，則整房 cancel。
create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_room    record;
  v_is_host boolean;
begin
  if v_uid is null then
    raise exception 'unauthenticated';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if v_room.id is null then
    return;
  end if;

  v_is_host := (v_room.host_id = v_uid);

  delete from public.players
   where room_id = p_room_id and user_id = v_uid;

  -- 若 host 離開且遊戲還在進行，就 cancel
  if v_is_host and v_room.game_status not in ('cancelled','game_over') then
    update public.rooms
       set game_status = 'cancelled'
     where id = p_room_id;
  end if;

  -- 若房間人數 < 4 且遊戲進行中，也 cancel
  if not v_is_host and v_room.game_status in ('speaking','voting','assigning') then
    if (select count(*) from public.players where room_id = p_room_id) < 4 then
      update public.rooms set game_status = 'cancelled' where id = p_room_id;
    end if;
  end if;
end;
$$;

-- ─── host_heartbeat ──────────────────────────────────────────────────────────
create or replace function public.host_heartbeat(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  update public.rooms
     set host_last_seen = now()
   where id = p_room_id
     and host_id = v_uid;
end;
$$;

-- ─── start_game ──────────────────────────────────────────────────────────────
-- 修復 C2, C4, H9：詞的分派完全在 server，atomic transaction
create or replace function public.start_game(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_room       record;
  v_player_cnt int;
  v_spy_cnt    int;
  v_word       record;
  v_flip       boolean;
  v_civ_word   jsonb;
  v_spy_word   jsonb;
  v_player_ids uuid[];
  v_spy_ids    uuid[];
begin
  -- 取得並鎖定 room row，避免多人同時按 start
  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.id is null then
    raise exception 'room_not_found';
  end if;
  if v_room.host_id <> v_uid then
    raise exception 'not_host';
  end if;
  if v_room.game_status <> 'lobby' then
    raise exception 'already_started';
  end if;

  select count(*) into v_player_cnt from public.players where room_id = p_room_id;
  if v_player_cnt < 4 or v_player_cnt > 8 then
    raise exception 'invalid_player_count: %', v_player_cnt;
  end if;

  -- 決定臥底人數
  v_spy_cnt := case
    when v_player_cnt <= 5 then 1
    else 2
  end;

  -- 選詞：避開已玩過的
  select id, word_a, word_b into v_word
    from public.words_library
   where active = true
     and id <> all(coalesce(v_room.played_word_ids, '{}'::int[]))
   order by random()
   limit 1;

  if v_word.id is null then
    -- 詞庫用完，重置
    select id, word_a, word_b into v_word
      from public.words_library where active = true
     order by random() limit 1;
    update public.rooms set played_word_ids = '{}' where id = p_room_id;
    v_room.played_word_ids := '{}';
  end if;

  v_flip := random() < 0.5;
  v_civ_word := case when v_flip then v_word.word_a else v_word.word_b end;
  v_spy_word := case when v_flip then v_word.word_b else v_word.word_a end;

  -- 隨機選出臥底（在 SQL 裡 shuffle）
  select array_agg(id order by random())
    into v_player_ids
    from public.players where room_id = p_room_id;

  v_spy_ids := v_player_ids[1:v_spy_cnt];

  -- 寫入每個玩家的 secret（atomic）
  update public.player_secrets ps
     set role          = case when ps.player_id = any(v_spy_ids) then 'spy' else 'civilian' end,
         assigned_word = case when ps.player_id = any(v_spy_ids) then v_spy_word else v_civ_word end
   where ps.room_id = p_room_id;

  update public.players
     set is_alive = true
   where room_id = p_room_id;

  -- 清掉前一局的投票（防萬一）
  delete from public.votes where room_id = p_room_id;

  update public.rooms
     set game_status     = 'speaking',
         current_round   = 1,
         winner          = null,
         played_word_ids = array_append(v_room.played_word_ids, v_word.id),
         voting_ends_at  = null
   where id = p_room_id;
end;
$$;

-- ─── go_to_voting ────────────────────────────────────────────────────────────
-- 修復 M4：server 設定 voting_ends_at，client 依此倒數
create or replace function public.go_to_voting(p_room_id uuid, p_seconds int default 60)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_room   record;
  v_ends   timestamptz;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.host_id <> v_uid then raise exception 'not_host'; end if;
  if v_room.game_status <> 'speaking' then raise exception 'invalid_phase'; end if;

  v_ends := now() + (p_seconds || ' seconds')::interval;

  update public.rooms
     set game_status    = 'voting',
         voting_ends_at = v_ends
   where id = p_room_id;

  return v_ends;
end;
$$;

-- ─── submit_vote ─────────────────────────────────────────────────────────────
-- 修復 C3：DB UNIQUE 自動擋重複，這裡做 friendly error
create or replace function public.submit_vote(
  p_room_id uuid,
  p_target_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_room     record;
  v_player   record;
  v_target   record;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.game_status <> 'voting' then raise exception 'not_voting_phase'; end if;

  select * into v_player
    from public.players
   where room_id = p_room_id and user_id = v_uid;

  if v_player.id is null then raise exception 'not_in_room'; end if;
  if not v_player.is_alive then raise exception 'eliminated'; end if;

  select * into v_target
    from public.players
   where id = p_target_id and room_id = p_room_id;

  if v_target.id is null or not v_target.is_alive then
    raise exception 'invalid_target';
  end if;
  if v_target.id = v_player.id then
    raise exception 'cannot_vote_self';
  end if;

  insert into public.votes (room_id, round_number, voter_id, target_id)
  values (p_room_id, v_room.current_round, v_player.id, p_target_id);
end;
$$;

-- ─── complete_vote ───────────────────────────────────────────────────────────
-- 修復 H5：勝負判定只在一個地方，完整 transaction
create or replace function public.complete_vote(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_room          record;
  v_tally         record;
  v_max_votes     int;
  v_top_count     int;
  v_eliminated    uuid;
  v_alive_spies   int;
  v_alive_civs    int;
  v_result        jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id for update;

  if v_room.host_id <> v_uid then raise exception 'not_host'; end if;
  if v_room.game_status <> 'voting' then raise exception 'not_voting_phase'; end if;

  -- 計票
  select target_id, count(*)::int as cnt into v_tally
    from public.votes
   where room_id = p_room_id
     and round_number = v_room.current_round
   group by target_id
   order by cnt desc
   limit 1;

  if v_tally.target_id is null then
    -- 沒人投票
    v_result := jsonb_build_object('outcome','no_votes');
  else
    v_max_votes := v_tally.cnt;

    select count(*)::int into v_top_count
      from public.votes
     where room_id = p_room_id
       and round_number = v_room.current_round
     group by target_id
    having count(*) = v_max_votes;

    if v_top_count > 1 then
      v_result := jsonb_build_object('outcome','tie');
    else
      v_eliminated := v_tally.target_id;
      update public.players set is_alive = false where id = v_eliminated;
      v_result := jsonb_build_object('outcome','eliminated', 'player_id', v_eliminated);
    end if;
  end if;

  -- 清掉這一輪的票
  delete from public.votes
   where room_id = p_room_id and round_number = v_room.current_round;

  -- 判勝負
  select
    count(*) filter (where ps.role = 'spy'),
    count(*) filter (where ps.role = 'civilian')
    into v_alive_spies, v_alive_civs
    from public.players p
    join public.player_secrets ps on ps.player_id = p.id
   where p.room_id = p_room_id and p.is_alive = true;

  if v_alive_spies = 0 then
    update public.rooms
       set game_status = 'game_over', winner = 'civilians', voting_ends_at = null
     where id = p_room_id;
    v_result := v_result || jsonb_build_object('winner','civilians');
  elsif v_alive_spies >= v_alive_civs then
    update public.rooms
       set game_status = 'game_over', winner = 'spies', voting_ends_at = null
     where id = p_room_id;
    v_result := v_result || jsonb_build_object('winner','spies');
  else
    update public.rooms
       set game_status   = 'speaking',
           current_round = current_round + 1,
           voting_ends_at = null
     where id = p_room_id;
  end if;

  return v_result;
end;
$$;

-- ─── cleanup_stale_rooms ────────────────────────────────────────────────────
-- 修復 H4：host 離線超過 3 分鐘的房間自動 cancel
-- 建議：用 Supabase Cron Extension 每分鐘跑
--       select cron.schedule('cleanup-rooms','* * * * *','select public.cleanup_stale_rooms()');
create or replace function public.cleanup_stale_rooms()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cnt int;
begin
  with updated as (
    update public.rooms
       set game_status = 'cancelled'
     where game_status not in ('cancelled','game_over')
       and host_last_seen < now() - interval '3 minutes'
     returning id
  )
  select count(*) into v_cnt from updated;
  return v_cnt;
end;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- 授權匿名 user 可以呼叫這些 RPC
grant execute on function public.create_room(text)           to authenticated, anon;
grant execute on function public.join_room(text, text)       to authenticated, anon;
grant execute on function public.leave_room(uuid)            to authenticated, anon;
grant execute on function public.host_heartbeat(uuid)        to authenticated, anon;
grant execute on function public.start_game(uuid)            to authenticated, anon;
grant execute on function public.go_to_voting(uuid, int)     to authenticated, anon;
grant execute on function public.submit_vote(uuid, uuid)     to authenticated, anon;
grant execute on function public.complete_vote(uuid)         to authenticated, anon;
grant execute on function public.is_room_member(uuid)        to authenticated, anon;

-- cleanup_stale_rooms 只給 service_role 跑（cron job）
revoke execute on function public.cleanup_stale_rooms() from public;
grant execute on function public.cleanup_stale_rooms() to service_role;
