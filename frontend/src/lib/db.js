import { getSupabase, getSession } from './supabase';

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

// ---- Draft: sementara per perangkat, cukup localStorage ----
const DKEY = 'modulajar.draft';
export async function saveDraft(draft) {
  try { localStorage.setItem(DKEY, JSON.stringify({ ...draft, updatedAt: Date.now() })); } catch { /* abaikan */ }
}
export async function getDraft() {
  try { return JSON.parse(localStorage.getItem(DKEY)) || null; } catch { return null; }
}
export async function clearDraft() {
  try { localStorage.removeItem(DKEY); } catch { /* abaikan */ }
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
// Disimpan di localStorage (tanpa tabel baru di Supabase) agar tidak butuh
// migrasi SQL. Dokumen menunjuk proyek lewat `projectId` di meta (ikut
// tersinkron antarperangkat); bila proyeknya tidak ada di perangkat ini,
// dokumen tampil di "Tanpa proyek".
const PROYEK_KEY = 'ma-projects';
const MIGRASI_KEY = 'ma-migrasi-proyek-v1';

function bacaProyek() {
  try { return JSON.parse(localStorage.getItem(PROYEK_KEY)) || []; }
  catch { return []; }
}
function tulisProyek(list) {
  try { localStorage.setItem(PROYEK_KEY, JSON.stringify(list)); } catch { /* abaikan */ }
}

export async function listProjects() {
  return bacaProyek().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function getProject(id) {
  return bacaProyek().find((p) => String(p.id) === String(id)) || null;
}

export async function saveProject(data) {
  const list = bacaProyek();
  const p = {
    id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36),
    nama: '', mapel: '', jenjang: '', fase: '', kelas: '', semester: '', tahunAjaran: '',
    paketId: null,
    ...(data || {}),
    createdAt: new Date().toISOString(),
  };
  if (!p.nama) p.nama = [p.mapel, p.kelas].filter(Boolean).join(' ') || 'Proyek tanpa nama';
  list.push(p);
  tulisProyek(list);
  return p.id;
}

export async function updateProject(id, patch) {
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
  tulisProyek(bacaProyek().filter((p) => String(p.id) !== String(id)));
}

// Migrasi sekali jalan: tiap paket perencanaan lama menjadi satu proyek,
// dokumen perencanaan paket + dokumen ber-paketId dipetakan ke proyeknya.
// Baris paket lama TIDAK dihapus agar pemilih acuan lama tetap berfungsi.
export async function migrasiPaketKeProyek() {
  try { if (localStorage.getItem(MIGRASI_KEY) === '1') return { dibuat: 0 }; }
  catch { return { dibuat: 0 }; }
  let dibuat = 0;
  try {
    const pakets = await listPakets();
    const docs = await listModuls().catch(() => []);
    const peta = {};
    for (const p of pakets) {
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
  try { localStorage.setItem(MIGRASI_KEY, '1'); } catch { /* abaikan */ }
  return { dibuat };
}
