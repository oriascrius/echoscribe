import { GoogleGenAI, Type, createPartFromUri } from '@google/genai';
import { parseTime } from './format.js';

// 小於此大小直接內嵌在請求中（base64 會膨脹約 33%，Gemini 內嵌上限 20MB）
const INLINE_LIMIT = 14 * 1024 * 1024;

export const DEFAULT_MODEL = 'gemini-flash-latest';

const LANG_RULES = {
  'zh-TW': '輸出一律使用臺灣繁體中文與臺灣慣用語；若講者說英文或其他語言，保留原文。',
  en: 'Output in English. Keep other languages as spoken.',
  auto: '使用講者實際說的語言輸出，不要翻譯；中文一律使用臺灣繁體中文。',
};

function buildInstruction({ language, polish, speakers }) {
  return `你是一位資深的逐字稿編輯，負責把音訊精準轉成文字。
規則：
1. ${LANG_RULES[language] || LANG_RULES['zh-TW']}
2. ${
    polish
      ? '修正同音錯別字與斷詞錯誤，刪除無意義的口頭禪與重複（例如「嗯」「呃」「那個那個」），補上正確標點；不可增刪任何實質內容。'
      : '逐字忠實轉錄，保留口頭禪與重複，只補上正確標點。'
  }
3. 依停頓或語句切成段落，每段約 1～2 句、5～15 秒。
4. start、end 為該段在音訊中的開始與結束時間，格式 HH:MM:SS，時間必須遞增且不得超過音訊長度。
5. ${
    speakers
      ? 'speaker 填寫講者標籤：依聲音區分為「講者 A」「講者 B」…；若對話中明確提到名字，可改用名字。'
      : 'speaker 一律留空字串。'
  }
6. 只轉錄實際聽到的語音，聽不清楚的部分以「（聽不清）」標示，不要猜測或補寫；沒有語音的片段略過。`;
}

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          start: { type: Type.STRING },
          end: { type: Type.STRING },
          speaker: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ['start', 'end', 'text'],
        propertyOrdering: ['start', 'end', 'speaker', 'text'],
      },
    },
  },
  required: ['segments'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * 轉錄音訊
 * onStage(stage): 'upload' | 'processing' | 'transcribe'
 */
export async function transcribeAudio({ apiKey, model, blob, mimeType, options, onStage, signal }) {
  const ai = new GoogleGenAI({ apiKey });
  let uploaded = null;
  let audioPart;

  try {
    onStage('upload');
    if (blob.size <= INLINE_LIMIT) {
      audioPart = { inlineData: { mimeType, data: await blobToBase64(blob) } };
    } else {
      uploaded = await ai.files.upload({ file: blob, config: { mimeType } });
      checkAbort(signal);
      onStage('processing');
      let f = uploaded;
      while (f.state === 'PROCESSING') {
        await sleep(2500);
        checkAbort(signal);
        f = await ai.files.get({ name: uploaded.name });
      }
      if (f.state === 'FAILED') throw new Error('Google 端無法處理此音訊，請確認檔案沒有損壞。');
      audioPart = createPartFromUri(f.uri, f.mimeType);
    }
    checkAbort(signal);

    onStage('transcribe');
    const res = await ai.models.generateContent({
      model: model || DEFAULT_MODEL,
      contents: [{ role: 'user', parts: [audioPart, { text: '請轉錄這段音訊。' }] }],
      config: {
        systemInstruction: buildInstruction(options),
        temperature: 0.2,
        maxOutputTokens: 65536,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
        abortSignal: signal,
      },
    });

    const finish = res.candidates?.[0]?.finishReason;
    if (finish === 'MAX_TOKENS')
      throw new Error('音訊太長，逐字稿超過單次輸出上限而被截斷。請把檔案切成 30～60 分鐘一段再轉錄。');
    if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT')
      throw new Error('內容被 Gemini 的安全機制擋下，無法轉錄。');

    let data;
    try {
      data = JSON.parse(res.text);
    } catch {
      throw new Error('AI 回傳的格式不完整，請再試一次。');
    }
    const segments = (data.segments || [])
      .map((s) => ({
        start: parseTime(s.start),
        end: parseTime(s.end),
        speaker: (s.speaker || '').trim(),
        text: (s.text || '').trim(),
      }))
      .filter((s) => s.text);
    // 修正不合理的時間（end < start）
    segments.forEach((s, i) => {
      if (!(s.end > s.start)) s.end = segments[i + 1]?.start ?? s.start + 3;
    });
    if (!segments.length) throw new Error('沒有辨識到任何語音，請確認音訊裡有人聲。');
    return segments;
  } finally {
    if (uploaded) ai.files.delete({ name: uploaded.name }).catch(() => {});
  }
}

/** 把 SDK 錯誤轉成看得懂的中文 */
export function friendlyError(err) {
  if (err?.name === 'AbortError') return null;
  const msg = String(err?.message || err);
  const status = err?.status;
  if (status === 400 && /API key/i.test(msg)) return 'API 金鑰無效，請到右上角「設定」重新輸入。';
  if (status === 401 || status === 403) return 'API 金鑰沒有權限，請確認金鑰正確且已啟用 Gemini API。';
  if (status === 404) return '找不到指定的模型，請到「設定」改回預設模型。';
  if (status === 429)
    return '已達 Gemini 使用量上限。免費版每分鐘 5 次、每天 20 次：每分鐘的限制約 1 分鐘後恢復，每日的限制在臺灣時間下午 3～4 點重置。檔案太長（超過約 2 小時）也會出現這個錯誤。';
  if (status >= 500) return 'Google 伺服器暫時忙碌，請稍候再試。';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return '網路連線失敗，請檢查網路後再試。';
  return msg;
}
