-- =============================================================================
-- SpyParty: Apply rate limits to RPCs
-- 依賴：20260417000007_rate_limits.sql
--
-- 限額設計原則：
--   - 正常玩家一場遊戲的操作頻率 × 安全裕量
--   - 投票類 (submit_vote) 寬鬆，因為誤按可能連打
--   - 建房 / 加房嚴格，這是濫用的主要向量
-- =============================================================================

-- ─── create_room: 每 uid 每分鐘最多 5 房 ────────────────────────────────────
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
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;

  -- 先過 rate limit
  perform public.rate_limit_check('create_room:' || v_uid::text, 5, 60);

  if p_username is null or length(btrim(p_username)) = 0 then
    raise exception 'username required';
  end if;

  delete from public.players
   where user_id = v_uid
     and room_id in (
       select id from public.rooms where game_status not in ('cancelled','game_over')
     );

  loop
    v_tries := v_tries + 1;
    v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
    begin
      insert into public.rooms (room_code, host_id, game_status, current_round)
      values (v_code, v_uid, 'lobby', 1)
      returning id into v_room;
      exit;
    exception
      when unique_violation then
        if v_tries >= 20 then
          raise exception 'unable to allocate room code after % attempts', v_tries;
        end if;
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

-- ─── join_room: 每 uid 每分鐘最多 20 次嘗試 ────────────────────────────────
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
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;

  perform public.rate_limit_check('join_room:' || v_uid::text, 20, 60);

  if p_username is null or length(btrim(p_username)) = 0 then
    raise exception 'username required';
  end if;

  select * into v_room
    from public.rooms
   where room_code = p_room_code
     and game_status not in ('cancelled','game_over')
   limit 1;

  if v_room.id is null then raise exception 'room_not_found'; end if;
  if v_room.game_status <> 'lobby' then raise exception 'game_already_started'; end if;

  select id into v_existing
    from public.players
   where room_id = v_room.id and user_id = v_uid
   limit 1;

  if v_existing is not null then
    return query select v_room.id, v_existing;
    return;
  end if;

  select count(*) into v_count from public.players where room_id = v_room.id;
  if v_count >= 8 then raise exception 'room_full'; end if;

  insert into public.players (room_id, user_id, username, is_host, is_alive)
  values (v_room.id, v_uid, btrim(p_username), false, true)
  returning id into v_player;

  insert into public.player_secrets (player_id, room_id, user_id, role)
  values (v_player, v_room.id, v_uid, 'unassigned');

  return query select v_room.id, v_player;
end;
$$;

-- ─── submit_vote: 每 uid 每 10 秒最多 3 次 ─────────────────────────────────
-- （連擊點擊允許，但不能刷爆）
create or replace function public.submit_vote(
  p_room_id uuid,
  p_target_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_room   record;
  v_player record;
  v_target record;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;

  perform public.rate_limit_check('submit_vote:' || v_uid::text, 3, 10);

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
  if v_target.id is null or not v_target.is_alive then raise exception 'invalid_target'; end if;
  if v_target.id = v_player.id then raise exception 'cannot_vote_self'; end if;

  insert into public.votes (room_id, round_number, voter_id, target_id)
  values (p_room_id, v_room.current_round, v_player.id, p_target_id);
end;
$$;

-- ─── start_game: 每 host 每 5 秒 1 次（防誤連按） ──────────────────────────
-- 用 room_id 當 key，多個 host 的情況不會互相影響
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
  if v_uid is null then raise exception 'unauthenticated'; end if;

  perform public.rate_limit_check('start_game:' || p_room_id::text, 1, 5);

  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.id is null then raise exception 'room_not_found'; end if;
  if v_room.host_id <> v_uid then raise exception 'not_host'; end if;
  if v_room.game_status <> 'lobby' and v_room.game_status <> 'game_over' then
    raise exception 'already_started';
  end if;

  select count(*) into v_player_cnt from public.players where room_id = p_room_id;
  if v_player_cnt < 4 or v_player_cnt > 8 then
    raise exception 'invalid_player_count: %', v_player_cnt;
  end if;

  v_spy_cnt := case when v_player_cnt <= 5 then 1 else 2 end;

  select id, word_a, word_b into v_word
    from public.words_library
   where active = true
     and id <> all(coalesce(v_room.played_word_ids, '{}'::int[]))
   order by random()
   limit 1;

  if v_word.id is null then
    select id, word_a, word_b into v_word
      from public.words_library where active = true order by random() limit 1;
    update public.rooms set played_word_ids = '{}' where id = p_room_id;
    v_room.played_word_ids := '{}';
  end if;

  v_flip := random() < 0.5;
  v_civ_word := case when v_flip then v_word.word_a else v_word.word_b end;
  v_spy_word := case when v_flip then v_word.word_b else v_word.word_a end;

  select array_agg(id order by random())
    into v_player_ids
    from public.players where room_id = p_room_id;

  v_spy_ids := v_player_ids[1:v_spy_cnt];

  update public.player_secrets ps
     set role          = case when ps.player_id = any(v_spy_ids) then 'spy' else 'civilian' end,
         assigned_word = case when ps.player_id = any(v_spy_ids) then v_spy_word else v_civ_word end
   where ps.room_id = p_room_id;

  update public.players set is_alive = true where room_id = p_room_id;
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

-- 注意：host_heartbeat 故意不加 rate limit（它本來就是每 30 秒跑一次，
-- client 誤設定成 100ms 也不會造成真正傷害，還能靠 DB 效能自然頂住）
