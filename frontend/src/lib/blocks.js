// Markdown <-> blok ala Gutenberg
let seq = 1;
const nid = () => 'b' + (seq++) + Date.now().toString(36);

// Bersihkan format markdown mentah di sel tabel agar editor tidak menampilkan **bold** / <br>
const cleanCell = (c) => String(c || '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/__(.+?)__/g, '$1')
  .replace(/\*(.+?)\*/g, '$1')
  .replace(/`(.+?)`/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

export function mdToBlocks(md, lookup = []) {
  const blocks = [];
  const lines = (md || '').split('\n');
  let i = 0;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ id: nid(), type: 'p', text: para.join('\n').trim() });
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    let m;

    if (!t) { flushPara(); i++; continue; }

    if ((m = t.match(/^#\s+(.*)/))) { flushPara(); blocks.push({ id: nid(), type: 'title', text: m[1] }); }
    else if ((m = t.match(/^##\s+(.*)/))) { flushPara(); blocks.push({ id: nid(), type: 'h2', text: m[1] }); }
    else if ((m = t.match(/^###\s+(.*)/))) { flushPara(); blocks.push({ id: nid(), type: 'h3', text: m[1] }); }
    else if ((m = t.match(/^####\s+(.*)/))) { flushPara(); blocks.push({ id: nid(), type: 'h4', text: m[1] }); }
    else if (/^---+$/.test(t)) { flushPara(); blocks.push({ id: nid(), type: 'hr' }); }
    else if (/^\|.*\|$/.test(t)) {
      flushPara();
      const rows = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        const cells = lines[i].trim().slice(1, -1).split('|').map((c) => cleanCell(c));
        if (!/^-+/.test(cells[0].replace(/:/g, ''))) rows.push(cells);
        i++;
      }
      if (rows.length) blocks.push({ id: nid(), type: 'table', rows });
      continue;
    }
    else if ((m = t.match(/^(\s*)[-*]\s+(.*)/))) {
      flushPara();
      const items = [];
      while (i < lines.length) {
        const lm = lines[i].match(/^(\s*)[-*]\s+(.*)/);
        if (!lm) break;
        items.push({ depth: Math.min(2, Math.floor(lm[1].length / 2)), text: lm[2] });
        i++;
      }
      blocks.push({ id: nid(), type: 'ul', items });
      continue;
    }
    else if ((m = t.match(/^(\s*)\d+[.)]\s+(.*)/))) {
      flushPara();
      const items = [];
      while (i < lines.length) {
        const lm = lines[i].match(/^(\s*)\d+[.)]\s+(.*)/);
        if (!lm) break;
        // sub-item huruf (a. b.) -> depth 1
        const lm2 = lines[i].match(/^(\s*)[a-z][.)]\s+(.*)/);
        items.push({ depth: Math.min(2, Math.floor(lm[1].length / 2)), text: lm[2] });
        i++;
      }
      blocks.push({ id: nid(), type: 'ol', items });
      continue;
    }
    else if ((m = t.match(/^(\s*)[a-z][.)]\s+(.*)/))) {
      flushPara();
      const items = [];
      while (i < lines.length) {
        const lm = lines[i].match(/^(\s*)[a-z][.)]\s+(.*)/);
        if (!lm) break;
        items.push({ depth: 0, text: lm[2] });
        i++;
      }
      blocks.push({ id: nid(), type: 'ol-alpha', items });
      continue;
    }
    else if ((m = t.match(/^!\[(.*?)\]\(fig:(.*?)\)/))) {
      flushPara();
      const [url, w] = m[2].split('#w=');
      const found = (lookup || []).find((x) => x.thumbUrl === url) || {};
      blocks.push({ id: nid(), type: 'fig', ...found, caption: m[1] || found.caption || '', thumbUrl: url, dsize: parseInt(w, 10) || found.dsize || 560 });
    }
    else if ((m = t.match(/^!\[(.*?)\]\((.*?)\)/))) { flushPara(); blocks.push({ id: nid(), type: 'img', caption: m[1], url: m[2] }); }
    else para.push(line);
    i++;
  }
  flushPara();
  return blocks;
}

export function blocksToMd(blocks) {
  const out = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'title': out.push('# ' + b.text); break;
      case 'h2': out.push('## ' + b.text); break;
      case 'h3': out.push('### ' + b.text); break;
      case 'h4': out.push('#### ' + b.text); break;
      case 'hr': out.push('---'); break;
      case 'p': out.push(b.text); break;
      case 'ul':
        out.push(b.items.map((it) => '  '.repeat(it.depth) + '- ' + it.text).join('\n'));
        break;
      case 'ol':
        out.push(b.items.map((it, ix) => '  '.repeat(it.depth) + (ix + 1) + '. ' + it.text).join('\n'));
        break;
      case 'ol-alpha':
        out.push(b.items.map((it, ix) => String.fromCharCode(97 + ix) + '. ' + it.text).join('\n'));
        break;
      case 'table': {
        const cols = Math.max(...b.rows.map((r) => r.length));
        const norm = b.rows.map((r) => { const c = [...r]; while (c.length < cols) c.push(''); return c; });
        out.push('| ' + norm[0].join(' | ') + ' |');
        out.push('|' + norm[0].map(() => '---').join('|') + '|');
        norm.slice(1).forEach((r) => out.push('| ' + r.join(' | ') + ' |'));
        break;
      }
      case 'img': out.push(`![${b.caption || ''}](${b.url})`); break;
      case 'fig': out.push(`![${b.caption || b.title || ''}](fig:${b.thumbUrl}#w=${b.dsize || 560})`); break;
    }
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}

// Blok gambar referensi (Wikimedia) -> gambar DB
export function figToImage(b) {
  return { title: b.title, thumbUrl: b.thumbUrl, fullUrl: b.fullUrl, width: b.width, height: b.height, caption: b.caption, artist: b.artist, license: b.license, pageUrl: b.pageUrl };
}

export const BLOCK_LABEL = {
  title: 'Judul', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4',
  p: 'Paragraf', ul: 'Bullet list', ol: 'Numbering', 'ol-alpha': 'Huruf (a, b)',
  table: 'Tabel', img: 'Gambar', fig: 'Gambar Referensi', hr: 'Pemisah',
};
