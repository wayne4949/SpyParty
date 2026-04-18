# SpyParty 威脅模型

這是一個**純 client + Supabase BaaS** 的架構，沒有自己的後端。
這裡整理所有「攻擊者能做什麼」和「我們怎麼擋」。

## 信任邊界

- **不可信**：瀏覽器端的所有程式碼、localStorage、URL、DOM、網路請求 payload
- **可信**：Supabase Postgres 函式內部、RLS policy、`auth.uid()` JWT claim

任何「只靠 client 檢查」的防禦都會被繞過。這份架構的原則是：**client 只負責 UI 和呼叫 RPC；所有規則都在 DB 裡**。

## 攻擊者 → 防禦對照

### A1：匿名惡意玩家

| 攻擊 | 防禦 |
|---|---|
| 打開 devtools 直接 `supabase.from('players').update({role:'civilian'})` 把自己從 spy 改平民 | `players_update_self` policy `using (false)` — 禁止所有直寫 |
| 直接 `insert` 一張 `votes` 把 voter_id 填別人的 | `votes_insert_self` policy `with check (voter_id in (自己的 player id))` |
| 重複投票刷票 | `UNIQUE (room_id, round_number, voter_id)` |
| 改 `rooms.winner = 'spies'` 惡意結束遊戲 | `rooms_update_host` policy `using (false)` — client 完全不能寫 rooms |
| 把自己 `is_host=true` 偽裝成 host | players 寫入被擋；host 身份由 `rooms.host_id = auth.uid()` 驗證 |
| 讀別人的 `role` / `assigned_word` | `player_secrets` 的 select policy `using (user_id = auth.uid())` |
| 讀詞庫把所有詞背下來 | `words_no_read` policy `using (false)` — anon/authenticated 都讀不到 |
| 自己生個 JWT 偽造 `auth.uid()` | JWT 由 Supabase 簽，用 service secret；anon key 簽不了 JWT |
| 偷別人的 JWT | token 在 localStorage；XSS 才偷得到，CSP 擋 inline script（`vercel.json`） |
| 猜別人的 player_id 去 `insert vote` | 還是過不了 `voter_id in (select id from players where user_id = auth.uid())` |

### A2：想讓別人輸的嘴砲玩家

| 攻擊 | 防禦 |
|---|---|
| 快速建一堆房擋別人建房 | 同一 user 重複 `create_room` 時會刪舊 player；另外可加 rate limit（未實作，見 backlog） |
| 建房後不開始卡位 | 房間在 lobby 狀態，沒 activity；3 分鐘 host_last_seen 過期 → cleanup 清掉 |
| 大量 join 別人的房間瞬間塞滿 | 每房上限 8 人（server 檢查） |
| 丟超長 username 破 UI | DB check constraint `length between 1 and 12` |
| SQL injection via username | RPC 用參數化查詢（plpgsql 內部），且 check constraint 限制字元集 |
| XSS via username | React 預設 escape + regex 限制字元 `[\w\u4e00-\u9fff \-]` |

### A3：DoS / 資源耗盡

| 攻擊 | 防禦 |
|---|---|
| 瘋狂呼叫 RPC | DB 層 `rate_limit_check`（每 RPC 開頭）+ 可選的 Edge Function IP 層 |
| 瘋狂建房撐爆 DB | per-uid 5/min + 可選 per-ip 10/min + partial index 上限 10000 active |
| 瘋狂 join 擋別人 | per-uid 20/min + per-ip 30/min |
| 瘋狂投票刷票 | per-uid 3/10s + UNIQUE(room_id, round_number, voter_id) DB 約束 |
| 瘋狂訂閱 realtime | Supabase 本身有 connection limit；監控 Dashboard 指標 |
| 多開匿名 session 繞過 per-uid limit | Edge Function 層的 IP-based limit（見 `supabase/functions/`）|
| 長連線不斷開 | Supabase 有閒置 timeout |

### A4：社交工程

| 攻擊 | 防禦 |
|---|---|
| 釣魚假網站讓 user 進入 | 使用者無法分辨；建議用自訂網域 + HSTS preload |
| 誘導複製 URL 加入房間但實為 phishing | `?roomId=` 進來會先驗 UUID 格式再 fetch，fetch 失敗就退回首頁 |

## 剩餘風險

1. **Rate limiting 缺失**：惡意腳本可以建無限房間，雖然 cleanup 會清，但短期會塞 DB。建議 Launch 後一個月內加。
2. **無 CAPTCHA**：匿名 auth 不阻擋 bot。若遇到濫用，可加 Cloudflare Turnstile 在 `create_room` 前。
3. **單一房間內串通**：不是技術問題，遊戲本身就是社交遊戲，無法防串通。
4. **Replay attack**：理論上截獲他人 JWT + refresh token 就能冒用身份。只要 HTTPS 沒破、XSS 沒中就安全。
5. **Supabase 本身 outage**：整個 app 下線，無 fallback。可考慮多 region 或備援，但小遊戲不划算。
6. **game_over 後 reveal 對所有玩家開放**：設計如此，不是 bug；但如果有人中途 kill tab 又回來，還是可以看到。OK 的設計決策。

## 安全上線 checklist

- [ ] RLS 全 `enable + force` 確認
- [ ] anon key 確認是 anon 不是 service key（JWT payload 的 role claim）
- [ ] Supabase Dashboard 關閉「Allow new sign ups」（我們用 `signInAnonymously`，不需要 sign up endpoint）
- [ ] CSP header 測試過、report-uri 收集違規
- [ ] Sentry / 錯誤監控接上
- [ ] pg_cron 確認跑得起來（`select * from cron.job_run_details order by start_time desc limit 5;`）
- [ ] 滲透測試：找一個會 devtools 的人花 30 分鐘試攻擊以上所有項
