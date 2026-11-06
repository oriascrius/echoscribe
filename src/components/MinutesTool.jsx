import { useEffect, useRef, useState } from 'react';
import { GEM_INSTRUCTIONS, isGemUrl } from '../lib/minutes.js';
import { TEXT_ACCEPT, readTextFile } from '../lib/textfile.js';

const GEM_KEY = 'es.gemUrl';
const LONG = 30000;

function load(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function save(key, v) {
  try { localStorage.setItem(key, v); } catch { /* 忽略 */ }
}

/**
 * transcript: 目前轉錄結果的純文字（沒有則為 null）
 * focusSignal: 數字改變時切到「剛才的逐字稿」並捲動到此區塊
 */
export default function MinutesTool({ transcript, transcriptName, onToast, focusSignal }) {
  const [source, setSource] = useState(transcript ? 'transcript' : 'file');
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [pasted, setPasted] = useState('');
  const [gemUrl, setGemUrl] = useState(() => load(GEM_KEY, ''));
  const [editingGem, setEditingGem] = useState(() => !isGemUrl(load(GEM_KEY, '')));
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [fallback, setFallback] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const fallbackRef = useRef(null);
  const gemValid = isGemUrl(gemUrl);

  // 新的轉錄結果出現時，自動改用逐字稿
  useEffect(() => {
    if (transcript) setSource('transcript');
  }, [transcript]);

  useEffect(() => {
    if (!focusSignal) return;
    if (transcript) setSource('transcript');
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const content = (source === 'transcript' ? transcript || '' : source === 'file' ? fileText : pasted).trim();

  async function pickFile(f) {
    if (!f) return;
    setError('');
    try {
      setFileText(await readTextFile(f));
      setFileName(f.name);
    } catch (e) {
      setError(e.message);
    }
  }

  // 在點擊當下就開始寫入剪貼簿，再讓連結開新分頁（避免手機瀏覽器擋掉）
  function copy(text, okMsg) {
    if (!text) return false;
    setFallback('');
    const fail = () => {
      setFallback(text);
      onToast('自動複製失敗，請手動複製下方文字');
      setTimeout(() => fallbackRef.current?.select(), 50);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => onToast(okMsg), fail);
    else fail();
    return true;
  }

  const tabs = [
    ['transcript', '剛才的逐字稿', !transcript],
    ['file', '上傳文字／Word 檔', false],
    ['paste', '直接貼上', false],
  ];

  return (
    <section className="card" id="minutes" ref={rootRef}>
      <h2>整理會議記錄</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        把會議內容帶到你的 Gemini Gem 整理，<b>不會使用 API 額度</b>。整理格式在 Gem 裡設定。
      </p>

      <div className="step-title"><span className="num">1</span>會議內容</div>
      <div className="seg">
        {tabs.map(([k, label, disabled]) => (
          <button key={k} className={source === k ? 'on' : ''} disabled={disabled} onClick={() => setSource(k)}
            title={disabled ? '請先在上方完成轉錄' : ''}>
            {label}
          </button>
        ))}
      </div>

      {source === 'transcript' && (
        <div className="file-card">
          <div className="file-icon" aria-hidden="true">✎</div>
          <div className="file-meta">
            <div className="file-name">{transcriptName}</div>
            <div className="muted small">逐字稿約 {(transcript || '').length.toLocaleString()} 字</div>
          </div>
        </div>
      )}

      {source === 'file' && (fileText ? (
        <div className="file-card">
          <div className="file-icon" aria-hidden="true">▤</div>
          <div className="file-meta">
            <div className="file-name" title={fileName}>{fileName}</div>
            <div className="muted small">約 {fileText.length.toLocaleString()} 字・{fileText.slice(0, 40).replace(/\s+/g, ' ')}…</div>
          </div>
          <button className="btn ghost small" onClick={() => { setFileText(''); setFileName(''); }}>更換</button>
        </div>
      ) : (
        <div
          className={`drop ${drag ? 'drag' : ''}`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}
          role="button"
          tabIndex={0}
        >
          <div className="drop-icon" aria-hidden="true">↑</div>
          <div className="drop-title">拖曳檔案到這裡，或點擊選擇</div>
          <div className="muted small">Word（.docx）・文字檔（.txt）・字幕（.srt）</div>
          <input ref={inputRef} type="file" accept={TEXT_ACCEPT} hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      ))}

      {source === 'paste' && (
        <textarea className="input prompt" rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)}
          placeholder="把會議逐字稿或筆記貼在這裡…" />
      )}
      {error && <p className="field-error">{error}</p>}

      <div className="step-title"><span className="num">2</span>帶到 Gem 整理</div>

      {editingGem || !gemValid ? (
        <div className="gem-box">
          <label className="label" htmlFor="gem-url">我的 Gem 網址</label>
          <div className="row gap">
            <input id="gem-url" className="input" value={gemUrl} placeholder="https://gemini.google.com/gem/..."
              onChange={(e) => { setGemUrl(e.target.value.trim()); save(GEM_KEY, e.target.value.trim()); }} />
            {gemValid && <button className="btn primary small" onClick={() => setEditingGem(false)}>完成</button>}
          </div>
          {gemUrl && !gemValid && <p className="field-error">網址要以 https://gemini.google.com/ 開頭。</p>}

          <details className="gem-help">
            <summary>還沒有 Gem？建立方式</summary>
            <ol className="steps">
              <li>打開 <a href="https://gemini.google.com/gems/view" target="_blank" rel="noreferrer">Gemini 的 Gem 管理員</a>，按「新增 Gem」。</li>
              <li>名稱取「會議記錄整理」，在「使用說明」貼上下方建議內容（可依需求修改）。</li>
              <li>儲存後打開這個 Gem，複製網址列的網址，貼到上面的欄位。</li>
            </ol>
            <button className="btn ghost small" onClick={() => copy(GEM_INSTRUCTIONS, '已複製建議的使用說明')}>複製建議的使用說明</button>
            <p className="muted small" style={{ margin: '8px 0 0' }}>之後要改整理格式，請到 Gem 裡修改「使用說明」。</p>
          </details>
        </div>
      ) : (
        <>
          <a
            className={`btn primary big ${content ? '' : 'is-disabled'}`}
            href={content ? gemUrl : undefined}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => { if (!copy(content, '已複製！在 Gem 的輸入框貼上即可')) e.preventDefault(); }}
          >
            複製內容並開啟我的 Gem ↗
          </a>
          <p className="muted small">
            {content
              ? <>開啟後在輸入框<b>貼上</b>（電腦按 Ctrl+V，手機長按選「貼上」）再送出。約 {content.length.toLocaleString()} 字。</>
              : '請先選擇或貼上會議內容。'}
            {content.length > LONG && ' 內容較長，若 Gem 回覆被截斷請分段貼上。'}
            {' '}<button className="btn text small" onClick={() => setEditingGem(true)}>更改 Gem 網址</button>
          </p>
        </>
      )}

      {fallback && (
        <textarea ref={fallbackRef} className="input prompt" readOnly rows={6} value={fallback} onFocus={(e) => e.target.select()} />
      )}
    </section>
  );
}
