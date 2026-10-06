// Parser tabel Rincian Mingguan dari dokumen Prosem -> daftar minggu
// [{ minggu, materi, tp, alokasi, asesmen }]
export function parseProsemWeeks(markdown) {
  const lines = (markdown || '').split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+.*rincian mingguan/i.test(lines[i].trim())) { start = i + 1; break; }
  }
  if (start < 0) return [];
  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^##\s+/.test(t)) break;
    if (/^\|.*\|$/.test(t)) {
      const cells = t.slice(1, -1).split('|').map((c) => c.trim().replace(/\*\*/g, ''));
      if (/^-+/.test(cells[0].replace(/:/g, ''))) continue;
      rows.push(cells);
    } else if (rows.length && t) break;
  }
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.toLowerCase());
  const col = (names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iMinggu = col(['minggu']);
  const iMateri = col(['materi', 'pokok']);
  const iTp = col(['tujuan']);
  const iAlokasi = col(['alokasi', 'jp', 'waktu']);
  const iAsesmen = col(['asesmen', 'penilaian']);
  return rows.slice(1)
    .map((r) => ({
      minggu: iMinggu >= 0 ? r[iMinggu] || '' : '',
      materi: iMateri >= 0 ? r[iMateri] || '' : '',
      tp: iTp >= 0 ? r[iTp] || '' : '',
      alokasi: iAlokasi >= 0 ? r[iAlokasi] || '' : '',
      asesmen: iAsesmen >= 0 ? r[iAsesmen] || '' : '',
    }))
    .filter((w) => w.materi);
}

// Parser matriks Prosem (format baru: tabel HTML dari backend)
// -> [{ materi, jp, ket }]
export function parseMatriksProsem(markdown) {
  const hasil = [];
  const tabelMatch = (markdown || '').match(/<table>[\s\S]*?<\/table>/g);
  if (!tabelMatch) return hasil;
  tabelMatch.forEach((tabel) => {
    const tbody = tabel.match(/<tbody>([\s\S]*?)<\/tbody>/);
    const isi = tbody ? tbody[1] : tabel;
    const baris = isi.match(/<tr>([\s\S]*?)<\/tr>/g) || [];
    baris.forEach((br) => {
      const sel = [...br.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
        m[1].replace(/<[^>]+>/g, '').trim()
      );
      if (sel.length < 3) return;
      if (/^jumlah$/i.test(sel[0])) return; // baris total
      const jp = Number(sel[1]) || 0;
      if (!sel[0] || jp <= 0) return;
      hasil.push({ materi: sel[0], jp, ket: sel[sel.length - 1] || '' });
    });
  });
  return hasil;
}
