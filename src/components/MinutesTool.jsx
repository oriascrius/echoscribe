import { useEffect, useMemo, useRef, useState } from 'react';
import { CHAT_LINKS, DEFAULT_PROMPT, buildChatText } from '../lib/minutes.js';
import { TEXT_ACCEPT, readTextFile } from '../lib/textfile.js';

const PROMPT_KEY = 'es.minutesPrompt';
const LONG = 30000;

function load(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function save(key, v) {
  try { localStorage.setItem(key, v); } catch { /* 忽略 */ }
}

/**
 * transcript: 目前轉錄結果的純文字（沒有則為 null）
 * focusSignal: 數字改變時切到「使用逐字稿」並捲動到此區塊
 */
export default function MinutesTool({ transcript, transcriptName, onToast, focusSignal }) {
  const [source, setSource] = useState(transcript ? 'transcript' : 'file');
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [pasted, setPasted] = useState('');
  const [prompt, setPrompt] = useState(() => load(PROMPT_KEY, DEFAULT_PROMPT));
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [fallback, setFallback] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const fallbackRef = useRef(null);

  // 新的轉錄結果出現時，自動改用逐字稿
  useEffect(() => {
    if (transcript) setSource('transcript');
  }, [transcript]);

  useEffect(() => {
    if (!focusSignal) return;
    if (transcript) setSource('transcript');
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const content = source === 'transcript' ? transcript || '' : source === 'file' ? fileText : pasted;
  const full = useMemo(() => (content.trim() ? buildChatText(prompt, content) : ''), [prompt, content]);

  function changePrompt(v) {
    setPrompt(v);
    save(PROMPT_KEY, v);
  }

  async function pickFile(f) {
    if (!f) return;
    setError('');
    try {
      const text = await readTextFile(f);
      setFileText(text);
      setFileName(f.name);
    } catch (e) {
      setError(e.message);
    }
  }

  // 在點擊當下就開始寫入剪貼簿，再讓連結開新分頁（避免手機瀏覽器擋掉）
  function copyNow() {
    if (!full) return false;
    setFallback(false);
    navigator.clipboard?.writeText(full).then(
      () => onToast('已複製！在 AI 聊天的輸入框貼上即可'),
      () => {
        setFallback(true);
        onToast('自動複製失敗，請手動複製下方文字');
        setTimeout(() => fallbackRef.current?.select(), 50);
      }
    ) ?? setFallback(true);
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
        把內容連同整理要求一起複製，貼到免費的 AI 聊天，<b>不會使用 API 額度</b>。
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

      <div className="step-title">
        <span className="num">2</span>整理要求
        <span className="grow" />
        {prompt !== DEFAULT_PROMPT && (
          <button className="btn text small" onClick={() => changePrompt(DEFAULT_PROMPT)}>恢復預設</button>
        )}
      </div>
      <p className="muted small" style={{ margin: '-4px 0 6px' }}>可以直接修改標題、格式或規則，會自動記住，下次不用重改。</p>
      <textarea className="input prompt" value={prompt} onChange={(e) => changePrompt(e.target.value)} rows={12} spellCheck={false} />

      <div className="step-title"><span className="num">3</span>複製並開啟 AI 聊天</div>
      <div className="chat-grid">
        {CHAT_LINKS.map(([label, url]) => (
          <a
            key={label}
            className={`btn ${label === 'Gemini' ? 'primary' : 'ghost'} ${full ? '' : 'is-disabled'}`}
            href={full ? url : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!full}
            onClick={(e) => { if (!copyNow()) e.preventDefault(); }}
          >
            複製並開啟 {label} ↗
          </a>
        ))}
        <button className="btn ghost" disabled={!full} onClick={copyNow}>只複製</button>
      </div>
      <p className="muted small">
        {full
          ? <>開啟後在輸入框<b>貼上</b>（電腦按 Ctrl+V，手機長按選「貼上」）再送出。共約 {full.length.toLocaleString()} 字。</>
          : '請先選擇或貼上會議內容。'}
        {full.length > LONG && ' 內容較長，免費版 AI 聊天可能一次吃不下，若被截斷請分段貼上。'}
      </p>

      {fallback && (
        <textarea ref={fallbackRef} className="input prompt" readOnly rows={6} value={full} onFocus={(e) => e.target.select()} />
      )}
    </section>
  );
}
