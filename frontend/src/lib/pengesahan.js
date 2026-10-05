// Ekstrak "Lembar Pengesahan" dari markdown menjadi data terstruktur,
// agar bisa dirender resmi di pratinjau, Word, dan cetak/PDF.
// Tidak mengubah markdown sumber; bila format tidak dikenali -> null.

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// "Bandung, 2026-10-06" -> "Bandung, 6 Oktober 2026" (tempat dipertahankan)
function tanggalID(s) {
  return String(s || '').replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, mo, d) => {
    const bln = BULAN_ID[parseInt(mo, 10) - 1] || mo;
    return `${parseInt(d, 10)} ${bln} ${y}`;
  }).trim();
}

function barisTabel(t) {
  return /^\|.*\|$/.test(t);
}

function selBaris(t) {
  const c = t.slice(1, -1).split('|').map((x) => x.trim());
  return c;
}

const isSeparator = (cells) => cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
const isKosong = (cells) => cells.every((c) => !c);

export function ekstrakPengesahan(markdown) {
  const lines = String(markdown || '').split('\n');
  let start = -1;
  let judul = 'Lembar Pengesahan';
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,4}\s+(.*pengesahan.*)$/i);
    if (m) { start = i; judul = m[1].trim(); break; }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  const sec = lines.slice(start + 1, end);

  const rows = [];
  const teks = [];
  let sekolah = '';
  for (const line of sec) {
    const t = line.trim();
    if (!t) continue;
    if (barisTabel(t)) {
      const cells = selBaris(t);
      if (isSeparator(cells) || isKosong(cells)) continue;
      rows.push(cells);
      continue;
    }
    const ms = t.match(/^\*\*Sekolah\*\*:\s*(.*)$/);
    if (ms) { sekolah = ms[1].trim(); continue; }
    teks.push(t.replace(/\*\*/g, ''));
  }
  if (rows.length === 0) return null;

  const norm = rows.map((r) => { const c = [...r]; while (c.length < 2) c.push(''); return c; });
  const kiri = { atas: '', jabatan: '', nama: '', nip: '' };
  const kanan = { atas: '', jabatan: '', nama: '', nip: '' };
  let ketemu = false;
  for (const [a, b] of norm) {
    const la = a.toLowerCase();
    if (/mengetahui/.test(la)) {
      kiri.atas = a; kanan.atas = tanggalID(b); ketemu = true;
    } else if (/kepala sekolah/.test(la)) {
      kiri.jabatan = a; kanan.jabatan = b; ketemu = true;
    } else if (/nip/i.test(a) || /nip/i.test(b)) {
      kiri.nip = a; kanan.nip = b; ketemu = true;
    } else if (/^\(.*\)$/.test(a)) {
      kiri.nama = a; kanan.nama = b; ketemu = true;
    }
  }
  if (!ketemu) return null;

  return {
    judul,
    intro: teks.join(' ').trim(),
    sekolah,
    kiri,
    kanan,
  };
}

// Kembalikan markdown tanpa section pengesahan (untuk dirender terpisah).
export function buangPengesahan(markdown) {
  const lines = String(markdown || '').split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,4}\s+.*pengesahan.*$/i.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return markdown;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
