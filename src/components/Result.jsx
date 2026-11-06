import { useEffect, useMemo, useRef, useState } from 'react';
import { FORMATS, clock, hasSpeakers } from '../lib/format.js';
import { buildDocx } from '../lib/docx.js';
import { CHAT_LINKS, DEFAULT_PROMPT, buildChatText } from '../lib/minutes.js';

const VIEWS = [
  ...Object.entries(FORMATS).map(([k, f]) => [k, f.label]),
  ['minutes', '會議記錄'],
];

const PROMPT_KEY = 'es.minutesPrompt';
const loadPrompt = () => {
  try { return localStorage.getItem(PROMPT_KEY) || DEFAULT_PROMPT; } catch { return DEFAULT_PROMPT; }
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function MinutesHelper({ segments, onToast }) {
  const [prompt, setPrompt] = useState(loadPrompt);
  const [copied, setCopied] = useState(false);
  const full = useMemo(() => buildChatText(prompt, segments), [prompt, segments]);

  function changePrompt(v) {
    setPrompt(v);
    setCopied(false);
    try { localStorage.setItem(PROMPT_KEY, v); } catch { /* 忽略 */ }
  }

  async function copyAll() {
    if (await copyText(full)) {
      setCopied(true);
      onToast('已複製，請到 AI 聊天貼上');
    } else {
      onToast('複製失敗，請改用電腦版瀏覽器');
    }
  }

  return (
    <div className="minutes-helper">
      <p>
        把逐字稿貼到<b>免費的 AI 聊天</b>（Gemini、ChatGPT、Claude）整理成會議記錄，
        <b>不會使用 API 額度</b>。
      </p>

      <ol className="steps">
        <li>確認下方的整理要求（可以自己改標題、格式，網站會記住）</li>
        <li>按「複製要求＋逐字稿」</li>
        <li>打開任一個 AI 聊天，貼上後送出</li>
      </ol>

      <div className="row between">
        <label className="label" htmlFor="minutes-prompt" style={{ margin: 0 }}>整理要求</label>
        {prompt !== DEFAULT_PROMPT && (
          <button className="btn text small" onClick={() => changePrompt(DEFAULT_PROMPT)}>恢復預設</button>
        )}
      </div>
      <textarea
        id="minutes-prompt"
        className="input prompt"
        value={prompt}
        onChange={(e) => changePrompt(e.target.value)}
        rows={12}
        spellCheck={false}
      />

      <button className="btn primary big" onClick={copyAll}>
        {copied ? '✓ 已複製，可以去貼上了' : '複製要求＋逐字稿'}
      </button>

      <div className="chat-links">
        <span className="muted small">開啟 AI 聊天：</span>
        {CHAT_LINKS.map(([label, url]) => (
          <a key={label} className="btn ghost small" href={url} target="_blank" rel="noreferrer">{label} ↗</a>
        ))}
      </div>

      <p className="muted small">
        共約 {full.length.toLocaleString()} 字。
        {full.length > 30000 && '內容較長，免費版 AI 聊天可能一次吃不下，若被截斷請分段貼上。'}
        AI 整理的結果請再核對一次再發出。
      </p>
    </div>
  );
}

export default function Result({ result, audioUrl, onToast }) {
  const [view, setView] = useState('timeline');
  const [now, setNow] = useState(-1);
  const [making, setMaking] = useState(false);
  const audio = useRef(null);
  const listRef = useRef(null);
  const { segments, name } = result;

  const isMinutes = view === 'minutes';
  const text = useMemo(() => (isMinutes ? '' : FORMATS[view].fn(segments)), [segments, view, isMinutes]);
  const speakers = hasSpeakers(segments);
  const active = segments.findIndex((s) => now >= s.start && now < s.end);
  const duration = segments.at(-1)?.end || 0;

  // 播放時讓目前段落保持在可視範圍
  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  function seek(t) {
    if (!audio.current) return;
    audio.current.currentTime = t;
    audio.current.play().catch(() => {});
  }

  async function copy() {
    onToast((await copyText(text)) ? '已複製到剪貼簿' : '複製失敗，請手動選取文字');
  }

  const base = name.replace(/\.[^.]+$/, '');

  function save(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function download() {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    save(blob, `${base}_${view === 'srt' ? '字幕' : '逐字稿'}.${FORMATS[view].ext}`);
  }

  async function downloadWord() {
    setMaking(true);
    try {
      const blob = await buildDocx({ name, segments, view, createdAt: result.createdAt });
      save(blob, `${base}_逐字稿.docx`);
    } catch {
      onToast('Word 檔產生失敗，請改下載 .txt');
    } finally {
      setMaking(false);
    }
  }

  const chars = segments.reduce((n, s) => n + s.text.length, 0);

  return (
    <section className="card result">
      <div className="result-head">
        <div>
          <h2>轉錄結果</h2>
          <p className="muted small">
            {name}・{segments.length} 段・約 {chars.toLocaleString()} 字・{clock(duration, false)}
            {speakers && '・含講者'}
          </p>
        </div>
        {!isMinutes && (
          <div className="row gap">
            <button className="btn ghost small" onClick={copy}>複製</button>
            <button className="btn ghost small" onClick={download}>下載 .{FORMATS[view].ext}</button>
            {view !== 'srt' && (
              <button className="btn primary small" onClick={downloadWord} disabled={making}>
                {making ? '產生中…' : '下載 Word'}
              </button>
            )}
          </div>
        )}
      </div>

      {audioUrl && (
        <audio ref={audio} className="player" src={audioUrl} controls preload="metadata" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
      )}

      <div className="seg">
        {VIEWS.map(([k, label]) => (
          <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{label}</button>
        ))}
      </div>

      {view === 'timeline' && (
        <ol className="lines" ref={listRef}>
          {segments.map((s, i) => (
            <li key={i} data-i={i} className={i === active ? 'active' : ''}>
              <button className="ts" onClick={() => seek(s.start)} disabled={!audioUrl} title={audioUrl ? '從這裡播放' : ''}>
                {clock(s.start, duration >= 3600)}
              </button>
              <div>
                {s.speaker && <span className="spk">{s.speaker}</span>}
                <span>{s.text}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {(view === 'plain' || view === 'srt') && <pre className={`text-out ${view}`}>{text}</pre>}
      {isMinutes && <MinutesHelper segments={segments} onToast={onToast} />}

      {view === 'timeline' && audioUrl && <p className="muted small">點時間可以跳到該段播放。</p>}
    </section>
  );
}
