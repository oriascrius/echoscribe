import { clock, hasSpeakers, toPlain } from './format.js';

const FONT = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Microsoft JhengHei' };
const MUTED = '8A8076';
const ACCENT = '8B7868';

/**
 * 產生 Word 逐字稿
 * view: 'plain'（段落）或 'timeline'（每段附時間）
 */
export async function buildDocx({ name, segments, view, createdAt }) {
  // docx 套件較大，按下按鈕才載入
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

  const title = name.replace(/\.[^.]+$/, '');
  const duration = segments.at(-1)?.end || 0;
  const date = new Date(createdAt || Date.now()).toLocaleString('zh-TW', { hour12: false });
  const speakers = hasSpeakers(segments);

  const children = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: title, color: '4B443D' })] }),
    new Paragraph({
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: `轉錄時間：${date}　長度：${clock(duration, false)}　共 ${segments.length} 段`,
          color: MUTED,
          size: 20,
        }),
      ],
    }),
  ];

  if (view === 'timeline') {
    for (const s of segments) {
      const runs = [new TextRun({ text: `[${clock(s.start)}]  `, color: MUTED, size: 20 })];
      if (s.speaker) runs.push(new TextRun({ text: `${s.speaker}：`, bold: true, color: ACCENT }));
      runs.push(new TextRun({ text: s.text }));
      children.push(new Paragraph({ spacing: { after: 120 }, children: runs }));
    }
  } else {
    for (const para of toPlain(segments).split('\n\n')) {
      const runs = [];
      const idx = speakers ? para.indexOf('：') : -1;
      if (idx > 0) {
        runs.push(new TextRun({ text: para.slice(0, idx + 1), bold: true, color: ACCENT }));
        runs.push(new TextRun({ text: para.slice(idx + 1) }));
      } else {
        runs.push(new TextRun({ text: para }));
      }
      children.push(new Paragraph({ spacing: { after: 200 }, children: runs }));
    }
  }

  const doc = new Document({
    creator: 'EchoScribe',
    title,
    styles: {
      default: {
        document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: 360 } } },
        heading1: { run: { font: FONT, size: 36, bold: true }, paragraph: { spacing: { after: 120 } } },
      },
    },
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}
