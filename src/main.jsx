import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// 網站更新後，開著的舊頁面會載不到舊版的程式檔（404）。
// 偵測到時自動重新載入一次，取得新版（結果已存在瀏覽器，不會遺失）。
window.addEventListener('vite:preloadError', (event) => {
  let last = 0;
  try { last = Number(sessionStorage.getItem('es.reloadedAt') || 0); } catch { /* 忽略 */ }
  if (Date.now() - last < 30000) return; // 30 秒內已重載過，避免無限重載
  event.preventDefault();
  try { sessionStorage.setItem('es.reloadedAt', String(Date.now())); } catch { /* 忽略 */ }
  const note = document.createElement('div');
  note.className = 'toast';
  note.textContent = '網站已更新，正在重新載入…';
  document.body.appendChild(note);
  setTimeout(() => window.location.reload(), 800);
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
