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

// ───── AI 整理結果（純文字／Markdown）→ 正式會議紀錄 Word ─────

const OFFICIAL_FONT = { ascii: 'Times New Roman', hAnsi: 'Times New Roman', eastAsia: '標楷體' };
const SECTION_RE = /^(壹|貳|參|肆|伍|陸|柒|捌|玖|拾)、/;
const ITEM_RE = /^(議題[一二三四五六七八九十\d]+[：:]|[一二三四五六七八九十]+、)/;
const LABEL_RE = /^(說明(?:與補正項目)?[：:]|決議[：:]?)/;
const RULE_RE = /^\s*(?:-{3,}|_{3,}|\*{3,}|─{3,})\s*$/;

/** 移除 Markdown 標記，回傳 [{ text, bold }] */
function inlineRuns(text) {
  const runs = [];
  text.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (!part) return;
    const bold = /^\*\*[^*]+\*\*$/.test(part);
    runs.push({ text: (bold ? part.slice(2, -2) : part).replace(/(^|[^*])\*([^*]+)\*/g, '$1$2'), bold });
  });
  return runs;
}

/** 去掉 AI 結果最後的「修正說明」段落 */
export function stripCorrectionNotes(text) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => /^[#>*\s]*修正說明/.test(l.trim()));
  return (i >= 0 ? lines.slice(0, i) : lines).join('\n').replace(/[\s\-_*─]+$/, '');
}

export async function buildMinutesWord(rawText) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType } = d;

  const lines = rawText.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/^>\s?/, '').trimEnd());
  const runsOf = (text, forceBold) => inlineRuns(text).map((r) => new TextRun({ text: r.text, bold: forceBold || r.bold }));
  const para = (text, opts = {}, bold = false) => new Paragraph({ spacing: { after: 60 }, ...opts, children: runsOf(text, bold) });

  const children = [];
  let title = '';
  let i = 0;
  while (i < lines.length) {
    let l = lines[i].trim();
    if (!l) { i++; continue; }

    // Markdown 表格
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = lines[i].trim();
        if (!/^\|[\s:|-]+\|$/.test(row)) rows.push(row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i++;
      }
      const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
      const borders = { top: border, bottom: border, left: border, right: border };
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map((cells, r) => new TableRow({
          children: cells.map((c) => new TableCell({
            borders,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: runsOf(c, r === 0) })],
          })),
        })),
      }));
      children.push(new Paragraph({ children: [] }));
      continue;
    }
    i++;

    if (RULE_RE.test(l)) {
      children.push(new Paragraph({ spacing: { after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } }, children: [] }));
      continue;
    }

    const heading = l.match(/^(#{1,6})\s+/);
    if (heading) l = l.slice(heading[0].length);
    l = l.replace(/^[-*•]\s+/, '・');

    if (!title) {
      title = l.replace(/\*\*/g, '');
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: title, bold: true, size: 32 })] }));
      continue;
    }
    if (/^主席簽名/.test(l)) {
      children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 480 }, children: runsOf(l) }));
      continue;
    }
    if (SECTION_RE.test(l)) {
      const k = l.indexOf('：');
      children.push(new Paragraph({
        spacing: { before: 120, after: 60 },
        children: k > 0 ? [...runsOf(l.slice(0, k + 1), true), ...runsOf(l.slice(k + 1))] : runsOf(l, true),
      }));
      continue;
    }
    if (heading || ITEM_RE.test(l)) {
      children.push(para(l, { spacing: { before: 160, after: 60 } }, true));
      continue;
    }
    const label = l.match(LABEL_RE);
    if (label) {
      children.push(new Paragraph({ spacing: { after: 60 }, children: [...runsOf(label[1], true), ...runsOf(l.slice(label[1].length))] }));
      continue;
    }
    const indented = /^[\s　]/.test(lines[i - 1]) || /^(\d+[.、]|\(\d+\)|・)/.test(l);
    children.push(para(l, indented ? { indent: { left: 360 } } : {}));
  }

  const doc = new Document({
    creator: 'EchoScribe',
    title: title || '會議紀錄',
    styles: { default: { document: { run: { font: OFFICIAL_FONT, size: 24 }, paragraph: { spacing: { line: 360 } } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }],
  });
  return { blob: await Packer.toBlob(doc), title: title || '會議紀錄' };
}
