import { toPlain } from './format.js';

// 會議記錄改為「複製提示詞到免費 AI 聊天」，不使用 API 額度

export const DEFAULT_PROMPT = `請根據以下會議逐字稿，整理成正式的會議記錄，使用臺灣繁體中文，格式如下：

【會議名稱】（依內容取一個簡短名稱）
一、會議摘要（2～4 句）
二、討論重點（依主題分組條列）
三、決議事項
四、待辦事項（以表格呈現：事項／負責人／期限；逐字稿沒提到的寫「未提及」）
五、下次會議（沒提到就省略）

規則：
- 只根據逐字稿內容整理，不要編造沒有提到的資訊。
- 去除口語贅字，用詞精簡正式。`;

export const CHAT_LINKS = [
  ['Gemini', 'https://gemini.google.com/app'],
  ['ChatGPT', 'https://chatgpt.com/'],
  ['Claude', 'https://claude.ai/new'],
];

export function buildChatText(prompt, segments) {
  return `${prompt.trim()}\n\n===== 會議逐字稿 =====\n\n${toPlain(segments)}`;
}
