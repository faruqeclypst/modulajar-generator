import { getToken } from './supabase';

async function authHeaders() {
  const t = await getToken().catch(() => '');
  return t ? { Authorization: 'Bearer ' + t } : {};
}

export async function generateDoc(docType, info, materi, sumber, rekomendasi) {
  const body = { docType, info, materi, sumber };
  if (rekomendasi) body.rekomendasi = rekomendasi;
  const r = await fetch('/api/generate-doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw new Error(d.error || 'Gagal menghubungi AI.');
  return d.markdown;
}

// Generate dokumen dengan progress live via Server-Sent Events.
// onEvent menerima objek per baris "data:" dari backend:
//   { tipe:'tahap', key, label } | { tipe:'selesai', markdown } | { tipe:'gagal', error }
// Bila kuota habis (HTTP 402), throw Error dengan properti code='kuota_habis'
// dan detail berisi body JSON (butuh/sisa/batas).
export async function generateDocStream(docType, info, materi, sumber, rekomendasi, onEvent) {
  const body = { docType, info, materi, sumber };
  if (rekomendasi) body.rekomendasi = rekomendasi;
  const r = await fetch('/api/generate-doc/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    const err = new Error(d.error || 'Gagal menghubungi AI.');
    err.code = d.code;
    err.detail = d;
    throw err;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        const t = line.trim();
        if (t.startsWith('data:')) {
          try { onEvent(JSON.parse(t.slice(5).trim())); }
          catch { /* baris rusak, abaikan */ }
        }
      }
    }
  }
}

export async function regenBlock(docType, blockType, blockText, docTitle, topic) {
  const r = await fetch('/api/regen-block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ docType, blockType, blockText, docTitle, topic }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw new Error(d.error || 'Gagal regenerate blok.');
  return d.text;
}

export async function rekomendasiAI({ jenjang, fase, mapel, topik }) {
  const r = await fetch('/api/rekomendasi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ jenjang, fase, mapel, topik }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw new Error(d.error || 'Gagal meminta rekomendasi.');
  return d.rekomendasi;
}

export async function fetchGambar(query) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search',
    gsrsearch: query + ' filetype:bitmap', gsrnamespace: '6', gsrlimit: '12',
    prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '900',
    origin: '*',
  });
  const r = await fetch('https://commons.wikimedia.org/w/api.php?' + params);
  if (!r.ok) throw new Error('Layanan gambar sibuk, silakan lewati langkah ini.');
  const data = await r.json();
  const pages = Object.values(data.query?.pages || {});
  const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').trim().slice(0, 140);
  const images = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii?.thumburl || (ii.width || 0) < 500) continue;
    const meta = ii.extmetadata || {};
    images.push({
      title: p.title.replace(/^File:/, '').replace(/\.[a-zA-Z0-9]+$/, '').replace(/_/g, ' ').slice(0, 90),
      thumbUrl: ii.thumburl,
      fullUrl: ii.url,
      width: ii.width, height: ii.height,
      artist: strip(meta.Artist?.value),
      license: strip(meta.LicenseShortName?.value) || 'CC',
      pageUrl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(p.title),
    });
    if (images.length >= 6) break;
  }
  return images;
}

export const gambarProxy = (url) => '/api/gambar-proxy?url=' + encodeURIComponent(url);

export function extractTitle(markdown) {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : 'Dokumen Ajar';
}

// Buang baris yang isinya sama persis dengan judul dokumen.
// Judul sudah tampil di kepala dokumen (doc.judul), jadi kemunculannya
// di isi markdown (# Judul / Judul polos) hanya akan jadi judul ganda.
export function buangJudulGanda(markdown, judul) {
  if (!markdown || !judul) return markdown || '';
  const norm = (s) => String(s || '').toLowerCase().replace(/[#*`_~>]/g, '').replace(/\s+/g, ' ').trim();
  const target = norm(judul);
  if (!target) return markdown;
  const kept = [];
  for (const line of String(markdown).split('\n')) {
    if (norm(line) === target) continue;
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Rapikan section "A. Identitas" LKPD yang berantakan: bullet list berjejal
// (**Nama**: .... **Kelas**: .... dalam satu baris) diubah menjadi tabel rapi
// satu field per baris. Baris label tanpa isi (mis. **Informasi Sekolah:**)
// yang bukan field dikenal ikut dibuang.
const IDENTITAS_ISIAN = ['nama', 'kelas', 'kelompok', 'tanggal'];
export function rapikanIdentitas(markdown) {
  if (!markdown) return markdown || '';
  const lines = String(markdown).split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (/^##\s+A\.\s*Identitas\s*$/.test(lines[i].trim())) {
      out.push(lines[i]); i++;
      const sec = [];
      while (i < lines.length && !/^##\s+/.test(lines[i].trim())) { sec.push(lines[i]); i++; }
      out.push(...rapikanBlokIdentitas(sec));
    } else {
      out.push(lines[i]); i++;
    }
  }
  return out.join('\n');
}

function rapikanBlokIdentitas(sec) {
  if (sec.some((l) => /^\s*\|/.test(l))) return sec; // sudah tabel rapi → biarkan
  const isian = [];
  const info = [];
  const sisa = [];
  for (const line of sec) {
    const t = line.trim();
    if (!t) continue;
    if (/^[-*]\s/.test(t)) {
      const content = t.replace(/^[-*]\s+/, '');
      const parts = content.split(/(?=\*\*[^*]+\*\*\s*:)/).map((s) => s.trim()).filter(Boolean);
      let matched = false;
      for (const p of parts) {
        const pm = p.match(/^\*\*\s*([^*]+?)\s*\*\*\s*:?\s*(.*)$/);
        if (pm) {
          matched = true;
          const label = pm[1].trim();
          const val = pm[2].replace(/\*\*/g, '').replace(/\s*\|\s*$/, '').trim();
          if (IDENTITAS_ISIAN.includes(label.toLowerCase())) isian.push([label, val]);
          else if (val) info.push([label, val]);
          // label asing tanpa isi → buang
        }
      }
      if (!matched) sisa.push(line);
    } else if (/^\*\*[^*]+\*\*\s*:?\s*$/.test(t)) {
      continue; // baris label saja tanpa isi → buang
    } else {
      sisa.push(line);
    }
  }
  if (isian.length < 2) return sec; // bukan pola berantakan → biarkan apa adanya
  const dots = '.'.repeat(40);
  const tbl = [
    '',
    '| Identitas Peserta Didik | |',
    '|---|---|',
    ...isian.map(([k, v]) => `| ${k} | ${v || dots} |`),
    '',
  ];
  if (info.length) tbl.push(info.map(([k, v]) => `**${k}**: ${v}`).join(' | '), '');
  return [...tbl, ...sisa];
}

// Pisahkan section "Informasi Umum" dari markdown -> { infoRows, rest }
export function splitInfoUmum(markdown) {
  const m = markdown.match(/^##\s+A\.\s*Informasi Umum\s*$/m);
  if (!m) return { infoRows: [], rest: markdown };
  const start = m.index + m[0].length;
  const next = markdown.slice(start).search(/^##\s+/m);
  const section = next === -1 ? markdown.slice(start) : markdown.slice(start, start + next);
  const rest = markdown.slice(0, m.index) + (next === -1 ? '' : markdown.slice(start + next));
  const rows = [];
  for (const line of section.split('\n')) {
    const lm = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*\s*:?\s*(.*)$/);
    if (lm) rows.push([lm[1].trim(), lm[2].trim()]);
    else {
      const l2 = line.match(/^\s*[-*]\s+(.+?):\s*(.*)$/);
      if (l2) rows.push([l2[1].trim(), l2[2].trim()]);
    }
  }
  return { infoRows: rows, rest: rest.trim() };
}

// Profil guru (localStorage). saveProfile MENGGABUNGKAN, bukan mengganti:
// tiap pemanggil hanya menyimpan field yang ia kelola (nama, nip,
// kepalaSekolah, ...), field lain tetap utuh.
const PKEY = 'modulajar_profile';
export function getProfile() {
  try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch { return {}; }
}
export function saveProfile(p) {
  localStorage.setItem(PKEY, JSON.stringify({ ...getProfile(), ...(p || {}) }));
}

// ---- Kunci AI sendiri (BYOK) & referal ----
// Kontrak backend (dikerjakan agen lain):
//   GET  /api/ai-config     -> { ada, baseUrl, model, keyMasked }
//   POST /api/ai-config     -> { baseUrl, apiKey, model? }
//   DELETE /api/ai-config
//   GET  /api/referal       -> { kode, link, bonusPeriodeIni, klaimPeriodeIni, maksKlaim }
//   POST /api/referal/klaim -> { kode }
async function apiAuthed(path, method, body) {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) {
    const err = new Error(d.error || 'Server tidak merespons.');
    err.code = d.code;
    err.detail = d;
    throw err;
  }
  return d;
}

export const getAiConfig = () => apiAuthed('/api/ai-config', 'GET');
export const saveAiConfig = ({ baseUrl, apiKey, model }) =>
  apiAuthed('/api/ai-config', 'POST', { baseUrl, apiKey, ...(model ? { model } : {}) });
export const deleteAiConfig = () => apiAuthed('/api/ai-config', 'DELETE');
export const getReferal = () => apiAuthed('/api/referal', 'GET');
export const klaimReferal = (kode) => apiAuthed('/api/referal/klaim', 'POST', { kode });
