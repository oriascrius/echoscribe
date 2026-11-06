// OpenCC 字典很大，轉錄完才動態載入，讓首頁開得快
let s2twp = null;
async function getConverter() {
  if (!s2twp) {
    const OpenCC = await import('opencc-js/cn2t');
    s2twp = OpenCC.Converter({ from: 'cn', to: 'twp' });
  }
  return s2twp;
}

/** "01:02:03" / "02:03" / "02:03.5" / 123 → 秒 */
export function parseTime(v) {
  if (typeof v === 'number') return v;
  const parts = String(v || '0').trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');

/** 秒 → 00:01:23 */
export function clock(sec, withHours = true) {
  const h = sec / 3600;
  const m = (sec % 3600) / 60;
  const s = sec % 60;
  return withHours || sec >= 3600 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function srtTime(sec) {
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${clock(sec)},${pad(ms, 3)}`;
}

export async function toTraditional(segments) {
  const cv = await getConverter();
  return segments.map((s) => ({ ...s, text: cv(s.text), speaker: cv(s.speaker) }));
}

/** 遞迴把物件內所有字串轉成臺灣繁體（會議記錄用） */
export async function deepTraditional(value) {
  const cv = await getConverter();
  const walk = (v) =>
    typeof v === 'string' ? cv(v)
      : Array.isArray(v) ? v.map(walk)
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
          : v;
  return walk(value);
}

export function hasSpeakers(segments) {
  return segments.some((s) => s.speaker);
}

/** 純文字：同一講者或連續語句合併成段落 */
export function toPlain(segments) {
  const withSpk = hasSpeakers(segments);
  const paras = [];
  let cur = null;
  segments.forEach((s, i) => {
    const gap = i > 0 ? s.start - segments[i - 1].end : 0;
    const newPara = !cur || (withSpk ? s.speaker !== cur.speaker : gap >= 2.5 || cur.count >= 6);
    if (newPara) {
      cur = { speaker: s.speaker, text: s.text, count: 1 };
      paras.push(cur);
    } else {
      cur.text += s.text;
      cur.count++;
    }
  });
  return paras.map((p) => (withSpk && p.speaker ? `${p.speaker}：${p.text}` : p.text)).join('\n\n');
}

export function toTimeline(segments) {
  return segments
    .map((s) => `[${clock(s.start)} → ${clock(s.end)}] ${s.speaker ? s.speaker + '：' : ''}${s.text}`)
    .join('\n');
}

export function toSrt(segments) {
  return segments
    .map(
      (s, i) =>
        `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.speaker ? s.speaker + '：' : ''}${s.text}\n`
    )
    .join('\n');
}

export const FORMATS = {
  plain: { label: '純文字', ext: 'txt', fn: toPlain },
  timeline: { label: '時間軸', ext: 'txt', fn: toTimeline },
  srt: { label: 'SRT 字幕', ext: 'srt', fn: toSrt },
};
