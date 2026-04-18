# 這個 PR 要做什麼

<!-- 一句話描述 -->

## 改了什麼

- [ ] 程式碼邏輯
- [ ] DB schema / RLS policy
- [ ] 依賴升級
- [ ] 文件

## 自檢 checklist

- [ ] 本機 `pnpm lint` 過
- [ ] `pnpm typecheck` 過
- [ ] `pnpm test` 過
- [ ] 改了 RLS → 跑過 `supabase/tests/rls_smoke.sql`
- [ ] 改了 RPC → 攻擊者視角想過一遍（見 `docs/THREAT_MODEL.md`）
- [ ] 改了 UI → 手機 / 桌機 都看過
- [ ] 改了 game logic → 多 tab 測過完整流程

## 安全性

- [ ] 沒有 `rls: {all: true}` 或 `using (true)` 的 policy
- [ ] 沒有在 client 信任 `is_host` 或 `role`
- [ ] RPC 裡有檢查 `auth.uid()` 和 ownership
- [ ] 沒有把 secret 放進 `VITE_*` 環境變數（VITE_* 會 bundle 到 client！）
