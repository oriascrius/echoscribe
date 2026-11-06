// 音訊前處理：判斷格式是否能直接送 Gemini，不行的話在瀏覽器轉成 16kHz 單聲道 WAV

export const MAX_DIRECT_BYTES = 2 * 1024 * 1024 * 1024; // Gemini Files API 單檔上限 2GB
export const MAX_CONVERT_BYTES = 200 * 1024 * 1024; // 瀏覽器內轉檔上限（受記憶體限制）

// Gemini 原生支援的音訊格式
const NATIVE_TYPES = {
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/mpeg': 'audio/mp3',
  'audio/mp3': 'audio/mp3',
  'audio/aac': 'audio/aac',
  'audio/x-aac': 'audio/aac',
  'audio/ogg': 'audio/ogg',
  'audio/flac': 'audio/flac',
  'audio/x-flac': 'audio/flac',
  'audio/aiff': 'audio/aiff',
  'audio/x-aiff': 'audio/aiff',
};

const EXT_TYPES = {
  wav: 'audio/wav',
  mp3: 'audio/mp3',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
};

export const ACCEPT =
  'audio/*,video/mp4,video/webm,video/quicktime,.mp3,.wav,.m4a,.aac,.ogg,.flac,.aiff,.webm,.mp4,.mov';

function nativeType(file) {
  const t = (file.type || '').split(';')[0].toLowerCase();
  if (NATIVE_TYPES[t]) return NATIVE_TYPES[t];
  if (!t) {
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (EXT_TYPES[ext]) return EXT_TYPES[ext];
  }
  return null;
}

/** 檢查檔案是否可處理，回傳錯誤訊息或 null */
export function validateFile(file) {
  const native = nativeType(file);
  if (native) {
    if (file.size > MAX_DIRECT_BYTES) return '檔案超過 2GB，請先分割後再上傳。';
    return null;
  }
  const t = (file.type || '').toLowerCase();
  const ext = (file.name || '').split('.').pop().toLowerCase();
  const maybeMedia = t.startsWith('audio/') || t.startsWith('video/') || ['m4a', 'webm', 'mp4', 'mov', 'opus'].includes(ext);
  if (!maybeMedia) return '這不是音訊或影片檔，請改選 mp3、wav、m4a 等格式。';
  if (file.size > MAX_CONVERT_BYTES)
    return `此格式（${ext || t}）需要在瀏覽器內轉檔，上限 200MB。請先轉成 mp3 再上傳。`;
  return null;
}

/** 回傳可直接送出的 { blob, mimeType, converted } */
export async function prepareAudio(file) {
  const native = nativeType(file);
  if (native) return { blob: file, mimeType: native, converted: false };
  const wav = await convertToWav(file);
  return { blob: wav, mimeType: 'audio/wav', converted: true };
}

async function convertToWav(file, sampleRate = 16000) {
  const buf = await file.arrayBuffer();
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(1, 1, sampleRate);
  let audio;
  try {
    audio = await ctx.decodeAudioData(buf);
  } catch {
    throw new Error('瀏覽器無法解碼這個檔案，請先轉成 mp3 或 wav 再試。');
  }
  // 混成單聲道
  const len = audio.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += data[i] / audio.numberOfChannels;
  }
  return encodeWav(mono, audio.sampleRate);
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o, s) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export function formatBytes(n) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
