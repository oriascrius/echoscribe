import { useEffect, useRef, useState } from 'react';
import { GEM_INSTRUCTIONS, isGemUrl } from '../lib/minutes.js';
import { TEXT_ACCEPT, readTextFile } from '../lib/textfile.js';

const GEM_KEY = 'es.gemUrl';
const LONG = 30000;

/** 同步複製（在點擊當下完成，不受開新分頁影響） */
function copySync(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

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
  const [dismissed, setDismissed] = useState(false); // 使用者移除了逐字稿
  const hasTranscript = !!transcript && !dismissed;
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [pasted, setPasted] = useState('');
  const [gemUrl, setGemUrl] = useState(() => load(GEM_KEY, ''));
  const [editingGem, setEditingGem] = useState(() => !isGemUrl(load(GEM_KEY, '')));
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [fallback, setFallback] = useState('');
  const [copied, setCopied] = useState(0); // 已複製的字數，0 = 尚未複製
  const [aiText, setAiText] = useState('');
  const [dropNotes, setDropNotes] = useState(true);
  const [making, setMaking] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const fallbackRef = useRef(null);
  const gemValid = isGemUrl(gemUrl);

  // 新的轉錄結果出現時，自動改用逐字稿
  useEffect(() => {
    if (transcript) { setDismissed(false); setSource('transcript'); }
  }, [transcript]);

  useEffect(() => {
    if (!focusSignal) return;
    if (transcript) { setDismissed(false); setSource('transcript'); }
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = source === 'transcript' && !hasTranscript ? 'file' : source;
  const content = (active === 'transcript' ? transcript || '' : active === 'file' ? fileText : pasted).trim();

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

  function showFallback(text) {
    setFallback(text);
    setCopied(0);
    onToast('自動複製失敗，請手動複製下方文字');
    setTimeout(() => fallbackRef.current?.select(), 50);
  }

  function copied_(text, okMsg) {
    setFallback('');
    setCopied(text.length);
    onToast(okMsg);
  }

  // 一般複製：先同步複製，失敗再用非同步 API
  function copy(text, okMsg) {
    if (!text) return;
    if (copySync(text)) return copied_(text, okMsg);
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => copied_(text, okMsg), () => showFallback(text));
    else showFallback(text);
  }

  // 「複製並開啟 Gem」：在開新分頁之前同步完成複製，避免新分頁搶走焦點導致複製失敗
  function copyAndOpen(e) {
    if (!content) { e.preventDefault(); return; }
    if (copySync(content)) { copied_(content, '已複製！到 Gem 的輸入框貼上即可'); return; } // 讓連結正常開啟
    e.preventDefault();
    if (!navigator.clipboard) { showFallback(content); return; }
    navigator.clipboard.writeText(content).then(
      () => { copied_(content, '已複製！到 Gem 的輸入框貼上即可'); window.open(gemUrl, '_blank', 'noopener'); },
      () => showFallback(content)
    );
  }

  async function downloadWord() {
    setMaking(true);
    try {
      const { buildMinutesWord, stripCorrectionNotes } = await import('../lib/docx.js');
      const text = dropNotes ? stripCorrectionNotes(aiText) : aiText;
      const { blob, title } = await buildMinutesWord(text);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60) || '會議紀錄'}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      onToast('Word 已下載');
    } catch {
      onToast('Word 檔產生失敗，請確認貼上的內容');
    } finally {
      setMaking(false);
    }
  }

  const tabs = [
    ...(hasTranscript ? [['transcript', '剛才的逐字稿']] : []),
    ['file', '上傳文字／Word 檔'],
    ['paste', '直接貼上'],
  ];

  return (
    <section className="card" id="minutes" ref={rootRef}>
      <h2>整理會議記錄</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        把會議內容帶到你的 Gemini Gem 整理，<b>不會使用 API 額度</b>。整理格式在 Gem 裡設定。
      </p>

      <div className="step-title"><span className="num">1</span>會議內容</div>
      <div className="seg">
        {tabs.map(([k, label]) => (
          <button key={k} className={active === k ? 'on' : ''} onClick={() => setSource(k)}>
            {label}
          </button>
        ))}
      </div>

      {active === 'transcript' && (
        <div className="file-card">
          <div className="file-icon" aria-hidden="true">✎</div>
          <div className="file-meta">
            <div className="file-name">{transcriptName}</div>
            <div className="muted small">逐字稿約 {(transcript || '').length.toLocaleString()} 字</div>
          </div>
          <button className="btn ghost small" onClick={() => { setDismissed(true); setSource('file'); }}>移除</button>
        </div>
      )}

      {active === 'file' && (fileText ? (
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

      {active === 'paste' && (
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
            onClick={copyAndOpen}
          >
            複製內容並開啟我的 Gem ↗
          </a>
          {copied > 0 && copied === content.length ? (
            <div className="copied-note">
              <span>✓ 已複製 {copied.toLocaleString()} 字。到 Gem 的輸入框<b>貼上</b>（電腦按 Ctrl+V，手機長按選「貼上」）再送出。</span>
              <button className="btn text small" onClick={() => copy(content, '已再次複製')}>再複製一次</button>
            </div>
          ) : null}
          <p className="muted small">
            {content
              ? <>按下後會<b>自動複製</b>會議內容（約 {content.length.toLocaleString()} 字）並開啟 Gem，你只要在 Gem 貼上。</>
              : '請先選擇或貼上會議內容。'}
            {content.length > LONG && ' 內容較長，若 Gem 回覆被截斷請分段貼上。'}
            {' '}<button className="btn text small" onClick={() => setEditingGem(true)}>更改 Gem 網址</button>
          </p>
        </>
      )}

      {fallback && (
        <textarea ref={fallbackRef} className="input prompt" readOnly rows={6} value={fallback} onFocus={(e) => e.target.select()} />
      )}

      <div className="step-title"><span className="num">3</span>貼回結果，下載 Word</div>
      <p className="muted small" style={{ margin: '-4px 0 6px' }}>
        在 Gem 回覆下方按「複製」，貼到這裡，就能下載排好版的 Word（標楷體、標題置中、大項粗體、表格保留）。
      </p>
      <textarea className="input prompt" rows={8} value={aiText} onChange={(e) => setAiText(e.target.value)}
        placeholder="把 Gem 整理好的會議紀錄貼在這裡…" />
      <label className="check">
        <input type="checkbox" checked={dropNotes} onChange={(e) => setDropNotes(e.target.checked)} />
        下載時不包含最後的「修正說明」
      </label>
      <button className="btn primary big" onClick={downloadWord} disabled={!aiText.trim() || making}>
        {making ? '產生中…' : '下載 Word'}
      </button>
    </section>
  );
}
