import { getSupabase, getSession } from './supabase';
import { kunciAkun } from './akunLokal';

// Lapisan data di atas Supabase (menggantikan Dexie/IndexedDB).
// Bentuk objek yang dikembalikan disamakan dengan versi lama
// agar komponen tidak perlu diubah.

async function uid() {
  const s = await getSession().catch(() => null);
  if (!s?.user) throw new Error('Perlu login.');
  return s.user.id;
}

function toApp(row) {
  if (!row) return null;
  return {
    id: row.id,
    docType: row.doc_type,
    judul: row.judul,
    markdown: row.markdown,
    images: row.images || [],
    ...(row.meta || {}),
    publik: !!row.publik,
    slug: row.slug || null,
    diterbitkanPada: row.diterbitkan_pada || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---- Galeri Publik ----
function buatSlug(judul) {
  const dasar = String(judul || 'dokumen').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60) || 'dokumen';
  const acak = Math.random().toString(36).slice(2, 8);
  return `${dasar}-${acak}`;
}

export async function publikasikanDokumen(id) {
  const c = await getSupabase();
  const cur = await c.from('dokumen').select('judul, slug').eq('id', id).single();
  if (cur.error) throw new Error('Dokumen tidak ditemukan.');
  const slug = cur.data.slug || buatSlug(cur.data.judul);
  const { error } = await c.from('dokumen').update({
    publik: true, slug, diterbitkan_pada: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('Gagal mempublikasikan: ' + error.message);
  return slug;
}

export async function batalPublikasi(id) {
  const c = await getSupabase();
  const { error } = await c.from('dokumen').update({ publik: false }).eq('id', id);
  if (error) throw new Error('Gagal membatalkan publikasi: ' + error.message);
}

// Daftar dokumen publik — bisa diakses tanpa login (RLS).
export async function listDokumenPublik(batas = 60) {
  const c = await getSupabase();
  const { data, error } = await c.from('dokumen')
    .select('id, doc_type, judul, slug, meta, diterbitkan_pada, created_at, markdown')
    .eq('publik', true).order('diterbitkan_pada', { ascending: false }).limit(batas);
  if (error) throw new Error('Gagal memuat galeri: ' + error.message);
  return (data || []).map(toApp);
}

// Cuplikan teks polos dari markdown (untuk preview kartu galeri).
export function cuplikanMarkdown(md, maks = 180) {
  const t = String(md || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__|\*|_|`|~~|\[|\]|\(|\)|#)/g, '')
    .replace(/\|/g, ' ').replace(/-{2,}/g, ' ')
    .replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return t.length > maks ? t.slice(0, maks).trimEnd() + '…' : t;
}

// Baca satu dokumen publik via slug — tanpa login.
export async function getDokumenPublik(slug) {
  const c = await getSupabase();
  const { data, error } = await c.from('dokumen').select('*').eq('slug', slug).eq('publik', true).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error('Gagal memuat dokumen: ' + error.message);
  }
  return toApp(data);
}

// ---- Dokumen ----
export async function saveModul(data) {
  const c = await getSupabase();
  const user_id = await uid();
  const { docType, judul, markdown = '', images = [], ...meta } = data;
  const { data: row, error } = await c.from('dokumen').insert({
    user_id, doc_type: docType, judul, markdown, meta, images,
  }).select('id').single();
  if (error) throw new Error('Gagal menyimpan: ' + error.message);
  return row.id;
}

export async function updateModul(id, patch) {
  const c = await getSupabase();
  const cur = await c.from('dokumen').select('meta').eq('id', id).single();
  if (cur.error) throw new Error('Dokumen tidak ditemukan.');
  const { docType, judul, markdown, images, ...metaPatch } = patch;
  const upd = { updated_at: new Date().toISOString() };
  if (docType !== undefined) upd.doc_type = docType;
  if (judul !== undefined) upd.judul = judul;
  if (markdown !== undefined) upd.markdown = markdown;
  if (images !== undefined) upd.images = images;
  upd.meta = { ...(cur.data.meta || {}), ...metaPatch };
  const { error } = await c.from('dokumen').update(upd).eq('id', id);
  if (error) throw new Error('Gagal memperbarui: ' + error.message);
}

export async function deleteModul(id) {
  const c = await getSupabase();
  const { error } = await c.from('dokumen').delete().eq('id', id);
  if (error) throw new Error('Gagal menghapus: ' + error.message);
}

export async function listModuls() {
  const c = await getSupabase();
  const { data, error } = await c.from('dokumen').select('*').order('updated_at', { ascending: false });
  if (error) throw new Error('Gagal memuat: ' + error.message);
  return (data || []).map(toApp);
}

export async function getModul(id) {
  const c = await getSupabase();
  const { data, error } = await c.from('dokumen').select('*').eq('id', id).single();
  if (error) {
    // PGRST116 = tidak ada baris -> dokumen memang tidak ada (404 asli).
    // Error lain (jaringan, RLS, dsb) dilempar agar pemanggil bisa bedakan.
    if (error.code === 'PGRST116') return null;
    throw new Error('Gagal memuat dokumen: ' + error.message);
  }
  return toApp(data);
}

// ---- Draft: sementara per perangkat, cukup localStorage (per-akun) ----
const DKEY = 'modulajar.draft';
export async function saveDraft(draft) {
  try { localStorage.setItem(kunciAkun(DKEY), JSON.stringify({ ...draft, updatedAt: Date.now() })); } catch { /* abaikan */ }
}
export async function getDraft() {
  try { return JSON.parse(localStorage.getItem(kunciAkun(DKEY))) || null; } catch { return null; }
}
export async function clearDraft() {
  try { localStorage.removeItem(kunciAkun(DKEY)); } catch { /* abaikan */ }
}

// ---- Paket Perencanaan: CP -> ATP -> Minggu Efektif -> Prota -> Prosem ----
function paketToApp(row) {
  if (!row) return null;
  return {
    id: row.id,
    docs: row.docs || {},
    ...(row.meta || {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function savePaket(data) {
  const c = await getSupabase();
  const user_id = await uid();
  const { docs = {}, ...meta } = data;
  const { data: row, error } = await c.from('paket').insert({ user_id, meta, docs }).select('id').single();
  if (error) throw new Error('Gagal menyimpan paket: ' + error.message);
  return row.id;
}

export async function updatePaket(id, patch) {
  const c = await getSupabase();
  const cur = await c.from('paket').select('meta').eq('id', id).single();
  if (cur.error) throw new Error('Paket tidak ditemukan.');
  const { docs, ...metaPatch } = patch;
  const upd = { updated_at: new Date().toISOString(), meta: { ...(cur.data.meta || {}), ...metaPatch } };
  if (docs !== undefined) upd.docs = docs;
  const { error } = await c.from('paket').update(upd).eq('id', id);
  if (error) throw new Error('Gagal memperbarui paket: ' + error.message);
}

export async function deletePaket(id) {
  const c = await getSupabase();
  const { error } = await c.from('paket').delete().eq('id', id);
  if (error) throw new Error('Gagal menghapus paket: ' + error.message);
}

export async function listPakets() {
  const c = await getSupabase();
  const { data, error } = await c.from('paket').select('*').order('updated_at', { ascending: false });
  if (error) throw new Error('Gagal memuat paket: ' + error.message);
  return (data || []).map(paketToApp);
}

export async function getPaket(id) {
  const c = await getSupabase();
  const { data, error } = await c.from('paket').select('*').eq('id', id).single();
  if (error) return null;
  return paketToApp(data);
}

export function paketProgress(paket) {
  const docs = paket?.docs || {};
  return ['cp', 'atp', 'minggu_efektif', 'prota', 'prosem'].filter((k) => docs[k]).length;
}

// ---- Proyek: 1 proyek = 1 mapel (+ kelas/semester/tahun ajaran) ----
// Disimpan di Supabase (tabel `proyek`, per user_id) agar ikut akun di
// perangkat mana pun — login di komputer lain pun proyek tetap ada.
// Dokumen menunjuk proyek lewat `projectId` di meta.
// Bila tabel belum ada (SQL terbaru belum dijalankan), fallback ke
// localStorage per-akun agar fitur tidak rusak; data lokal otomatis
// diimpor ke DB lewat imporProyekLokalKeDB() begitu tabel tersedia.
const PROYEK_KEY = 'ma-projects';

function proyekKeApp(r) {
  if (!r) return null;
  return {
    id: r.id,
    nama: r.nama || '', mapel: r.mapel || '', jenjang: r.jenjang || '',
    fase: r.fase || '', kelas: r.kelas || '', semester: r.semester || '',
    tahunAjaran: r.tahun_ajaran || '', paketId: r.paket_id || null,
    arsip: r.arsip === true,
    createdAt: r.created_at,
  };
}

// null = belum dicek; true = tabel ada; false = belum ada (fallback lokal).
let proyekDB = null;
async function cekProyekDB() {
  if (proyekDB) return true;
  try {
    const c = await getSupabase();
    const { error } = await c.from('proyek').select('id').limit(1);
    if (error && (error.code === '42P01' || /does not exist/i.test(error.message || ''))) return false;
    if (error) throw error;
    proyekDB = true;
    return true;
  } catch (e) {
    if (e && (e.code === '42P01' || /does not exist/i.test(e.message || ''))) return false;
    throw e;
  }
}

function bacaProyek() {
  try { return JSON.parse(localStorage.getItem(kunciAkun(PROYEK_KEY))) || []; }
  catch { return []; }
}
function tulisProyek(list) {
  try { localStorage.setItem(kunciAkun(PROYEK_KEY), JSON.stringify(list)); } catch { /* abaikan */ }
}
function urutProyek(list) {
  return list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function listProjects(termasukArsip = false) {
  let list;
  if (await cekProyekDB()) {
    const c = await getSupabase();
    const { data, error } = await c.from('proyek').select('*').order('created_at', { ascending: false });
    if (error) throw new Error('Gagal memuat proyek: ' + error.message);
    list = (data || []).map(proyekKeApp);
    // Gabung status arsip lokal (fallback bila kolom `arsip` di DB belum ada)
    const lok = bacaArsipLokal();
    if (lok.size) list = list.map((p) => (lok.has(String(p.id)) ? { ...p, arsip: true } : p));
  } else {
    list = urutProyek(bacaProyek());
  }
  if (!termasukArsip) list = list.filter((p) => !p.arsip);
  return list;
}

export async function getProject(id) {
  if (await cekProyekDB()) {
    const c = await getSupabase();
    const { data, error } = await c.from('proyek').select('*').eq('id', String(id)).single();
    if (error) return null;
    return proyekKeApp(data);
  }
  return bacaProyek().find((p) => String(p.id) === String(id)) || null;
}

export async function saveProject(data) {
  const p = {
    id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36),
    nama: '', mapel: '', jenjang: '', fase: '', kelas: '', semester: '', tahunAjaran: '',
    paketId: null,
    ...(data || {}),
    createdAt: new Date().toISOString(),
  };
  if (!p.nama) p.nama = [p.mapel, p.kelas].filter(Boolean).join(' ') || 'Proyek tanpa nama';
  if (await cekProyekDB()) {
    const c = await getSupabase();
    const user_id = await uid();
    const { error } = await c.from('proyek').insert({
      id: String(p.id), user_id,
      nama: p.nama, mapel: p.mapel, jenjang: p.jenjang, fase: p.fase,
      kelas: p.kelas, semester: p.semester, tahun_ajaran: p.tahunAjaran,
      paket_id: p.paketId != null ? String(p.paketId) : null,
    });
    if (error) throw new Error('Gagal menyimpan proyek: ' + error.message);
    return p.id;
  }
  const list = bacaProyek();
  list.push(p);
  tulisProyek(list);
  return p.id;
}

// Arsip proyek: kolom `arsip` di DB bila SQL terbaru sudah dijalankan,
// fallback ke localStorage per-akun bila kolom belum ada (tetap berfungsi).
const ARSIP_KEY = 'ma-arsip-proyek';
function bacaArsipLokal() {
  try { return new Set(JSON.parse(localStorage.getItem(kunciAkun(ARSIP_KEY)) || '[]')); }
  catch { return new Set(); }
}
function tulisArsipLokal(set) {
  try { localStorage.setItem(kunciAkun(ARSIP_KEY), JSON.stringify([...set])); } catch { /* abaikan */ }
}
let kolomArsipAda = null; // null = belum dicek
async function cekKolomArsip() {
  if (kolomArsipAda !== null) return kolomArsipAda;
  try {
    if (!await cekProyekDB()) { kolomArsipAda = false; return false; }
    const c = await getSupabase();
    const { error } = await c.from('proyek').select('arsip').limit(1);
    kolomArsipAda = !error || !(error.code === '42703' || /arsip/i.test(error.message || ''));
  } catch { kolomArsipAda = false; }
  return kolomArsipAda;
}
export async function arsipkanProyek(id) { await setArsipProyek(id, true); }
export async function batalArsipProyek(id) { await setArsipProyek(id, false); }
async function setArsipProyek(id, nilai) {
  if (await cekKolomArsip()) {
    try {
      await updateProject(id, { arsip: nilai });
      const s = bacaArsipLokal();
      if (s.delete(String(id))) tulisArsipLokal(s);
      return;
    } catch (e) {
      if (!(e && (e.code === '42703' || /arsip/i.test(e.message || '')))) throw e;
      kolomArsipAda = false;
    }
  }
  const s = bacaArsipLokal();
  if (nilai) s.add(String(id)); else s.delete(String(id));
  tulisArsipLokal(s);
}

export async function updateProject(id, patch) {
  if (await cekProyekDB()) {
    const c = await getSupabase();
    const upd = {};
    const peta = { nama: 'nama', mapel: 'mapel', jenjang: 'jenjang', fase: 'fase', kelas: 'kelas', semester: 'semester', tahunAjaran: 'tahun_ajaran', paketId: 'paket_id' };
    if (patch && patch.arsip !== undefined && await cekKolomArsip()) peta.arsip = 'arsip';
    for (const [k, kolom] of Object.entries(peta)) {
      if (patch && patch[k] !== undefined) {
        upd[kolom] = k === 'arsip' ? !!patch[k] : (patch[k] == null ? null : String(patch[k]));
      }
    }
    upd.updated_at = new Date().toISOString();
    const { error, count } = await c.from('proyek').update(upd, { count: 'exact' }).eq('id', String(id));
    if (error) throw new Error('Gagal memperbarui proyek: ' + error.message);
    if (!count) throw new Error('Proyek tidak ditemukan.');
    return;
  }
  const list = bacaProyek();
  const ix = list.findIndex((p) => String(p.id) === String(id));
  if (ix === -1) throw new Error('Proyek tidak ditemukan.');
  list[ix] = { ...list[ix], ...(patch || {}) };
  tulisProyek(list);
}

export async function deleteProject(id) {
  // Dokumen TIDAK ikut terhapus: projectId-nya dikosongkan sehingga
  // dokumen pindah ke "Tanpa proyek".
  const docs = await listModuls().catch(() => []);
  for (const d of docs) {
    if (String(d.projectId || '') === String(id)) {
      try { await updateModul(d.id, { projectId: null }); } catch { /* abaikan */ }
    }
  }
  // Hapus paket tertaut (bila ada) agar migrasiPaketKeProyek() tidak
  // membuat ulang proyek ini saat login/refresh berikutnya.
  try {
    const proj = await getProject(id).catch(() => null);
    if (proj && proj.paketId) await deletePaket(proj.paketId).catch(() => {});
  } catch { /* abaikan */ }
  if (await cekProyekDB()) {
    const c = await getSupabase();
    const { error } = await c.from('proyek').delete().eq('id', String(id));
    if (error) throw new Error('Gagal menghapus proyek: ' + error.message);
    return;
  }
  tulisProyek(bacaProyek().filter((p) => String(p.id) !== String(id)));
}

// Impor sekali jalan: proyek yang masih tersimpan di localStorage
// (kunci lama / kunci akun lain di perangkat ini) dipindahkan ke database.
// Dipanggil tiap login; aman diulang (dedupe berdasarkan id).
export async function imporProyekLokalKeDB() {
  if (!await cekProyekDB()) return 0;
  const semua = new Map();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^ma-projects(__.+)?$/.test(k)) continue;
      try {
        const list = JSON.parse(localStorage.getItem(k)) || [];
        for (const p of list) {
          if (p && p.id && !semua.has(String(p.id))) semua.set(String(p.id), p);
        }
      } catch { /* abaikan kunci rusak */ }
    }
  } catch { /* abaikan */ }
  if (!semua.size) return 0;
  const c = await getSupabase();
  const user_id = await uid();
  const { data: ada } = await c.from('proyek').select('id');
  const adaSet = new Set((ada || []).map((r) => String(r.id)));
  const baru = [...semua.values()].filter((p) => !adaSet.has(String(p.id)));
  if (baru.length) {
    const rows = baru.map((p) => ({
      id: String(p.id), user_id,
      nama: p.nama || '', mapel: p.mapel || '', jenjang: p.jenjang || '',
      fase: p.fase || '', kelas: p.kelas || '', semester: p.semester || '',
      tahun_ajaran: p.tahunAjaran || '',
      paket_id: p.paketId != null ? String(p.paketId) : null,
    }));
    const { error } = await c.from('proyek').insert(rows);
    if (error) throw new Error('Gagal mengimpor proyek: ' + error.message);
  }
  // Bersihkan kunci lokal setelah diimpor agar tidak ganda.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && /^ma-projects(__.+)?$/.test(k)) {
        try { localStorage.removeItem(k); } catch { /* abaikan */ }
      }
    }
  } catch { /* abaikan */ }
  return baru.length;
}

// Proyek "yatim": tersimpan di kunci akun lain atau kunci lama (sebelum
// isolasi per-akun), sehingga tidak tampil di akun saat ini. Dipakai oleh
// alat pemulihan manual di Pengaturan — tidak pernah berjalan otomatis agar
// akun baru tetap bersih.
export async function pindaiProyekYatim() {
  const milik = new Set((await listProjects()).map((p) => String(p.id)));
  const kunciSendiri = kunciAkun(PROYEK_KEY);
  const temu = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^ma-projects(__.+)?$/.test(k) || k === kunciSendiri) continue;
      try {
        const list = JSON.parse(localStorage.getItem(k)) || [];
        for (const p of list) {
          if (p && p.id && !milik.has(String(p.id))) {
            milik.add(String(p.id));
            temu.push({ ...p, _sumber: k });
          }
        }
      } catch { /* abaikan kunci rusak */ }
    }
  } catch { /* abaikan */ }
  return temu.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function adopsiProyekYatim() {
  // Bila DB tersedia, impor ke database (ikut akun, lintas perangkat).
  if (await cekProyekDB()) return imporProyekLokalKeDB();
  const yatim = await pindaiProyekYatim();
  if (!yatim.length) return 0;
  const list = bacaProyek();
  const ada = new Set(list.map((p) => String(p.id)));
  for (const p of yatim) {
    if (ada.has(String(p.id))) continue;
    const { _sumber, ...bersih } = p;
    list.push(bersih);
    ada.add(String(p.id));
  }
  tulisProyek(list);
  return yatim.length;
}

// Migrasi: tiap paket perencanaan lama menjadi satu proyek.
// Idempoten (aman diulang): paket yang sudah punya proyek dilewati.
export async function migrasiPaketKeProyek() {
  let dibuat = 0;
  try {
    const pakets = await listPakets();
    if (!pakets.length) return { dibuat: 0 };
    const proyeks = await listProjects().catch(() => []);
    const sudah = new Set(proyeks.map((p) => String(p.paketId || '')));
    const docs = await listModuls().catch(() => []);
    const peta = {};
    for (const p of pakets) {
      if (sudah.has(String(p.id))) continue;
      const id = await saveProject({
        nama: [p.mapel, p.kelas].filter(Boolean).join(' ') || p.mapel || 'Proyek',
        mapel: p.mapel || '', jenjang: p.jenjang || '', fase: p.fase || '',
        kelas: p.kelas || '', semester: p.semester || '', tahunAjaran: p.tahunAjaran || '',
        paketId: p.id,
      });
      peta[String(p.id)] = id;
      dibuat++;
      for (const docId of Object.values(p.docs || {})) {
        try { await updateModul(docId, { projectId: id }); } catch { /* abaikan */ }
      }
    }
    for (const d of docs) {
      if (d.projectId) continue;
      const baru = d.paketId ? peta[String(d.paketId)] : null;
      if (baru) { try { await updateModul(d.id, { projectId: baru }); } catch { /* abaikan */ } }
    }
  } catch { /* abaikan: migrasi tidak boleh menggagalkan load */ }
  return { dibuat };
}
