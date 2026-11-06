import { useEffect, useRef, useState } from 'react';
import { ACCEPT, formatBytes, validateFile } from '../lib/audio.js';
import { clock } from '../lib/format.js';

function pickRecorderType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

function Recorder({ onRecorded, disabled }) {
  const [state, setState] = useState('idle'); // idle | recording | paused
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const rec = useRef(null);
  const chunks = useRef([]);
  const stream = useRef(null);
  const tick = useRef({ base: 0, since: 0, id: 0 });

  const stopTimer = () => clearInterval(tick.current.id);
  const startTimer = () => {
    tick.current.since = performance.now();
    tick.current.id = setInterval(() => {
      setElapsed(tick.current.base + (performance.now() - tick.current.since) / 1000);
    }, 250);
  };

  useEffect(() => () => {
    stopTimer();
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // 錄音中離開頁面時提醒
  useEffect(() => {
    if (state === 'idle') return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);

  async function start() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('此瀏覽器不支援錄音，或網址不是 https / localhost。');
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError('無法使用麥克風，請在瀏覽器網址列旁允許麥克風權限。');
      return;
    }
    const type = pickRecorderType();
    const mr = new MediaRecorder(stream.current, type ? { mimeType: type } : undefined);
    chunks.current = [];
    mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    mr.onstop = () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      const mime = (mr.mimeType || 'audio/webm').split(';')[0];
      const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
      const stamp = new Date().toLocaleString('sv').replace(/[: ]/g, '-').slice(0, 16);
      const blob = new Blob(chunks.current, { type: mime });
      onRecorded(new File([blob], `錄音_${stamp}.${ext}`, { type: mime }));
    };
    mr.start(1000);
    rec.current = mr;
    tick.current.base = 0;
    setElapsed(0);
    startTimer();
    setState('recording');
  }

  function togglePause() {
    const mr = rec.current;
    if (state === 'recording') {
      mr.pause();
      stopTimer();
      tick.current.base = elapsed;
      setState('paused');
    } else {
      mr.resume();
      startTimer();
      setState('recording');
    }
  }

  function stop() {
    stopTimer();
    rec.current?.stop();
    setState('idle');
  }

  return (
    <div className="recorder">
      <div className={`rec-orb ${state}`} aria-hidden="true">
        <span />
      </div>
      <div className="rec-time" aria-live="polite">{clock(elapsed, false)}</div>
      <p className="hint">
        {state === 'idle' && '按下開始後對著麥克風說話，結束後會自動帶入下一步。'}
        {state === 'recording' && '錄音中…請勿關閉或重新整理此頁面'}
        {state === 'paused' && '已暫停'}
      </p>
      <div className="row center">
        {state === 'idle' ? (
          <button className="btn primary" onClick={start} disabled={disabled}>● 開始錄音</button>
        ) : (
          <>
            <button className="btn ghost" onClick={togglePause}>{state === 'paused' ? '繼續' : '暫停'}</button>
            <button className="btn primary" onClick={stop}>■ 結束錄音</button>
          </>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export default function AudioInput({ file, onFile, disabled }) {
  const [tab, setTab] = useState('upload');
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  function accept(f) {
    if (!f) return;
    const err = validateFile(f);
    setError(err || '');
    if (!err) onFile(f);
  }

  if (file) {
    return (
      <div className="file-card">
        <div className="file-icon" aria-hidden="true">♪</div>
        <div className="file-meta">
          <div className="file-name" title={file.name}>{file.name}</div>
          <div className="muted small">{formatBytes(file.size)}</div>
        </div>
        <button className="btn ghost small" onClick={() => onFile(null)} disabled={disabled}>更換</button>
      </div>
    );
  }

  return (
    <div>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'upload'} className={tab === 'upload' ? 'on' : ''} onClick={() => setTab('upload')}>上傳檔案</button>
        <button role="tab" aria-selected={tab === 'record'} className={tab === 'record' ? 'on' : ''} onClick={() => setTab('record')}>直接錄音</button>
      </div>

      {tab === 'upload' ? (
        <div
          className={`drop ${drag ? 'drag' : ''}`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files?.[0]); }}
          role="button"
          tabIndex={0}
        >
          <div className="drop-icon" aria-hidden="true">↑</div>
          <div className="drop-title">拖曳檔案到這裡，或點擊選擇</div>
          <div className="muted small">mp3・wav・m4a・aac・ogg・flac・webm・mp4 影片</div>
          <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      ) : (
        <Recorder onRecorded={accept} disabled={disabled} />
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
