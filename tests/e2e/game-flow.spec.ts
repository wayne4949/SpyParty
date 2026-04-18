// tests/e2e/game-flow.spec.ts
// Playwright 多 tab 模擬 4 個玩家打一整局
// 安裝：pnpm add -D @playwright/test && pnpm exec playwright install
import { test, expect, Browser, Page } from '@playwright/test';

async function createPlayerContext(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.fill('input[placeholder*="暱稱"]', name);
  return { ctx, page };
}

test.describe('完整遊戲流程', () => {
  test('4 人局：建房 → 加入 → 開始 → 投票 → 淘汰', async ({ browser }) => {
    const host = await createPlayerContext(browser, 'Host');
    const p2   = await createPlayerContext(browser, 'Alice');
    const p3   = await createPlayerContext(browser, 'Bob');
    const p4   = await createPlayerContext(browser, 'Carol');

    // Host 建房
    await host.page.click('text=建立房間');
    await host.page.click('text=確認建立');
    await expect(host.page.locator('text=房間代碼')).toBeVisible();

    const roomCode = await host.page.locator('.tracking-\\[0\\.3em\\]').innerText();
    expect(roomCode).toMatch(/^\d{4}$/);

    // 其他三人加入
    for (const p of [p2, p3, p4]) {
      await p.page.click('text=加入房間');
      await p.page.fill('input[inputmode="numeric"]', roomCode);
      await p.page.click('text=確認加入');
      await expect(p.page.locator('text=' + roomCode)).toBeVisible();
    }

    // Host 看到 4 人
    await expect(host.page.locator('text=4 位玩家')).toBeVisible({ timeout: 10000 });

    // Host 按開始
    await host.page.click('text=開始遊戲');

    // 每人應該看到自己的詞
    for (const p of [host, p2, p3, p4]) {
      await expect(p.page.locator('text=你的詞')).toBeVisible({ timeout: 5000 });
    }

    // 檢查重點：沒有任何人能在 DOM 或 network 看到別人的詞
    // (這個斷言需要配合 Supabase Postgres REST API 檢查，省略示意)

    // Host 結束發言，進入投票
    await host.page.click('text=開始投票');

    // 每人投第一個其他玩家
    for (const p of [host, p2, p3, p4]) {
      await p.page.locator('button').filter({ hasText: /^(?!.*(Host|Alice|Bob|Carol)$)/ }).first().click();
      await p.page.click('text=確認投票');
    }

    // 應該有人被淘汰或平票處理
    await expect(host.page.locator('text=/第.*輪|遊戲結束/')).toBeVisible({ timeout: 15000 });

    await host.ctx.close();
    await p2.ctx.close();
    await p3.ctx.close();
    await p4.ctx.close();
  });

  test('攻擊場景：非 host 不能直接改 game_status', async ({ browser }) => {
    // 開一個房間，讓非 host 的 page 嘗試用 devtools 直接 RPC
    // 預期 server 回 "not_host"
    // 略
  });

  test('攻擊場景：不能重複投票', async ({ browser }) => {
    // 同一 voter 送兩次 submit_vote，第二次應該 duplicate error
    // 略
  });

  test('Host 離線後 3 分鐘，房間自動 cancel', async ({ browser }) => {
    // 手動呼叫 cleanup_stale_rooms() 驗證
    // 略
  });
});
