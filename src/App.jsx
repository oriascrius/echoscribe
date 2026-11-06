import { useCallback, useEffect, useRef, useState } from 'react';
import AudioInput from './components/AudioInput.jsx';
import Settings from './components/Settings.jsx';
import Result from './components/Result.jsx';
import Guide from './components/Guide.jsx';
import { prepareAudio } from './lib/audio.js';
import { DEFAULT_MODEL, friendlyError, transcribeAudio } from './lib/gemini.js';
import { clock, toTraditional } from './lib/format.js';

// localStorage 可能被封鎖（無痕模式等），一律包 try/catch
const store = {
  get(k, fallback) {
    try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 忽略 */ }
  },
};

const STAGES = [
  ['prepare', '準備音訊'],
  ['upload', '上傳'],
  ['processing', '雲端處理'],
  ['transcribe', 'AI 辨識中'],
];

const LANGS = [
  ['zh-TW', '中文（臺灣繁體）'],
  ['auto', '自動偵測（不翻譯）'],
  ['en', 'English'],
];

function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`toggle ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="track" aria-hidden="true"><span /></span>
      <span>
        <span className="toggle-label">{label}</span>
        <span className="muted small block">{hint}</span>
      </span>
    </label>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => store.get('es.apiKey', ''));
  const [model, setModel] = useState(() => store.get('es.model', DEFAULT_MODEL));
  const [options, setOptions] = useState(() => store.get('es.options', { language: 'zh-TW', polish: true, speakers: false }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [stage, setStage] = useState(null); // null = 閒置
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(() => store.get('es.lastResult', null));
  const [toast, setToast] = useState('');
  const [retrying, setRetrying] = useState(false);
  const abortRef = useRef(null);
  const resultRef = useRef(null);
  const busy = stage !== null;

  useEffect(() => store.set('es.options', options), [options]);

  // 檔案預覽網址
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 計時
  useEffect(() => {
    if (!busy) return;
    const t0 = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - t0) / 1000), 500);
    return () => clearInterval(id);
  }, [busy]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }, []);

  function saveSettings(k, m) {
    setApiKey(k);
    setModel(m);
    store.set('es.apiKey', k);
    store.set('es.model', m);
    setSettingsOpen(false);
    showToast(k ? '設定已儲存' : '金鑰已清除');
  }

  function chooseFile(f) {
    setFile(f);
    setError('');
    if (!f) setAudioUrl('');
  }

  async function run() {
    if (!apiKey) { setSettingsOpen(true); return; }
    if (!file) return;
    setError('');
    setElapsed(0);
    setRetrying(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setStage('prepare');
      const { blob, mimeType } = await prepareAudio(file);
      if (ctrl.signal.aborted) throw new DOMException('', 'AbortError');
      let segments = await transcribeAudio({
        apiKey, model, blob, mimeType, options,
        onStage: (s) => (s === 'retry' ? setRetrying(true) : setStage(s)),
        signal: ctrl.signal,
      });
      if (options.language !== 'en') segments = await toTraditional(segments);
      const r = { name: file.name, segments, createdAt: Date.now() };
      setResult(r);
      store.set('es.lastResult', r);
      showToast('轉錄完成');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) {
      const msg = friendlyError(e);
      if (msg) setError(msg);
    } finally {
      setStage(null);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setStage(null);
    showToast('已取消');
  }

  const stageIndex = STAGES.findIndex(([k]) => k === stage);
  const resultAudio = result && file && result.name === file.name ? audioUrl : '';

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>EchoScribe</span>
        </div>
        <nav className="row gap">
          <a className="btn text small" href="#guide">說明與限制</a>
          <button className="btn ghost small" onClick={() => setSettingsOpen(true)}>
            <span className={`dot ${apiKey ? 'ok' : ''}`} aria-hidden="true" />設定
          </button>
        </nav>
      </header>

      <main className="wrap">
        <section className="hero">
          <h1>把錄音變成逐字稿</h1>
          <p className="muted">上傳音訊或直接錄音，AI 會轉成繁體中文逐字稿，並可以輸出時間軸或 SRT 字幕。</p>
        </section>

        {!apiKey && (
          <div className="notice">
            <span>第一次使用前，請先設定你的 Gemini API 金鑰（免費申請）。</span>
            <button className="btn primary small" onClick={() => setSettingsOpen(true)}>前往設定</button>
          </div>
        )}

        <section className="card">
          <div className="step-title"><span className="num">1</span>選擇音訊</div>
          <AudioInput file={file} onFile={chooseFile} disabled={busy} />
          {file && audioUrl && <audio className="player" src={audioUrl} controls preload="metadata" />}

          <div className="step-title"><span className="num">2</span>轉錄選項</div>
          <div className="options">
            <label className="field">
              <span className="label">語言</span>
              <select className="input" value={options.language} disabled={busy}
                onChange={(e) => setOptions({ ...options, language: e.target.value })}>
                {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <Toggle label="AI 潤飾" hint="修正錯字、刪除口頭禪" checked={options.polish} disabled={busy}
              onChange={(v) => setOptions({ ...options, polish: v })} />
            <Toggle label="區分講者" hint="適合會議、訪談" checked={options.speakers} disabled={busy}
              onChange={(v) => setOptions({ ...options, speakers: v })} />
          </div>

          <div className="step-title"><span className="num">3</span>開始轉錄</div>
          {busy ? (
            <div className="progress">
              <ol className="stepper">
                {STAGES.map(([k, l], i) => (
                  <li key={k} className={i < stageIndex ? 'done' : i === stageIndex ? 'now' : ''}>{l}</li>
                ))}
              </ol>
              <div className="bar"><span /></div>
              {retrying && <p className="small" style={{ margin: '0 0 8px' }}>Google 目前比較忙，正在自動重試…</p>}
              <div className="row between">
                <span className="muted small">已經過 {clock(elapsed, false)}・長音檔可能需要數分鐘，請勿關閉頁面</span>
                <button className="btn text small" onClick={cancel}>取消</button>
              </div>
            </div>
          ) : (
            <button className="btn primary big" onClick={run} disabled={!file}>
              {!file ? '請先選擇音訊' : !apiKey ? '設定金鑰後開始' : '開始轉錄'}
            </button>
          )}
          {error && <p className="field-error" role="alert">{error}</p>}
        </section>

        <div ref={resultRef}>
          {result && (
            <Result
              key={result.createdAt}
              result={result}
              audioUrl={resultAudio}
              onToast={showToast}
              apiKey={apiKey}
              model={model}
              onNeedKey={() => setSettingsOpen(true)}
              onUpdate={(r) => { setResult(r); store.set('es.lastResult', r); }}
            />
          )}
        </div>

        <Guide />

        <footer className="muted small foot">EchoScribe・語音辨識由 Google Gemini 提供</footer>
      </main>

      <Settings open={settingsOpen} apiKey={apiKey} model={model} onSave={saveSettings} onClose={() => setSettingsOpen(false)} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
