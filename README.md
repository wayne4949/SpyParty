# SpyParty - Deployment & Runbook

即時多人的「誰是臥底」遊戲，技術棧：React + Vite + Supabase (Postgres + Realtime + Auth)。

## 架構

```
┌──────────┐   REST/Realtime WS    ┌───────────────────────┐
│  Browser │◄─────────────────────►│   Supabase            │
│  (React) │                       │                       │
│          │   RPC (auth.uid)      │ ┌───────────────────┐ │
│          │──────────────────────►│ │ Postgres + RLS    │ │
│          │                       │ │   rooms           │ │
│          │                       │ │   players         │ │
│          │                       │ │   player_secrets  │◄── 只有本人看得到
│          │                       │ │   votes           │ │
│          │                       │ │   words_library   │◄── 完全不給 client
│          │                       │ └───────────────────┘ │
│          │                       │ pg_cron: 每分鐘清殭屍 │
└──────────┘                       └───────────────────────┘
```

**三條關鍵信任邊界**：
1. **匿名 auth** — 所有 client 都有 `auth.uid()`，RLS 綁的是這個，不是 localStorage。
2. **RLS + 直寫禁令** — rooms / players / votes 的寫入都被 policy 擋，只能走 RPC。
3. **player_secrets 隔離** — 角色和詞只有本人讀得到，連 host 都看不到別人的。

## 本機開發

```bash
pnpm install
cp .env.example .env.local            # 填 Supabase URL 與 anon key
pnpm dev
```

## 資料庫 migration

第一次部署或修改 schema 時，按順序跑：

```bash
supabase db push --linked
# 或手動依序在 SQL editor 執行 supabase/migrations/*.sql
```

Migration 順序（檔名排序即執行順序）：
1. `20260417000001_initial_schema.sql` — tables + constraints
2. `20260417000002_rls_policies.sql` — RLS policies
3. `20260417000003_rpc_functions.sql` — 遊戲邏輯 RPC
4. `20260417000004_seed_words.sql` — 詞庫
5. `20260417000005_reveal_rpc.sql` — game over reveal
6. `20260417000006_cron_jobs.sql` — 排程（需先在 Dashboard 啟用 pg_cron）

## 部署

前端 → Vercel（`vercel.json` 已含 security headers 和 SPA rewrite）。
後端 → Supabase（免額外設定，Realtime 預設開啟）。

**環境變數**（Vercel & GitHub Secrets 都要設）：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Runbook

### 遇到「玩家卡在某階段、所有人動不了」

1. 查 `rooms.game_status` 和 `rooms.host_last_seen`。
2. 若 host 已離線（`host_last_seen > 3 min`）但房間沒被 cancel → 手動跑 `select cleanup_stale_rooms();` 或檢查 pg_cron 是否停了。
3. 若所有人 client 顯示 voting 但 server 是 speaking → client 與 server 不同步，建議手動 refresh，或檢查 realtime 是否有 publication lag。

### 遇到「報告顯示有人作弊 / 看到別人的詞」

這是**安全事件**，要馬上處理：

1. 檢查 RLS 是否被意外停用：`select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('rooms','players','player_secrets','votes');`
   每個都要 `t, t`。
2. 檢查是不是有人從 Supabase Studio 用 service key 跑了奇怪的查詢 → 查 `pg_stat_statements`。
3. 確認 anon key 沒外洩為 service key（`.env` 的 `VITE_SUPABASE_ANON_KEY` 必須以 `eyJ...anon` 開頭，而不是 service role）。
4. 如果 policy 邏輯有 bug，**回滾到上個 migration**：`supabase db reset --linked`，再重跑到問題前的 migration。

### 遇到「建房時說 room code 耗盡」

正常情況 4 位數碼配合 `UNIQUE WHERE game_status NOT IN ('cancelled','game_over')` 的 partial index，同時最多 10000 房。超過了就：
1. 短期：跑 `select public.purge_old_rooms();` 清舊房。
2. 中期：改成 5 位數 code（migration 修 `room_code_format` check）。
3. 長期：改成字母數字 mix，熵到 36^4 = 1.6M。

### 效能監控指標

- **Supabase Dashboard**: CPU, DB size, active connections, realtime concurrency
- **Vercel Analytics**: LCP, FCP, CLS
- **商業 metrics**（建議用 PostHog 埋）：
  - 建房成功率（create_room 成功 / 嘗試）
  - 加入成功率（join_room 成功 / 嘗試）
  - 遊戲完成率（game_over / start_game 呼叫數）
  - 平均房間人數、平均回合數
  - host 掉線率

### SLO 建議（初期）

| 指標 | 目標 |
|---|---|
| API availability | 99.5% |
| 建房 p95 延遲 | < 800 ms |
| 投票 p95 延遲 | < 500 ms |
| Realtime event 延遲 | < 2 s |

## 已知限制

- 只支援 4–8 人；超過 8 人的邏輯沒設計。
- 匿名 session 依賴 localStorage（Supabase 自己管），清 localStorage = 失去身份。
- 沒有帳號系統；無法跨裝置繼續遊戲。
- 沒有好友/邀請系統；分享 4 位數 code 就靠通訊軟體。

## 從舊版本遷移

舊版本的資料結構差異：
- `rooms` 有 `civilian_word`, `spy_word` → 新版移除，改存 `player_secrets.assigned_word`
- `players` 有 `role`, `assigned_word` → 新版搬到 `player_secrets`
- `guest_session_id` (localStorage) → `auth.uid()` (JWT)

舊房間無法繼續，部署前需要清空資料庫或打 `game_status='cancelled'` 全部強制結束。
