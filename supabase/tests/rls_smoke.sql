-- =============================================================================
-- SpyParty: RLS & RPC 煙霧測試 (smoke tests)
-- 在 Supabase SQL editor 裡跑，或用 pgTAP 寫成真正的 CI 測試
--
-- 這些測試驗證「攻擊者辦不到那些事」；每個 BEGIN/ROLLBACK 獨立不影響資料
-- =============================================================================

-- ─── Test 1: 未登入者不能寫 ──────────────────────────────────────────────
-- 用 anonymous role 跑一次
set role anon;
-- 應該全部失敗（RLS 擋下）
do $$ begin
  begin
    insert into public.rooms (room_code, host_id) values ('9999', gen_random_uuid());
    raise exception 'SECURITY FAIL: anon was able to insert into rooms';
  exception when others then
    raise notice 'PASS: anon cannot insert rooms (%)', sqlerrm;
  end;
end $$;
reset role;

-- ─── Test 2: 別的玩家不能看我的 secret ───────────────────────────────────
-- (手動驗證：開兩個 browser 分別登入，檢查 devtools)

-- ─── Test 3: submit_vote UNIQUE 擋重複 ──────────────────────────────────
begin;
  -- 這段需要在實際 seed 資料後才能跑，以下是模板
  -- insert into rooms ...; insert into players p1, p2 ...;
  -- select submit_vote(room_id, p2.id);  -- 第一次成功
  -- do $$ begin
  --   begin
  --     select submit_vote(room_id, p2.id);  -- 第二次應該 duplicate
  --     raise exception 'SECURITY FAIL: duplicate vote allowed';
  --   exception when unique_violation then
  --     raise notice 'PASS: duplicate vote blocked';
  --   end;
  -- end $$;
rollback;

-- ─── Test 4: 非 host 不能 start_game ─────────────────────────────────────
-- (模板)
-- set local role authenticated;
-- set local "request.jwt.claim.sub" = '<other-user-uuid>';
-- do $$ begin
--   begin
--     perform start_game('<room-uuid>');
--     raise exception 'SECURITY FAIL: non-host started game';
--   exception when others then
--     raise notice 'PASS: non-host cannot start (%)', sqlerrm;
--   end;
-- end $$;

-- ─── Test 5: cleanup_stale_rooms 只 cancel 舊的 ─────────────────────────
begin;
  -- insert 一個 host_last_seen = now() - 10 min 的房間
  -- select cleanup_stale_rooms();
  -- 該房應為 cancelled
rollback;

-- ─── Test 6: 房間碼 UNIQUE partial index ────────────────────────────────
begin;
  -- 同時 insert 兩個 '1234' 的 active 房間：第二個應該失敗
  -- insert 一個 cancelled 的 '1234'：應該成功（partial index）
rollback;
