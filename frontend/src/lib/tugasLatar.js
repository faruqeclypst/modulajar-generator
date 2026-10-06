// Tugas latar: progress generate yang tetap hidup saat pengguna pindah halaman.
// Store modul-level + pub/sub. Komponen TugasFloating berlangganan dan tampil
// sebagai kartu mengambang; Wizard/GeneratorPaket mempublikasikan progress ke sini.
const tugas = new Map();
const pendengar = new Set();

function snapshot() {
  return [...tugas.values()].sort((a, b) => b.mulai - a.mulai);
}
function beriTahu() {
  const s = snapshot();
  for (const f of [...pendengar]) {
    try { f(s); } catch { /* abaikan */ }
  }
}

export function langgananTugas(fn) {
  pendengar.add(fn);
  try { fn(snapshot()); } catch { /* abaikan */ }
  return () => { pendengar.delete(fn); };
}

// konteks: 'wizard' | 'paket' | 'umum'. aksi: {kembali: label} opsional. meta: data bebas.
export function buatTugas({ judul, konteks, aksi, meta }) {
  const id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  tugas.set(id, {
    id,
    judul: judul || 'Memproses',
    konteks: konteks || 'umum',
    aksi: aksi || null,
    meta: meta || null,
    state: 'jalan', // jalan | selesai | gagal
    tahap: [], // [{key,label}]
    status: {}, // {key: 'tunggu'|'jalan'|'ok'}
    tulisan: [], // [{key,label,teks}] — hanya untuk wizard
    hasil: null,
    error: null,
    mulai: Date.now(),
  });
  beriTahu();
  return id;
}

function dapat(id) {
  return tugas.get(id) || null;
}

// Tandai tahap berjalan (tahap 'jalan' sebelumnya otomatis jadi 'ok').
export function tugasTahap(id, key, label) {
  const t = dapat(id);
  if (!t || t.state !== 'jalan') return;
  if (!t.tahap.some((p) => p.key === key)) t.tahap.push({ key, label });
  for (const k of Object.keys(t.status)) if (t.status[k] === 'jalan') t.status[k] = 'ok';
  t.status[key] = 'jalan';
  beriTahu();
}

export function tugasTulisan(id, key, delta, label) {
  const t = dapat(id);
  if (!t || t.state !== 'jalan') return;
  const ix = t.tulisan.findIndex((s) => s.key === key);
  if (ix === -1) t.tulisan.push({ key, label: label || key, teks: delta || '' });
  else t.tulisan[ix] = { ...t.tulisan[ix], teks: t.tulisan[ix].teks + (delta || '') };
  beriTahu();
}

export function tugasTulisanReset(id, key) {
  const t = dapat(id);
  if (!t) return;
  const ix = t.tulisan.findIndex((s) => s.key === key);
  if (ix !== -1) {
    t.tulisan[ix] = { ...t.tulisan[ix], teks: '' };
    beriTahu();
  }
}

// Set progress borongan (untuk job paket: tahap+status dari server).
export function tugasSetProgress(id, tahapArr, statusObj) {
  const t = dapat(id);
  if (!t || t.state !== 'jalan') return;
  t.tahap = tahapArr || [];
  t.status = statusObj || {};
  beriTahu();
}

export function tugasSelesai(id, hasil) {
  const t = dapat(id);
  if (!t) return;
  t.state = 'selesai';
  for (const k of Object.keys(t.status)) t.status[k] = 'ok';
  t.hasil = hasil || null;
  beriTahu();
}

export function tugasGagal(id, error) {
  const t = dapat(id);
  if (!t) return;
  t.state = 'gagal';
  t.error = error || 'Gagal.';
  beriTahu();
}

export function tutupTugas(id) {
  if (tugas.delete(id)) beriTahu();
}

export function tugasBerjalan(konteks) {
  return snapshot().filter((t) => t.state === 'jalan' && (!konteks || t.konteks === konteks));
}

export function cariTugas(id) {
  return dapat(id);
}
