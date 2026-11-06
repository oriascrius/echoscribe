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

  return pack({ Document, Packer }, title, children);
}

const STYLES = {
  default: {
    document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: 360 } } },
    heading1: { run: { font: FONT, size: 36, bold: true }, paragraph: { spacing: { after: 120 } } },
    heading2: { run: { font: FONT, size: 28, bold: true, color: ACCENT }, paragraph: { spacing: { before: 280, after: 120 } } },
  },
};

function pack({ Document, Packer }, title, children) {
  const doc = new Document({ creator: 'EchoScribe', title, styles: STYLES, sections: [{ children }] });
  return Packer.toBlob(doc);
}

/** 會議記錄 Word 檔 */
export async function buildMinutesDocx(m, meta) {
  const d = await import('docx');
  const { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } = d;

  const p = (text, opts = {}) => new Paragraph({ spacing: { after: 100 }, ...opts, children: [new TextRun({ text, ...(opts.run || {}) })] });
  const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
  const bullet = (text) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun(text)] });
  const numbered = (items) => items.map((t, i) => p(`${i + 1}. ${t}`));

  const children = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: m.title, color: '4B443D' })] }),
    p(`日期：${meta.date}　錄音長度：${clock(meta.duration, false)}`, { run: { color: MUTED, size: 20 } }),
  ];
  if (m.attendees.length) children.push(p(`與會者：${m.attendees.join('、')}`, { run: { color: MUTED, size: 20 } }));

  children.push(h2('一、會議摘要'), p(m.summary));

  if (m.topics.length) {
    children.push(h2('二、討論重點'));
    m.topics.forEach((t, i) => {
      children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: `${i + 1}. ${t.title}`, bold: true })] }));
      t.points.forEach((pt) => children.push(bullet(pt)));
    });
  }

  children.push(h2('三、決議事項'), ...(m.decisions.length ? numbered(m.decisions) : [p('（無）')]));

  children.push(h2('四、待辦事項'));
  if (m.actions.length) {
    const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9CEBF' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const cell = (text, w, head) =>
      new TableCell({
        width: { size: w, type: WidthType.PERCENTAGE },
        borders,
        shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EDE6DC' } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text, bold: !!head })] })],
      });
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: [cell('事項', 60, true), cell('負責人', 20, true), cell('期限', 20, true)] }),
          ...m.actions.map((a) => new TableRow({ children: [cell(a.task, 60), cell(a.owner, 20), cell(a.due, 20)] })),
        ],
      })
    );
  } else {
    children.push(p('（無）'));
  }

  if (m.nextMeeting) children.push(h2('下次會議'), p(m.nextMeeting));

  return pack(d, m.title, children);
}
