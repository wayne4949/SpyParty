-- =============================================================================
-- SpyParty: Reveal game over details
-- 遊戲結束時，所有玩家都可以看到所有人的身份和詞；
-- 但只在 game_status = 'game_over' 時才開放。
-- =============================================================================

create or replace function public.get_game_reveal(p_room_id uuid)
returns table (
  player_id     uuid,
  username      text,
  role          text,
  assigned_word jsonb,
  is_alive      boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid  uuid := auth.uid();
  v_room record;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.id is null then raise exception 'room_not_found'; end if;
  if v_room.game_status <> 'game_over' then
    raise exception 'not_game_over';
  end if;
  -- 必須是房間成員才能看
  if not exists (
    select 1 from public.players where room_id = p_room_id and user_id = v_uid
  ) then
    raise exception 'not_in_room';
  end if;

  return query
  select p.id, p.username, ps.role, ps.assigned_word, p.is_alive
    from public.players p
    join public.player_secrets ps on ps.player_id = p.id
   where p.room_id = p_room_id
   order by p.joined_at;
end;
$$;

grant execute on function public.get_game_reveal(uuid) to authenticated, anon;
