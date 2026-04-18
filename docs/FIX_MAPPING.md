# 修復對照表

對應前次報告的漏洞編號，每一項列出「這次產出的哪個檔案解決它」。

## Critical

| 編號 | 漏洞 | 修復檔案 |
|---|---|---|
| C1 | RLS 全開 | `supabase/migrations/20260417000002_rls_policies.sql`（所有表 enable + force RLS，寫入全擋，只留特定 select） |
| C2 | 詞分派走 client + role 可被所有人讀 | `supabase/migrations/20260417000001_initial_schema.sql`（拆出 `player_secrets`）<br>`supabase/migrations/20260417000003_rpc_functions.sql`（`start_game` RPC）<br>`supabase/migrations/20260417000002_rls_policies.sql`（secrets 的 select policy） |
| C3 | 投票重複/冒名 | `supabase/migrations/20260417000001_initial_schema.sql`（`UNIQUE(room_id,round_number,voter_id)` + `no_self_vote` check）<br>`supabase/migrations/20260417000002_rls_policies.sql`（`votes_insert_self` policy）<br>`supabase/migrations/20260417000003_rpc_functions.sql`（`submit_vote` RPC） |
| C4 | client 自稱 host | `src/lib/AuthContext.jsx`（匿名 auth，用 `auth.uid()`）<br>`supabase/migrations/20260417000002_rls_policies.sql`（rooms 寫入全擋）<br>所有 host-only 動作改走 RPC，RPC 內部驗 `host_id = auth.uid()` |

## High

| 編號 | 漏洞 | 修復檔案 |
|---|---|---|
| H1 | Room code 無限迴圈 | `supabase/migrations/20260417000003_rpc_functions.sql` 的 `create_room`：retry 上限 20 次 |
| H2 | Room code 碰撞 race | `supabase/migrations/20260417000001_initial_schema.sql` 的 partial unique index `rooms_active_code_uniq` |
| H3 | beforeunload 不可靠 | `src/hooks/useGameRoom.js`：改用 `pagehide` + `visibilitychange` + server 端 cleanup cron |
| H4 | Host 離線偵測不完整 | `supabase/migrations/20260417000006_cron_jobs.sql`：每分鐘跑 `cleanup_stale_rooms` |
| H5 | 勝負判定重複、race | `supabase/migrations/20260417000003_rpc_functions.sql` 的 `complete_vote`：單一 transaction 做計票 + 淘汰 + 判勝負 |
| H6 | 玩家數 < 4 的 race | `leave_room` RPC 內用 `SELECT count(*)` 在 server 判斷 |
| H7 | spy_count 邏輯含糊 | `start_game` RPC 明確寫 `case when v_player_cnt <= 5 then 1 else 2 end` 並驗 4–8 |
| H8 | username 無驗證 | `supabase/migrations/20260417000001_initial_schema.sql` 的 `username_format` check + client `USERNAME_REGEX` |
| H9 | `handleStartGame` 非 atomic | `start_game` RPC 整個包在 plpgsql 內 = 單一 transaction |
| H10 | roomId 無驗證 | `src/pages/Game.jsx` 的 `getRoomId()` 先驗 UUID 格式 |

## Medium

| 編號 | 漏洞 | 修復檔案 |
|---|---|---|
| M1 | 沒有 reconnect | `src/hooks/useGameRoom.js`：subscribe 成功時 `reload()`，斷線時顯示 reconnecting banner |
| M2 | ref 值過時 | `src/hooks/useGameRoom.js`：`roomRef` 每次 render 更新；host 動作改用 RPC 不依賴 ref |
| M3 | 語言切換導致詞顯示錯 | `assigned_word` 存 `{zh,en}` jsonb；`SpeakingPhase` 用各自 `lang` 顯示 |
| M4 | Timer 不同步 | `rooms.voting_ends_at` server 欄位；`VotingPhase` 根據它倒數 |
| M5 | Math.random 偏誤 | `start_game` 用 Postgres `random()`（server-side） |
| M6 | 無 rate limiting | `supabase/migrations/20260417000007_rate_limits.sql`（sliding window）<br>`supabase/migrations/20260417000008_apply_rate_limits.sql`（每個 RPC 前置 check）<br>`supabase/functions/create-room/`, `join-room/`（可選的 IP-based 第二層） |
| M7 | Error handling 太淺 | `src/api/gameApi.js` 的 `GameError` + error code 對應 |
| M8 | lobby room_code 處理 | N/A（新架構 lobby 不會重開，cancel 後房間就結束） |
| M9 | interval cleanup 不全 | `useGameRoom` 的 useEffect return 全部清 interval |
| M10 | host_last_seen 寫沒讀 | `cleanup_stale_rooms` 讀它 |
| M11 | react-query 沒用 | 保留 dep 但這版沒導入；下一版可用於 room list 之類 |
| M12 | timer closure 舊值 | 改用 server timestamp 無此問題 |
| M13 | 4 位數碼不夠 | 文件 `README.md` 有擴展方案 |

## Low

| 編號 | 漏洞 | 修復檔案 |
|---|---|---|
| L4/L5 | 未用的 deps | `package.json` 精簡版，加註解列出可移除的 |
| L7 | alert/confirm | 保留 alert 在明確錯誤（如 host 離開）；建議改 sonner，未全改 |
| L9 | 部分字串寫死中文 | `Home.jsx` 改用 `t.roomFull / invalidCode` 等 key；需要同步更新 `LangContext` |

## 大公司 checklist 完成度

- [x] Security headers（`vercel.json` CSP/HSTS/X-Frame-Options）
- [x] RLS policies
- [x] Auth（匿名 Supabase auth）
- [x] Input validation（client + DB check constraint 雙層）
- [x] DB migration workflow（`supabase/migrations/`）
- [x] CI（`.github/workflows/ci.yml`）
- [x] PR template + security self-check
- [x] Unit test 骨架（`gameUtils.test.js`）
- [x] E2E test 骨架（Playwright）
- [x] RLS smoke test（SQL）
- [x] Cron cleanup
- [x] Runbook（`README.md`）
- [x] Threat model（`docs/THREAT_MODEL.md`）
- [x] `.env.example`
- [x] Rate limiting（DB 層 `rate_limit_check` + 可選 Edge Function IP 層）
- [x] Sentry / error tracking（`src/lib/monitoring.jsx`，需要填 DSN）
- [x] 業務事件追蹤（建房/加房/開始/投票/結束 breadcrumbs）
- [x] Operational metrics views（`20260417000009_metrics_views.sql`）
- [ ] PostHog / 產品分析（需要帳號；Sentry breadcrumbs 先頂著）
- [ ] Privacy policy / ToS（法律文件，不寫）
- [ ] Load test（需要實際環境跑 k6）
- [ ] Accessibility audit（需要手動）

## 下一步（未動工但重要）

1. **滲透測試**：找一個會 devtools 的人手動跑 `THREAT_MODEL.md` 的 A1-A4 所有攻擊項目。
2. **Host 轉讓**：比 cancel 好的體驗。加一支 `transfer_host` RPC，條件是 `host_last_seen > 30s`。
3. **PostHog 或 GA4**：Sentry breadcrumbs 有業務事件但不是 analytics 平台；要看漏斗/留存需要接一個。
4. **完整移除未用套件**：跑 `pnpm dlx depcheck` 再決定。
5. **i18n 缺字串補齊**：`rateLimited`, `invalidCode`, `invalidUsername`, `unknownError`, `pleaseWait`, `reconnecting`, `startFailed`, `voteFailed`, `loading` 等新 key 要加到 `LangContext`。
6. **Privacy policy + ToS**：即使是匿名遊戲，也收了 localStorage auth session，建議寫一頁簡短的。
