import { GoogleGenAI, Type } from '@google/genai';
import { DEFAULT_MODEL, withRetry } from './gemini.js';
import { clock, toTimeline } from './format.js';

const INSTRUCTION = `你是一位專業的會議記錄秘書，負責把會議逐字稿整理成正式的會議記錄。
規則：
1. 只能根據逐字稿內容整理，不可編造逐字稿沒有提到的資訊。
2. 一律使用臺灣繁體中文，用詞精簡、正式，去除口語贅字。
3. title：依內容取一個簡短的會議名稱（15 字內）。
4. summary：用 2～4 句話總結這場會議。
5. attendees：逐字稿中明確出現的與會者名字或講者標籤；沒有就回傳空陣列。
6. topics：依討論主題分組，每個主題列出 1～5 個重點。
7. decisions：會議中已經確定的決議；沒有就回傳空陣列。
8. actions：待辦事項。owner 為負責人、due 為期限，逐字稿沒提到就填「未提及」。
9. nextMeeting：下次會議時間或安排；沒提到就填空字串。`;

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
    attendees: { type: Type.ARRAY, items: { type: Type.STRING } },
    topics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          points: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['title', 'points'],
      },
    },
    decisions: { type: Type.ARRAY, items: { type: Type.STRING } },
    actions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          task: { type: Type.STRING },
          owner: { type: Type.STRING },
          due: { type: Type.STRING },
        },
        required: ['task', 'owner', 'due'],
        propertyOrdering: ['task', 'owner', 'due'],
      },
    },
    nextMeeting: { type: Type.STRING },
  },
  required: ['title', 'summary', 'attendees', 'topics', 'decisions', 'actions', 'nextMeeting'],
  propertyOrdering: ['title', 'summary', 'attendees', 'topics', 'decisions', 'actions', 'nextMeeting'],
};

export async function generateMinutes({ apiKey, model, segments, signal }) {
  const ai = new GoogleGenAI({ apiKey });
  const res = await withRetry(
    () =>
      ai.models.generateContent({
        model: model || DEFAULT_MODEL,
        contents: `以下是會議逐字稿，請整理成會議記錄：\n\n${toTimeline(segments)}`,
        config: {
          systemInstruction: INSTRUCTION,
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          abortSignal: signal,
        },
      }),
    { signal }
  );
  let m;
  try {
    m = JSON.parse(res.text);
  } catch {
    throw new Error('AI 回傳的格式不完整，請再試一次。');
  }
  return {
    title: m.title || '會議記錄',
    summary: m.summary || '',
    attendees: m.attendees || [],
    topics: (m.topics || []).filter((t) => t.points?.length),
    decisions: m.decisions || [],
    actions: m.actions || [],
    nextMeeting: m.nextMeeting || '',
  };
}

/** 會議記錄 → 純文字（複製、下載 .txt 用） */
export function minutesToText(m, meta) {
  const L = [];
  L.push(`【${m.title}】`);
  L.push(`日期：${meta.date}　錄音長度：${clock(meta.duration, false)}`);
  if (m.attendees.length) L.push(`與會者：${m.attendees.join('、')}`);
  L.push('', '一、會議摘要', m.summary);
  if (m.topics.length) {
    L.push('', '二、討論重點');
    m.topics.forEach((t, i) => {
      L.push(`${i + 1}. ${t.title}`);
      t.points.forEach((p) => L.push(`   ・${p}`));
    });
  }
  L.push('', '三、決議事項');
  L.push(...(m.decisions.length ? m.decisions.map((d, i) => `${i + 1}. ${d}`) : ['（無）']));
  L.push('', '四、待辦事項');
  L.push(
    ...(m.actions.length
      ? m.actions.map((a, i) => `${i + 1}. ${a.task}（負責人：${a.owner}；期限：${a.due}）`)
      : ['（無）'])
  );
  if (m.nextMeeting) L.push('', `下次會議：${m.nextMeeting}`);
  return L.join('\n');
}
