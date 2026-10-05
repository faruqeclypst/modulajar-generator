import Dexie from 'dexie';

export const db = new Dexie('modulajar');
db.version(2).stores({
  moduls: '++id, judul, jenjang, mapel, createdAt, updatedAt',
  drafts: '++id, updatedAt',
});
db.version(3).stores({
  moduls: '++id, judul, jenjang, mapel, createdAt, updatedAt',
  drafts: '++id, updatedAt',
  pakets: '++id, mapel, kelas, semester, tahunAjaran, updatedAt',
});

export async function saveModul(data) {
  const now = Date.now();
  return db.moduls.add({ ...data, createdAt: now, updatedAt: now });
}
export async function updateModul(id, data) {
  return db.moduls.update(id, { ...data, updatedAt: Date.now() });
}
export async function deleteModul(id) {
  return db.moduls.delete(id);
}
export async function listModuls() {
  return db.moduls.orderBy('updatedAt').reverse().toArray();
}
export async function getModul(id) {
  return db.moduls.get(id);
}
export async function saveDraft(draft) {
  const existing = await db.drafts.orderBy('updatedAt').last();
  const now = Date.now();
  if (existing) return db.drafts.update(existing.id, { ...draft, updatedAt: now });
  return db.drafts.add({ ...draft, updatedAt: now });
}
export async function getDraft() {
  return db.drafts.orderBy('updatedAt').last();
}
export async function clearDraft() {
  return db.drafts.clear();
}

// ---- Paket Perencanaan: CP -> ATP -> Prota -> Prosem ----
export async function savePaket(data) {
  const now = Date.now();
  return db.pakets.add({ docs: {}, ...data, createdAt: now, updatedAt: now });
}
export async function updatePaket(id, data) {
  return db.pakets.update(id, { ...data, updatedAt: Date.now() });
}
export async function deletePaket(id) {
  return db.pakets.delete(id);
}
export async function listPakets() {
  return db.pakets.orderBy('updatedAt').reverse().toArray();
}
export async function getPaket(id) {
  return db.pakets.get(Number(id));
}
export function paketProgress(paket) {
  const docs = paket?.docs || {};
  return ['cp', 'atp', 'prota', 'prosem'].filter((k) => docs[k]).length;
}
