import { useEffect, useMemo, useRef, useState } from 'react';
import { FORMATS, clock, deepTraditional, hasSpeakers } from '../lib/format.js';
import { buildDocx, buildMinutesDocx } from '../lib/docx.js';
import { generateMinutes, minutesToText } from '../lib/minutes.js';
import { friendlyError } from '../lib/gemini.js';

const VIEWS = [
  ...Object.entries(FORMATS).map(([k, f]) => [k, f.label]),
  ['minutes', '會議記錄'],
];

function Minutes({ m }) {
  return (
    <div className="minutes">
      <h3>{m.title}</h3>
      {m.attendees.length > 0 && <p className="muted small">與會者：{m.attendees.join('、')}</p>}

      <h4>會議摘要</h4>
      <p>{m.summary}</p>

      {m.topics.length > 0 && (
        <>
          <h4>討論重點</h4>
          {m.topics.map((t, i) => (
            <div key={i} className="topic">
              <b>{i + 1}. {t.title}</b>
              <ul>{t.points.map((p, j) => <li key={j}>{p}</li>)}</ul>
            </div>
          ))}
        </>
      )}

      <h4>決議事項</h4>
      {m.decisions.length ? <ol>{m.decisions.map((d, i) => <li key={i}>{d}</li>)}</ol> : <p className="muted">（無）</p>}

      <h4>待辦事項</h4>
      {m.actions.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>事項</th><th>負責人</th><th>期限</th></tr></thead>
            <tbody>
              {m.actions.map((a, i) => (
                <tr key={i}><td>{a.task}</td><td>{a.owner}</td><td>{a.due}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">（無）</p>}

      {m.nextMeeting && (<><h4>下次會議</h4><p>{m.nextMeeting}</p></>)}
    </div>
  );
}

export default function Result({ result, audioUrl, onToast, apiKey, model, onUpdate, onNeedKey }) {
  const [view, setView] = useState('timeline');
  const [now, setNow] = useState(-1);
  const [making, setMaking] = useState(false);
  const [minutesBusy, setMinutesBusy] = useState(false);
  const [minutesError, setMinutesError] = useState('');
  const audio = useRef(null);
  const listRef = useRef(null);
  const { segments, name, minutes } = result;

  const duration = segments.at(-1)?.end || 0;
  const meta = useMemo(
    () => ({ date: new Date(result.createdAt || Date.now()).toLocaleDateString('zh-TW'), duration }),
    [result.createdAt, duration]
  );
  const isMinutes = view === 'minutes';
  const text = useMemo(
    () => (isMinutes ? (minutes ? minutesToText(minutes, meta) : '') : FORMATS[view].fn(segments)),
    [segments, view, minutes, meta, isMinutes]
  );
  const speakers = hasSpeakers(segments);
  const active = segments.findIndex((s) => now >= s.start && now < s.end);

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
    try {
      await navigator.clipboard.writeText(text);
      onToast('已複製到剪貼簿');
    } catch {
      onToast('複製失敗，請手動選取文字');
    }
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
    const label = isMinutes ? '會議記錄' : view === 'srt' ? '字幕' : '逐字稿';
    save(blob, `${base}_${label}.${isMinutes ? 'txt' : FORMATS[view].ext}`);
  }

  async function downloadWord() {
    setMaking(true);
    try {
      const blob = isMinutes
        ? await buildMinutesDocx(minutes, meta)
        : await buildDocx({ name, segments, view, createdAt: result.createdAt });
      save(blob, `${base}_${isMinutes ? '會議記錄' : '逐字稿'}.docx`);
    } catch {
      onToast('Word 檔產生失敗，請改下載 .txt');
    } finally {
      setMaking(false);
    }
  }

  async function makeMinutes() {
    if (!apiKey) { onNeedKey(); return; }
    setMinutesBusy(true);
    setMinutesError('');
    try {
      const m = await deepTraditional(await generateMinutes({ apiKey, model, segments }));
      onUpdate({ ...result, minutes: m });
      onToast('會議記錄完成');
    } catch (e) {
      setMinutesError(friendlyError(e) || '');
    } finally {
      setMinutesBusy(false);
    }
  }

  const chars = segments.reduce((n, s) => n + s.text.length, 0);
  const canExport = !isMinutes || !!minutes;

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
        {canExport && (
          <div className="row gap">
            <button className="btn ghost small" onClick={copy}>複製</button>
            <button className="btn ghost small" onClick={download}>下載 .{isMinutes ? 'txt' : FORMATS[view].ext}</button>
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

      {isMinutes && (
        minutesBusy ? (
          <div className="progress">
            <p className="small">正在根據逐字稿整理會議記錄…通常需要 10～30 秒</p>
            <div className="bar"><span /></div>
          </div>
        ) : minutes ? (
          <>
            <Minutes m={minutes} />
            <div className="row end">
              <button className="btn text small" onClick={makeMinutes}>重新整理一次</button>
            </div>
          </>
        ) : (
          <div className="empty">
            <p>AI 會根據逐字稿整理出<b>會議摘要、討論重點、決議事項、待辦事項</b>（含負責人與期限）。</p>
            <p className="muted small">會使用 1 次 Gemini 額度。內容只根據逐字稿整理，請務必再核對一次。</p>
            <button className="btn primary" onClick={makeMinutes}>產生會議記錄</button>
          </div>
        )
      )}
      {isMinutes && minutesError && <p className="field-error" role="alert">{minutesError}</p>}

      {view === 'timeline' && audioUrl && <p className="muted small">點時間可以跳到該段播放。</p>}
    </section>
  );
}
