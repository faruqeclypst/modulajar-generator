import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, Footer, Header, PageNumber, ImageRun,
  ShadingType, TableBorders, BorderStyle,
} from 'docx';
import { splitInfoUmum, buangJudulGanda, rapikanIdentitas } from './api';
import { ekstrakPengesahan, buangPengesahan } from './pengesahan';
import { DOC_TYPES } from './docs';

const FONT = 'Times New Roman';

// Margin halaman standar dokumen resmi Indonesia: atas 3cm, kiri 4cm, bawah 3cm, kanan 3cm
const MARGIN = { top: 1701, left: 2268, bottom: 1701, right: 1701 };

const BORDER_HITAM = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const TABEL_BORDER = {
  top: BORDER_HITAM, bottom: BORDER_HITAM, left: BORDER_HITAM, right: BORDER_HITAM,
  insideHorizontal: BORDER_HITAM, insideVertical: BORDER_HITAM,
};
const TANPA_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};
const SEL_MARGIN = { top: 60, bottom: 60, left: 120, right: 120 };

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
    borders: TABEL_BORDER,
    rows: norm.map((r, ri) =>
      new TableRow({
        cantSplit: true, // baris tabel tidak terbelah halaman
        children: r.map((c) =>
          new TableCell({
            margins: SEL_MARGIN,
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
    else if (/^---+$/.test(t)) out.push(new Paragraph({ thematicBreak: true, spacing: { before: 200, after: 200 } }));
    else out.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 160 }, children: inlineRuns(t) }));
    i++;
  }
  return out;
}

function infoTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABEL_BORDER,
    rows: rows.map(([k, v]) =>
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 32, type: WidthType.PERCENTAGE },
            margins: SEL_MARGIN,
            shading: { type: ShadingType.CLEAR, fill: '1B1B1A' },
            children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, font: FONT, size: 22, color: 'FFFFFF' })] })],
          }),
          new TableCell({ margins: SEL_MARGIN, children: [new Paragraph({ children: inlineRuns(v || '-', 22) })] }),
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

// Blok "Lembar Pengesahan" resmi untuk Word: judul + pengantar + sekolah
// + tabel 2 kolom tanpa garis (ruang tanda tangan di tengah).
function blokPengesahan(sah) {
  const out = [];
  const sel = (text, { bold = false, underline = false, keepNext = false } = {}) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          keepNext,
          children: [
            new TextRun({
              text: text || '', bold, font: FONT, size: 24,
              ...(underline ? { underline: {} } : {}),
            }),
          ],
        }),
      ],
    });
  const baris = (a, b, opt) =>
    new TableRow({ cantSplit: true, children: [sel(a, opt), sel(b, opt)] });

  out.push(heading('LEMBAR PENGESAHAN', HeadingLevel.HEADING_1, 28, 480));
  if (sah.intro) {
    out.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 160 },
      children: inlineRuns(sah.intro),
    }));
  }
  if (sah.sekolah) {
    out.push(new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({ text: 'Sekolah: ', bold: true, font: FONT, size: 24 }),
        new TextRun({ text: sah.sekolah, font: FONT, size: 24 }),
      ],
    }));
  }
  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: TANPA_BORDER,
      rows: [
        baris(sah.kiri.atas, sah.kanan.atas, { keepNext: true }),
        baris(sah.kiri.jabatan, sah.kanan.jabatan, { bold: true, keepNext: true }),
        // ruang tanda tangan (~2,5 cm)
        new TableRow({
          cantSplit: true,
          children: [0, 1].map(() =>
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ spacing: { before: 1300 }, children: [] })],
            })
          ),
        }),
        baris(sah.kiri.nama, sah.kanan.nama, { bold: true, underline: true, keepNext: true }),
        baris(sah.kiri.nip, sah.kanan.nip, {}),
      ],
    })
  );
  return out;
}

// Bangun objek Document (murni, tanpa DOM) agar bisa diuji lewat Node.
export async function buildDocxDocument({ judul, docType = 'modul', markdown, images = [] }) {
  const typeName = (DOC_TYPES[docType] || {}).nama || 'Dokumen Ajar';
  const { infoRows, rest } = splitInfoUmum(rapikanIdentitas(markdown || ''));
  const sah = ekstrakPengesahan(rest);
  const body = buangJudulGanda(sah ? buangPengesahan(rest) : rest, judul || typeName);
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

  // Lembar pengesahan selalu terakhir, dirender resmi (bukan tabel mentah)
  if (sah) children.push(...blokPengesahan(sah));

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 24 } },
        heading1: { run: { font: FONT, size: 28, bold: true } },
        heading2: { run: { font: FONT, size: 26, bold: true } },
        heading3: { run: { font: FONT, size: 24, bold: true } },
        heading4: { run: { font: FONT, size: 22, bold: true } },
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
        page: { size: { width: 11906, height: 16838 }, margin: MARGIN },
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

  return doc;
}

export async function exportDocx(opts) {
  const { judul, docType = 'modul' } = opts || {};
  const typeName = (DOC_TYPES[docType] || {}).nama || 'Dokumen Ajar';
  const doc = await buildDocxDocument(opts);
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
