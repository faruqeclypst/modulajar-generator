# ModulAjar Generator

Generator perangkat pembelajaran Kurikulum Merdeka berbasis AI untuk guru Indonesia.
Live: https://modulajar.alfaruqasri.my.id/

## Fitur

- **Ruang Perencanaan** — alur runtut CP → ATP → Prota → Prosem per paket
  (mapel/kelas/semester), tiap dokumen menjadi acuan resmi dokumen berikutnya.
- **8 jenis dokumen**: Modul Ajar, ATP, Capaian Pembelajaran (CP), Program
  Tahunan (Prota), Program Semester (Prosem), LKPD, Bank Soal, KKTP.
- **Rantai dokumen eksplisit**: dari halaman modul bisa langsung
  *Buat LKPD / Bank Soal / KKTP* — info terisi otomatis, modul jadi acuan AI.
- **Editor blok** ala Gutenberg: edit langsung, pindah/hapus blok,
  tulis ulang per blok dengan AI, sisip gambar di posisi mana pun.
- **Gambar referensi** dari Wikimedia Commons (dengan atribusi lisensi),
  bukan gambar AI.
- **Alokasi waktu per sub-langkah** kegiatan (Pendahuluan/Inti/Penutup)
  dengan total otomatis.
- **Export Word** (.docx, Times New Roman, A4) dan **Cetak/PDF**.
- **Anti-fiksi**: AI dilarang mengarang CP/TP/indikator di luar dokumen acuan.
- **8 Dimensi Profil Lulusan** (Permendikdasmen No. 10/2025) + prinsip
  pembelajaran mendalam — bukan P5 lama.
- Penyimpanan lokal per perangkat (Dexie/IndexedDB), tanpa login.
- Varian desain **Ramah Guru Senior** (`frontend/DESIGN-SENIOR.md`):
  huruf besar, kontras kuat, tombol ≥54px.

## Struktur

```
modulajar-generator/
├── backend/          # Express API (proxy AI + proxy gambar + static)
│   ├── server.js
│   ├── package.json
│   └── .env.example  # salin menjadi .env
└── frontend/         # React + Vite + Dexie
    ├── src/
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## Menjalankan lokal

```bash
# Backend
cd backend
cp .env.example .env   # isi KENARI_API_KEY
npm install
npm start              # :3102

# Frontend (terminal lain)
cd frontend
npm install
npm run dev
```

## Deploy ke VPS

```bash
# 1. Build frontend
cd frontend && npm run build        # -> dist/

# 2. Salin hasil build ke folder public backend, lalu salin keduanya ke server
#    Contoh layout di server: /opt/modulajar/{server.js,public/}
scp -r frontend/dist/* user@server:/opt/modulajar/public/
scp backend/server.js user@server:/opt/modulajar/

# 3. Pastikan env & restart service
#    /opt/modulajar/.env berisi KENARI_API_KEY=...
sudo systemctl restart modulajar.service
```

Backend menyajikan `public/` sebagai static, jadi satu service cukup
untuk API + frontend. Di produksi, nginx reverse-proxy ke `127.0.0.1:3102`
dengan TLS.

## Environment

| Variabel         | Wajib | Keterangan                          |
|------------------|-------|-------------------------------------|
| `KENARI_API_KEY` | Ya    | API key Kenari (model Agnes 3.0)    |
| `PORT`           | Tidak | Default `3102`                      |

## Catatan

- `KENARI_API_KEY` tidak pernah di-commit — hanya via `.env` di server.
- Data dokumen milik guru tersimpan di browser masing-masing (IndexedDB),
  bukan di server.
