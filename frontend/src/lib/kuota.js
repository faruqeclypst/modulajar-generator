import { getToken } from './supabase';

// Status kuota mingguan user yang login: { admin, batas, dipakai, sisa, tanggal }
// Admin: batas/sisa = null (tanpa batas). Gagal fetch: null.
export async function fetchKuota() {
  try {
    const t = await getToken().catch(() => '');
    const r = await fetch('/api/kuota', {
      headers: t ? { Authorization: 'Bearer ' + t } : {},
    });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) return null;
    return d;
  } catch {
    return null;
  }
}
