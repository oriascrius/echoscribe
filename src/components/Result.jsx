import { useEffect, useMemo, useRef, useState } from 'react';
import { FORMATS, clock, hasSpeakers } from '../lib/format.js';
import { buildDocx } from '../lib/docx.js';

const VIEWS = Object.entries(FORMATS).map(([k, f]) => [k, f.label]);

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function Result({ result, audioUrl, onToast, onMinutes }) {
  const [view, setView] = useState('timeline');
  const [now, setNow] = useState(-1);
  const [making, setMaking] = useState(false);
  const audio = useRef(null);
  const listRef = useRef(null);
  const { segments, name } = result;

  const text = useMemo(() => FORMATS[view].fn(segments), [segments, view]);
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
        <div className="row gap">
          <button className="btn ghost small" onClick={copy}>複製</button>
          <button className="btn ghost small" onClick={download}>下載 .{FORMATS[view].ext}</button>
          {view !== 'srt' && (
            <button className="btn primary small" onClick={downloadWord} disabled={making}>
              {making ? '產生中…' : '下載 Word'}
            </button>
          )}
        </div>
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

      <div className="row between result-foot">
        <span className="muted small">{view === 'timeline' && audioUrl ? '點時間可以跳到該段播放。' : ''}</span>
        <button className="btn ghost small" onClick={onMinutes}>整理成會議記錄 ↓</button>
      </div>
    </section>
  );
}
