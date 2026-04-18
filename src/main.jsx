// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initMonitoring, SentryErrorBoundary, FallbackError } from '@/lib/monitoring';
import App from './App';
import './index.css';

// 啟動最一開始就初始化監控，這樣連 bootstrap 錯誤也能被捕捉
initMonitoring();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SentryErrorBoundary fallback={FallbackError} showDialog={false}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SentryErrorBoundary>
  </React.StrictMode>,
);
