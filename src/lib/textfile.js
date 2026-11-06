// 讀取使用者上傳的文字檔或 Word 檔，回傳純文字

export const TEXT_ACCEPT = '.txt,.md,.srt,.csv,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 20 * 1024 * 1024;

export async function readTextFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (file.size > MAX_BYTES) throw new Error('檔案超過 20MB，請改用較小的檔案。');
  if (ext === 'doc') throw new Error('不支援舊版 .doc，請用 Word 開啟後「另存新檔」成 .docx 再上傳。');
  if (ext === 'pdf') throw new Error('目前不支援 PDF，請複製 PDF 裡的文字後用「直接貼上」。');

  const text = ext === 'docx' ? await readDocx(file) : await readPlain(file);
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) throw new Error('檔案裡沒有讀到文字。');
  return cleaned;
}

// 先試 UTF-8，失敗再用 Big5（舊版 Windows 記事本常見）
async function readPlain(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('big5').decode(buf);
  }
}

async function readDocx(file) {
  const { default: JSZip } = await import('jszip');
  let zip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error('無法開啟這個 Word 檔，檔案可能已損壞或有密碼保護。');
  }
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('這不是有效的 Word（.docx）檔案。');

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paras = [];
  for (const p of doc.getElementsByTagNameNS(W, 'p')) {
    let line = '';
    const walk = (node) => {
      for (const n of node.childNodes) {
        if (n.namespaceURI !== W) { walk(n); continue; }
        if (n.localName === 't') line += n.textContent;
        else if (n.localName === 'tab') line += '\t';
        else if (n.localName === 'br' || n.localName === 'cr') line += '\n';
        else if (n.localName !== 'p') walk(n); // 巢狀段落（表格內）由外層迴圈處理
      }
    };
    walk(p);
    paras.push(line);
  }
  return paras.join('\n');
}
