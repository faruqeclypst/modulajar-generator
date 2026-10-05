import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, Footer, Header, PageNumber, ImageRun,
  ShadingType,
} from 'docx';
import { splitInfoUmum, buangJudulGanda, rapikanIdentitas } from './api';
import { DOC_TYPES } from './docs';

const FONT = 'Times New Roman';

function inlineRuns(text, size = 24) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => {
    const m = p.match(/^\*\*(.+)\*\*$/s);
    return new TextRun({ text: (m ? m[1] : p).replace(/\*/g, ''), bold: !!m, font: FONT, size });
  });
}

function heading(text, level, size, before = 360) {
  return new Paragraph({
    heading: level,
    keepNext: true, // heading tidak terpisah dari isi di bawahnya
    spacing: { before, after: 160 },
    children: [new TextRun({ text: String(text).replace(/\*/g, ''), bold: true, font: FONT, size })],
  });
}

function mdTable(lines) {
  // lines: array baris tabel markdown (sudah difilter dari separator)
  const rows = lines.map((l) => l.trim().slice(1, -1).split('|').map((c) => c.trim()));
  const cols = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => { const c = [...r]; while (c.length < cols) c.push(''); return c; });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: norm.map((r, ri) =>
      new TableRow({
        cantSplit: true, // baris tabel tidak terbelah halaman
        children: r.map((c) =>
          new TableCell({
            shading: ri === 0 ? { type: ShadingType.CLEAR, fill: '1B1B1A' } : undefined,
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: c.replace(/\*\*/g, ''), bold: ri === 0, font: FONT, size: 20,
                    color: ri === 0 ? 'FFFFFF' : undefined,
                  }),
                ],
              }),
            ],
          })
        ),
      })
    ),
  });
}

function mdToParagraphs(md, imgMap = {}) {
  const out = [];
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    const t = line.trim();
    if (!t) { i++; continue; }
    let m;

    // gambar inline ![caption](fig:url)
    if ((m = t.match(/^!\[([^\]]*)\]\(fig:([^)]+)\)/))) {
      const img = imgMap[m[2]];
      if (img) {
        const maxW = img.maxW || 560;
        const scale = Math.min(1, maxW / (img.width || maxW));
        out.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          keepNext: true, // gambar tidak terpisah dari caption
          spacing: { before: 240, after: 120 },
          children: [new ImageRun({ data: img.data, transformation: { width: Math.round((img.width || 560) * scale), height: Math.round((img.height || 420) * scale) }, type: img.type })],
        }));
        out.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          keepLines: true,
          spacing: { after: 240 },
          children: [
            new TextRun({ text: img.caption || 'Gambar referensi', bold: true, font: FONT, size: 20 }),
            new TextRun({ text: '\n' + img.credit, font: FONT, size: 18, color: '555555' }),
          ],
        }));
      }
      i++;
      continue;
    }

    // tabel markdown
    if (/^\|.*\|$/.test(t)) {
      const tbl = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        const cells = lines[i].trim().slice(1, -1).split('|').map((c) => c.trim());
        if (!/^-+$/.test(cells[0].replace(/:/g, ''))) tbl.push(lines[i]);
        i++;
      }
      if (tbl.length) {
        out.push(new Paragraph({ spacing: { before: 160, after: 160 }, children: [] }));
        out.push(mdTable(tbl));
        out.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
      }
      continue;
    }

    if ((m = t.match(/^####\s+(.*)/))) out.push(heading(m[1], HeadingLevel.HEADING_4, 24, 240));
    else if ((m = t.match(/^###\s+(.*)/))) out.push(heading(m[1], HeadingLevel.HEADING_3, 26, 280));
    else if ((m = t.match(/^##\s+(.*)/))) out.push(heading(m[1], HeadingLevel.HEADING_2, 28, 320));
    else if ((m = t.match(/^#\s+(.*)/))) { /* judul di halaman judul */ }
    else if ((m = t.match(/^(\s*)[-*]\s+(.*)/))) {
      const depth = Math.min(2, Math.floor(m[1].length / 2));
      out.push(new Paragraph({ bullet: { level: depth }, spacing: { after: 80 }, children: inlineRuns(m[2]) }));
    }
    else if ((m = t.match(/^(\s*)\d+[.)]\s+(.*)/))) {
      const depth = Math.min(2, Math.floor(m[1].length / 2));
      out.push(new Paragraph({ numbering: { reference: 'num-dec', level: depth }, spacing: { after: 80 }, children: inlineRuns(m[2]) }));
    }
    else if ((m = t.match(/^(\s*)[a-z][.)]\s+(.*)/))) {
      const depth = Math.min(2, Math.floor(m[1].length / 2));
      out.push(new Paragraph({ numbering: { reference: 'num-alpha', level: depth }, spacing: { after: 80 }, children: inlineRuns(m[2]) }));
    }
    else if (/^---+$/.test(t)) out.push(new Paragraph({ spacing: { before: 200, after: 200 }, children: [] }));
    else out.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 160 }, children: inlineRuns(t) }));
    i++;
  }
  return out;
}

function infoTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([k, v]) =>
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 32, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: '1B1B1A' },
            children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, font: FONT, size: 22, color: 'FFFFFF' })] })],
          }),
          new TableCell({ children: [new Paragraph({ children: inlineRuns(v || '-', 22) })] }),
        ],
      })
    ),
  });
}

function detectImgType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return null;
}

async function fetchImageBytes(thumbUrl) {
  try {
    const r = await fetch('/api/gambar-proxy?url=' + encodeURIComponent(thumbUrl));
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    const type = detectImgType(buf);
    if (!type || buf.length > 8 * 1024 * 1024) return null;
    return { data: buf, type };
  } catch { return null; }
}

export async function exportDocx({ judul, docType = 'modul', markdown, images = [] }) {
  const typeName = (DOC_TYPES[docType] || {}).nama || 'Dokumen Ajar';
  const { infoRows, rest } = splitInfoUmum(rapikanIdentitas(markdown || ''));
  const body = buangJudulGanda(rest, judul || typeName);
  const children = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: typeName.toUpperCase() + ' \u2022 KURIKULUM MERDEKA', font: FONT, size: 20, color: '555555' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: judul || typeName, bold: true, font: FONT, size: 32 })],
    })
  );

  if (infoRows.length > 0) {
    children.push(heading('Informasi Umum', HeadingLevel.HEADING_1, 28, 120));
    children.push(infoTable(infoRows));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  // petakan gambar inline ![cap](fig:url) -> bytes, agar tersisip di posisinya
  const imgMap = {};
  const inlineUrls = new Set();
  const figUrls = [...new Set([...body.matchAll(/!\[[^\]]*\]\(fig:([^)]+)\)/g)].map((m) => m[1]))];
  for (const raw of figUrls) {
    const [url, w] = raw.split('#w=');
    const dsize = parseInt(w, 10) || 560;
    const g = (images || []).find((x) => x.thumbUrl === url) || {};
    const fetched = await fetchImageBytes(url);
    if (fetched) {
      inlineUrls.add(url);
      imgMap[raw] = {
        ...fetched,
        width: g.width, height: g.height,
        maxW: dsize,
        caption: g.caption || g.title || 'Gambar referensi',
        credit: `Sumber: Wikimedia Commons${g.artist ? ', ' + g.artist : ''} (${g.license || 'CC'})`,
      };
    }
  }

  children.push(...mdToParagraphs(body, imgMap));

  const gallery = (images || []).filter((g) => !inlineUrls.has(g.thumbUrl));
  if (gallery.length > 0) {
    children.push(heading('Gambar Referensi', HeadingLevel.HEADING_1, 28, 320));
    let n = 0;
    for (const g of gallery) {
      n++;
      const img = await fetchImageBytes(g.thumbUrl);
      if (img) {
        const maxW = 560;
        const scale = Math.min(1, maxW / (g.width || maxW));
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            keepNext: true, // gambar tidak terpisah dari caption
            spacing: { before: 240, after: 120 },
            children: [new ImageRun({ data: img.data, transformation: { width: Math.round((g.width || 560) * scale), height: Math.round((g.height || 420) * scale) }, type: img.type })],
          })
        );
      }
      children.push(
        new Paragraph({ alignment: AlignmentType.CENTER, keepLines: true, spacing: { after: 60 }, children: [new TextRun({ text: `Gambar ${n}. ${g.caption || g.title}`, italic: true, font: FONT, size: 20 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, keepLines: true, spacing: { after: 240 }, children: [new TextRun({ text: `Sumber: Wikimedia Commons${g.artist ? ', ' + g.artist : ''} (${g.license || 'CC'})`, font: FONT, size: 18, color: '666666' })] })
      );
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 24 } },
        heading1: { run: { font: FONT, size: 28, bold: true } },
        heading2: { run: { font: FONT, size: 26, bold: true } },
      },
    },
    numbering: {
      config: [
        { reference: 'num-dec', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT }, { level: 1, format: 'lowerLetter', text: '%2.', alignment: AlignmentType.LEFT }, { level: 2, format: 'decimal', text: '%3.', alignment: AlignmentType.LEFT }] },
        { reference: 'num-alpha', levels: [{ level: 0, format: 'lowerLetter', text: '%1.', alignment: AlignmentType.LEFT }, { level: 1, format: 'lowerLetter', text: '%2.', alignment: AlignmentType.LEFT }, { level: 2, format: 'lowerLetter', text: '%3.', alignment: AlignmentType.LEFT }] },
      ],
    },
    sections: [{
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: typeName + ' \u2014 Kurikulum Merdeka', font: FONT, size: 18, color: '888888', italic: true })] })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Halaman ', font: FONT, size: 18, color: '666666' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: '666666' })] })],
        }),
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (judul || typeName).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80) + '.docx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
