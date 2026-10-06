// Isolasi data lokal per-akun.
//
// Profil guru, proyek, draft, dan posisi halaman tersimpan di localStorage
// (per-browser). Tanpa pembeda akun, akun baru di browser yang sama akan
// mewarisi data akun lama. Modul ini membuat kunci per-akun:
// dipanggil sekali saat sesi auth diketahui (App.jsx).
//
// Migrasi: pada akses pertama, isi kunci lama disalin ke kunci per-akun
// lalu kunci lama DIHAPUS agar akun lain tidak mewarisi.

let uidLokal = null;

export function setUidLokal(uid) {
  uidLokal = uid || null;
}

export function getUidLokal() {
  return uidLokal;
}

// Hapus TOTAL data lokal aplikasi (localStorage + IndexedDB usang).
// Dipakai saat data lokal diduga rusak. Sesi login ikut terhapus sehingga
// pengguna keluar dan mulai dari keadaan bersih. Dokumen di server (Supabase)
// TIDAK ikut terhapus.
export async function hapusTotalDataLokal() {
  const ringkasan = { kunci: 0, basisData: 0 };
  try {
    const hapus = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      // Kunci aplikasi (ma-*, modulajar*) + sesi Supabase (sb-*).
      if (k && /^(ma-|modulajar|sb-)/.test(k)) hapus.push(k);
    }
    for (const k of hapus) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* abaikan */
      }
    }
    ringkasan.kunci = hapus.length;
  } catch {
    /* abaikan */
  }
  try {
    // Bersihkan sisa IndexedDB usang (mis. dari versi lama ber-Dexie),
    // walau aplikasi saat ini tidak lagi memakainya.
    if (window.indexedDB && typeof indexedDB.databases === 'function') {
      const daftar = await indexedDB.databases();
      for (const db of daftar || []) {
        if (!db || !db.name) continue;
        await new Promise((selesai) => {
          try {
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = req.onerror = req.onblocked = () => selesai();
          } catch {
            selesai();
          }
        });
        ringkasan.basisData++;
      }
    }
  } catch {
    /* abaikan */
  }
  setUidLokal(null);
  return ringkasan;
}

export function kunciAkun(base) {
  if (!uidLokal) return base;
  const k = base + '__' + uidLokal;
  try {
    if (localStorage.getItem(k) === null) {
      const lama = localStorage.getItem(base);
      if (lama !== null) {
        localStorage.setItem(k, lama);
        localStorage.removeItem(base);
      }
    }
  } catch {
    /* penyimpanan tidak tersedia: abaikan */
  }
  return k;
}
