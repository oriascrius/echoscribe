import { useEffect, useState } from 'react';
import { DEFAULT_MODEL } from '../lib/gemini.js';

export default function Settings({ open, apiKey, model, onSave, onClose }) {
  const [key, setKey] = useState(apiKey);
  const [m, setM] = useState(model);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) { setKey(apiKey); setM(model); setShow(false); }
  }, [open, apiKey, model]);

  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title">設定</h2>

        <label className="label" htmlFor="api-key">Gemini API 金鑰</label>
        <div className="row">
          <input
            id="api-key"
            className="input"
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value.trim())}
            placeholder="AIza... 或 AQ. 開頭的金鑰"
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn ghost small" onClick={() => setShow(!show)}>{show ? '隱藏' : '顯示'}</button>
        </div>
        <p className="muted small">
          還沒有金鑰？到 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a> 免費申請。
          金鑰只存在這台電腦的瀏覽器裡，轉錄時直接送給 Google，不會經過其他伺服器。
        </p>

        <label className="label" htmlFor="model">模型</label>
        <input id="model" className="input" list="models" value={m} onChange={(e) => setM(e.target.value.trim())} />
        <datalist id="models">
          <option value="gemini-flash-latest">快速、便宜（建議）</option>
          <option value="gemini-pro-latest">較準確、較慢</option>
        </datalist>
        <p className="muted small">一般使用維持 <code>{DEFAULT_MODEL}</code> 即可。</p>

        <div className="row end gap">
          {apiKey && (
            <button className="btn text danger" onClick={() => onSave('', m || DEFAULT_MODEL)}>清除金鑰</button>
          )}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={() => onSave(key, m || DEFAULT_MODEL)} disabled={!key}>儲存</button>
        </div>
      </div>
    </div>
  );
}
