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
