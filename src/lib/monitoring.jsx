// src/lib/monitoring.js
// Sentry 初始化 + error boundary + 自訂 breadcrumbs
//
// 安裝：pnpm add @sentry/react
// 環境變數（.env.local）：
//   VITE_SENTRY_DSN=https://...@oXXX.ingest.sentry.io/XXX
//   VITE_SENTRY_ENV=production|staging|development
//   VITE_APP_VERSION=$(git rev-parse --short HEAD)  (在 build script 注入)
import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
  createRoutesFromChildren, matchRoutes, useLocation, useNavigationType,
} from 'react-router-dom';

const DSN = import.meta.env.VITE_SENTRY_DSN;
const ENV = import.meta.env.VITE_SENTRY_ENV || import.meta.env.MODE;
const VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

let initialized = false;

export function initMonitoring() {
  if (initialized) return;
  initialized = true;

  if (!DSN) {
    console.info('[monitoring] Sentry DSN not set; skipping init');
    return;
  }

  Sentry.init({
    dsn: DSN,
    environment: ENV,
    release: VERSION,

    // 效能追蹤：生產環境 10%，開發/staging 100%
    tracesSampleRate: ENV === 'production' ? 0.1 : 1.0,

    // Session replay：錯誤時 100% 錄製，一般 session 1%
    replaysSessionSampleRate: ENV === 'production' ? 0.01 : 0,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect, useLocation, useNavigationType,
        createRoutesFromChildren, matchRoutes,
      }),
      Sentry.replayIntegration({
        // 遊戲畫面沒敏感資料，但 username 可能是暱稱，保險起見遮罩
        maskAllText: false,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],

    // 濾掉雜訊
    ignoreErrors: [
      // realtime 斷線是正常的，不要噴
      'CHANNEL_ERROR',
      'TIMED_OUT',
      // rate limit 是預期行為
      'rate_limited',
      // 使用者關 tab 時發出的 request 被 cancel
      'AbortError',
      'The user aborted a request',
    ],

    // 把敏感欄位遮掉（以防萬一）
    beforeSend(event) {
      // 移除 URL 裡的 roomId（視為遊戲內部識別，低敏感但無意義）
      if (event.request?.url) {
        event.request.url = event.request.url.replace(
          /roomId=[^&]+/, 'roomId=<redacted>',
        );
      }
      // Supabase token 不該出現在 breadcrumb 裡，以防萬一
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(b => {
          if (b.data?.url?.includes('/auth/')) {
            return { ...b, data: { ...b.data, body: '<redacted>' } };
          }
          return b;
        });
      }
      return event;
    },
  });
}

/**
 * 綁定目前登入的 user id，之後的事件都會帶上。
 * 沒有 email / name，只有 uid，符合最小化原則。
 */
export function identifyUser(userId) {
  if (!initialized) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

/**
 * 記錄遊戲業務事件（會出現在 error 的 breadcrumb trail）
 */
export function trackGameEvent(name, data = {}) {
  if (!initialized) return;
  Sentry.addBreadcrumb({
    category: 'game',
    message: name,
    level: 'info',
    data,
  });
}

/**
 * 手動回報非致命錯誤（e.g. RPC 失敗但有 fallback）
 */
export function captureWarning(message, context = {}) {
  if (!initialized) { console.warn(message, context); return; }
  Sentry.captureMessage(message, {
    level: 'warning',
    extra: context,
  });
}

/**
 * ErrorBoundary：包在 App 外層捕捉 React 渲染錯誤
 */
export const SentryErrorBoundary = Sentry.ErrorBoundary;

export function FallbackError({ error, resetError }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h2 className="text-xl font-bold mb-2">出了點小問題</h2>
      <p className="text-sm text-muted-foreground mb-4">
        我們已經收到錯誤回報，請嘗試重新整理。
      </p>
      {import.meta.env.DEV && (
        <pre className="text-xs text-destructive max-w-md overflow-auto mb-4">
          {String(error)}
        </pre>
      )}
      <button
        onClick={resetError}
        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold"
      >
        重試
      </button>
    </div>
  );
}
