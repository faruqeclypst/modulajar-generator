---
name: ModulAjar Modern Bersih
version: 1.0
description: Sistem desain aplikasi ModulAjar. Putih minimalis, aksen bata hemat, tipografi Inter.
dial: ENERGY 2 / RHYTHM 2 / MOTION 1

colors:
  paper: "#FFFFFF"
  paper-2: "#FFFFFF"
  soft: "#F7F8FA"
  ink: "#1A1D21"
  slate: "#3F4756"
  muted: "#6E7683"
  wash: "#F1F3F5"
  line: "#E5E7EB"
  red: "#C0392B"
  red-dark: "#96281B"
  ok: "#17803D"
  warn: "#B45309"
  focus: "#C0392B"

typography:
  family: '"Inter", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif'
  base: 16px
  base-large: 18px
  scale:
    display: { min: 36px, max: 54px, weight: 800, lineHeight: 1.04, letterSpacing: -1.5px }
    h1: { min: 26px, max: 34px, weight: 800, lineHeight: 1.15, letterSpacing: -0.8px }
    h2: { size: 22px, weight: 700, lineHeight: 1.25, letterSpacing: -0.3px }
    h3: { size: 18px, weight: 700, lineHeight: 1.3 }
    body: { size: 16px, weight: 400, lineHeight: 1.65 }
    small: { size: 13.5px, weight: 400, lineHeight: 1.55 }
    kicker: { size: 12px, weight: 700, letterSpacing: 2px, uppercase: true, color: "{colors.red}" }

spacing:
  base: 8px
  scale: [4, 8, 12, 16, 24, 32, 48, 72]
  wrap: 1120px
  narrow: 720px
  section-gap: 64px

radius:
  default: 14px
  control: 9px
  popover: 14px
  avatar: 999px
  chip: 999px

elevation:
  card: "0 1px 2px rgba(16,24,40,.05)"
  card-hover: "0 8px 24px rgba(16,24,40,.08)"
  popover: "0 16px 40px rgba(16,24,40,.16)"
  button: "none"

components:
  button-primary: { bg: "{colors.red}", text: "#FFFFFF", border: "none", padding: "13px 22px", fontWeight: 700, radius: "{radius.control}" }
  button-secondary: { bg: "#FFFFFF", text: "{colors.ink}", border: "1px solid {colors.line}", padding: "13px 22px", fontWeight: 700, radius: "{radius.control}" }
  button-danger: { bg: "#FFFFFF", text: "{colors.red-dark}", border: "1px solid {colors.red}", padding: "12px 20px", fontWeight: 700, radius: "{radius.control}" }
  input: { bg: "#FFFFFF", border: "1px solid {colors.line}", padding: "13px 14px", fontSize: 16px, radius: "{radius.control}" }
  focus-ring: "0 0 0 3px rgba(192,57,43,.18)"
  tap-target-min: 44px
---

# DESIGN.md — ModulAjar Modern Bersih v1

## Overview

ModulAjar adalah aplikasi web untuk guru Indonesia menyusun perangkat ajar
(CP, ATP, Prota, Prosem, Modul Ajar, LKPD, Bank Soal, KKTP) dengan bantuan AI.
Audiens utama: guru, termasuk guru senior yang tidak terbiasa dengan aplikasi
rumit. Desain harus terasa **bersih, ringan, dan bisa dipercaya**: putih
dominan, satu aksen bata yang hemat, tipografi Inter yang jernih.

Bahasa visual: kanvas putih, garis tipis abu-abu, sudut membulat lembut
(14px kartu, 9px kontrol), bayangan halus hanya untuk popover dan hover.
Tanpa tekstur kertas, tanpa bayangan kaku. Dokumen adalah warga kelas satu:
setiap layar memperlakukan dokumen seperti lembaran bersih yang siap dibaca.

**Dial: ENERGY 2 / RHYTHM 2 / MOTION 1.**
Tenang dan rapi. Komposisi konsisten antar layar. Gerak secukupnya dan selalu
punya tujuan: transisi antar layar (orientasi), langkah generate yang muncul
berurutan (keterbacaan alur), kursor ketik (penanda tulisan AI masih berjalan),
shimmer (sinyal menunggu event pertama server), tanpa scroll-reveal, tanpa
loop tanpa henti. Semua nonaktif saat prefers-reduced-motion.

### Referensi yang dipakai

- **Referensi desain Notion** ("document-native, warm, editable") dari direktori
  DESIGN.md (github.com/dimabraven/design-md, diakses lewat designmd-cli):
  dokumen sebagai pusat, permukaan hangat, editing terasa langsung.
  Dipakai sebagai inspirasi struktur, bukan dijiplak.
- **Prinsip aksesibilitas GOV.UK Design System**: satu hal per halaman,
  daftar lebih mudah dipindai daripada grid, teks besar, bahasa polos.
  Dipakai untuk keputusan yang ramah guru senior.
- **Format DESIGN.md** mengikuti spesifikasi google-labs-code/design.md
  (YAML front matter + bagian Markdown).

## Colors

| Token | Nilai | Pakai untuk |
|---|---|---|
| `--paper` | `#FFFFFF` | Latar halaman |
| `--paper-2` | `#FFFFFF` | Kartu, input, permukaan |
| `--soft` | `#F7F8FA` | Latar seksi halus (alternatif putih) |
| `--ink` | `#1A1D21` | Teks utama |
| `--slate` | `#3F4756` | Teks sekunder |
| `--muted` | `#6E7683` | Hint, metadata (min. 13.5px, harus lolos AA 4.5:1 di atas putih) |
| `--wash` | `#F1F3F5` | Isian halus (langkah selesai, hover) |
| `--line` | `#E5E7EB` | Garis border semua komponen |
| `--red` | `#C0392B` | Satu-satunya aksen: CTA primer, fokus, momen penting |
| `--red-dark` | `#96281B` | Hover CTA primer |
| `--ok` | `#17803D` | Status berhasil |
| `--warn` | `#B45309` | Status menunggu/perhatian |

Aturan:

- Palet aktif: netral dingin + **satu** aksen bata. Tidak ada biru, ungu,
  gradien, atau warna neon di mana pun.
- Aksen bata hanya di momen kunci: tombol aksi utama tiap layar, indikator
  fokus, penanda status penting. Bukan di setiap ikon dan garis.
- Semua teks harus lolos WCAG AA (4.5:1 teks normal, 3:1 teks besar).
  Verifikasi dengan contrast checker sebelum mengganti nilai warna.
- Border selalu 1px solid line pada kartu, tombol sekunder, dan input.
  Garis tipis adalah identitas kebersihan tema ini.

## Typography

- Keluarga: **Inter** (fallback Segoe UI, system-ui, Arial). Alasan: grotesk
  netral yang jernih di layar, sangat terbaca oleh mata senior.
- Basis 16px, line-height 1.65. Pengaturan "Teks besar" menaikkan basis ke 18px.
- Judul memakai huruf biasa (sentence case) dengan letter-spacing rapat
  (-0.8px). Tidak ada uppercase berteriak kecuali kicker kecil.
- Kicker: label seksi kecil (12px, 700, tracking 2px, uppercase) berwarna bata,
  tanpa latar. Satu kicker per seksi, bukan per kartu.
- Tidak ada teks di dalam gambar. Tidak ada font monospace sebagai estetika.

## Layout & Spacing

- Skala spacing 8px: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 72. Jarak antar seksi
  56px di desktop, 40px di mobile.
- Lebar konten 1120px (`.wrap`), 720px untuk layar baca dan pengaturan
  (`.wrap.narrow`). Tidak ada max-width ad-hoc lain untuk kontainer halaman;
  semua view memakai salah satu dari dua ini agar lebar terasa konsisten.
- Mobile-first. Target sentuh minimal 44px. Tidak ada overflow horizontal
  di 360px, 390px, 768px, 1280px. Hero memakai clamp agar tidak raksasa
  di desktop dan tidak meluber di mobile. Grid kartu menjadi 1 kolom
  di mobile. Tabel di dokumen bisa scroll horizontal di dalam kontainernya
  (`overflow-x: auto`) tanpa merusak layout halaman.
- Posisi halaman bertahan saat refresh: view + id dokumen tersimpan di
  localStorage (`ma-view`) setiap berubah, direstore setelah login
  (detail menunggu `getModul` selesai; gagal → fallback beranda),
  dihapus saat logout.
- Ritme: layar kerja (daftar dokumen, job) memakai daftar/kartu yang mudah
  dipindai; layar baca memakai kolom sempit. Variasi mengikuti kebutuhan
  konten, bukan template.
- Latar halaman polos putih. Tidak ada tekstur, pola, atau dot grid.
  Kebersihan adalah identitasnya.

## Elevation & Shapes

- Bayangan halus dan hemat: kartu memakai `0 1px 2px rgba(16,24,40,.05)`
  sebagai definisi, bukan dekorasi. Hover kartu boleh naik ke bayangan lembut
  yang sedikit lebih besar. Popover/modal memakai bayangan besar yang lembut.
- Tombol tidak berbayang; hierarki dibangun dari warna dan border.
- Radius: 14px kartu dan panel, 9px tombol dan input, 14px popover dan menu.
  Lingkaran penuh untuk avatar pengguna dan chip status.

## Components

### Tombol

- Primer: latar bata, teks putih, tanpa border, tanpa shadow, radius 9px.
  Satu tombol primer per kelompok aksi; sisanya sekunder.
- Sekunder: latar putih, teks ink, border 1px line.
- Bahaya (Keluar, Batalkan job): teks/border bata di atas putih, bukan
  latar merah penuh.
- Hover: primer menggelap ke red-dark; sekunder border menggelap. Tanpa
  efek geser/terangkat. Focus: ring lembut `0 0 0 3px rgba(192,57,43,.18)`.
- Label aksi spesifik produk: "Buat Modul Ajar", "Buka Ruang Perencanaan",
  "Masuk dengan Google". Bukan "Mulai", "Kirim", "OK".

### Input & Form

- Label di atas input: 13px, 700, warna slate. Tanda wajib (*)
  berwarna bata.
- Input: 1px border line, radius 9px, padding 13-14px, font 16px (mencegah
  zoom otomatis di iOS). Focus: border bata + ring lembut.
- Hint di bawah input: 12.5px muted. Error: teks bata + border bata,
  dengan pesan yang menyebut cara memperbaiki.
- `FormulirDasar` (`components/FormulirDasar.jsx`): satu komponen untuk field
  identitas pembelajaran (Nama Guru, NIP Guru opsional, Sekolah, Tahun Ajaran,
  Jenjang, Fase, Kelas, Semester, Mata Pelajaran). Dipakai di Wizard, Generator
  Paket, Ruang Perencanaan, dan form proyek: urutan, label, placeholder, dan
  perilaku (ganti jenjang me-reset fase dan mapel) selalu sama di semua jalur.
  Field khusus tiap jalur (daftar topik, materi) tetap di jalurnya
  masing-masing, di bawahnya, dengan gaya yang sama.

### Kartu

- Kartu dokumen: permukaan putih, border 1px line, radius 14px, bayangan
  halus, padding 20-26px. Hover: bayangan sedikit membesar. Isi: chip tipe
  dokumen, judul (h3), meta (chip jenjang/mapel), tanggal, satu aksi "Buka".
- Chip status hanya untuk status nyata (tipe dokumen, progres paket).
  Bukan label dekoratif.

### Topbar & Menu Pengguna

- Topbar: latar putih, sticky dengan border-bottom 1px line, tanpa wrap.
  Tiga zona: **logo** (kiri), **navigasi** (tengah), **area akun** (kanan,
  dipisah divider tipis di desktop).
- Logo: kotak bata berisi "M" (radius 9px), nama "ModulAjar" + sub
  "Perangkat Ajar AI"; di layar sangat kecil hanya kotak "M".
- Navigasi: Proyek Saya, Ruang Perencanaan, Generator Paket. Item yang aktif
  mengikuti konteks, bukan sekadar URL: view detail proyek ikut menyalakan
  "Proyek Saya". View non-navigasi (wizard, pengaturan, docs, admin) tidak
  menyalakan item mana pun; orientasi dibantu judul halaman masing-masing.
- Pil kredit: status ringkas ("20 Kredit" + titik hijau; "Admin" untuk akun
  admin) yang juga tombol menuju Pengaturan. Bukan sekadar badge.
- Chip pengguna: foto profil Google bila ada, fallback avatar inisial + nama
  depan. Membuka satu-satunya menu akun: **Pengaturan**, **Panduan**,
  **Dashboard Admin** (khusus admin), lalu **Keluar**. Menu tajam (radius 0)
  mengikuti bahasa visual kertas; tidak ada radius membulat di topbar.
- Satu menu akun, tidak dua: panel mobile hanya berisi 3 item navigasi.
  Pengaturan/Panduan/Keluar hanya ada di menu avatar, agar tidak ada duplikat
  yang membingungkan.
- Item nav tidak pernah wrap dua baris (`white-space: nowrap`).
- Di bawah 980px, navigasi menciut menjadi tombol "Menu" (dengan aria-label
  "Buka/Tutup navigasi") yang membuka daftar vertikal 3 item. Batas 980px
  (bukan 760px) agar tidak berdesakan di laptop kecil / zoom besar.
  Tidak ada link mati.

### Layar Login

- Kartu terpusat di kolom narrow: logo, kicker "Untuk Guru Indonesia",
  headline yang menyebut hasil ("Perangkat ajar lengkap dalam hitungan
  menit"), 3 poin nilai singkat, tombol "Masuk dengan Google" (latar putih,
  border 2px ink, ikon "G" Google, teks 16px).
- Di bawah tombol: satu baris penjelas, "Datamu tersimpan di akunmu dan bisa
  dibuka dari perangkat mana pun." Tanpa klaim keamanan yang tidak bisa
  dibuktikan, tanpa testimoni palsu.
- Error login tampil sebagai alert bata di atas tombol, menyebut penyebab
  dan langkah berikutnya.

### Pengaturan

- Halaman/kartu "Pengaturan" berisi seksi nyata saja:
  1. **Profil**: foto profil Google (72px; fallback inisial bila tidak ada),
     nama, email dari Google (read-only).
  2. **Kredit & Langganan**: sisa kredit ("20 kredit/hari, diperbarui setiap
     jam 15:00 WIB") + tombol Upgrade.
  3. **Kunci AI Sendiri**: pakai API key sendiri agar generate tidak memotong
     kuota. Form Base URL + API Key (password) + Model opsional; status Aktif
     (baseUrl + keyMasked) vs Belum diatur; tombol Simpan/Ganti/Hapus.
  4. **Bagikan & Bonus**: link referal + "Salin Link"; "+3 kredit bonus untuk
     tiap teman yang bergabung lewat linkmu (maks 5 per 3 hari). Bonus
     dihitung ulang tiap 3 hari."; "Bonus periode ini: X",
     "Tautan diklaim: Y/5".
  5. **Tampilan**: Ukuran teks (Normal/Besar). Fungsional, tersimpan di
     localStorage, langsung diterapkan.
  6. **Data**: info "Dokumen tersimpan di akunmu (Supabase)" + tombol
     "Muat ulang data".
  7. **Bantuan**: tombol "Chat WhatsApp" (link WA yang sudah ada).
  8. **Data Kepegawaian**: NIP Guru, Nama Kepala Sekolah, NIP Kepala Sekolah
     (semuanya opsional). Disimpan di profil perangkat, dipakai di Lembar
     Pengesahan dokumen.
  9. **Keluar**: tombol bahaya "Keluar dari aplikasi" dengan konfirmasi.
- Landing menangkap `?ref=KODE` ke localStorage `ma-ref`; setelah login
  pertama, `POST /api/referal/klaim` dipanggil sekali otomatis lalu `ma-ref`
  dihapus. Gagal klaim ditangani diam-diam.
- Tidak ada pengaturan palsu. Setiap kontrol harus benar-benar bekerja.

### Status: kosong, memuat, error

- Kosong: sebutkan kenapa kosong + satu aksi pengisi. ("Belum ada dokumen.
  Mulai dari Ruang Perencanaan agar alurnya runtut." + tombol.)
- Memuat: sebutkan apa yang dimuat. ("Menyiapkan aplikasi...", "Membuat
  ATP... (langkah 2 dari 5)").
- Error: sebutkan apa yang gagal + apa yang bisa dilakukan. ("Gagal
  memuat dokumen. Periksa koneksi, lalu Muat ulang.")

### Job / Progres Paket

- Pelacakan job: daftar langkah vertikal (bukan grid), tiap langkah
  berstatus: selesai (centang hijau), berjalan (spinner + label langkah),
  antri (muted), gagal (bata + tombol "Coba lagi").
- Bilah progres: balok 2px border ink berisi isian bata, dengan label
  "Langkah 3 dari 9".
- Status paket memakai kata Indonesia: Menunggu, Berjalan, Menunggu
  review, Selesai, Gagal, Dibatalkan.

### Modal & Alert

- Modal: overlay ink 60%, kartu paper-2 border 2px ink shadow kaku,
  bisa ditutup dengan Escape dan tombol tutup, fokus terperangkap di dalam.
- Alert info: border ink, latar wash. Alert error: border bata, teks bata
  gelap. Selalu berisi tindakan ("Muat ulang", "Coba lagi").

### Kredit & Paywall

- Istilah user-facing: **"Kredit"**, bukan "Kuota". Aturan: 1 dokumen selesai
  dibuat = 1 kredit. User biasa mendapat `KUOTA_HARIAN` kredit per hari, reset
  harian WIB. Admin (`ADMIN_EMAILS`, default faruq.blogger@gmail.com,
  komparasi case-insensitive): tanpa batas, tidak dihitung. Nama tabel, env,
  dan fungsi backend tetap memakai "kuota".
- Generate dokumen tunggal memakai endpoint SSE `POST /api/generate-doc/stream`
  yang menampilkan tahapan asli server (pahami, fondasi, kegiatan, koreksi
  bila ada, asesmen, materi, rakit; satu tahap "susun" untuk dokumen non-modul).
  Setiap tahap juga mengalirkan potongan teks mentah AI (`{tipe:'teks', key,
  delta}`) yang ditampilkan di panel "Lihat tulisan AI" (collapsible,
  auto-scroll, default terbuka saat generate berjalan).
- Pembuatan paket (`POST /api/paket`) mengecek kredit di awal: estimasi =
  jumlah dokumen paket. Job yang sudah berjalan tidak diblokir di tengah jalan.
  Di mode pantau, langkah yang sedang berjalan menampilkan kartu
  "Sedang ditulis AI" berisi tulisan realtime dari `progress.live`.
- Komponen: `ProsesLive` (stepper vertikal tahapan asli + bilah progres +
  timer + panel `TulisanAI`, gaya kartu job), `Paywall` (modal dua mode:
  kuota_habis dan upgrade; tombol "Upgrade Sekarang" memanggil seam
  `lib/bayar.js mulaiUpgrade()` yang masih stub dan jujur menampilkan
  "Pembayaran segera hadir" + opsi WhatsApp), pil kredit di topbar
  ("Kredit X/Y" atau "Admin", klik membuka Pengaturan), seksi
  "Kredit & Langganan" di Pengaturan, baris "Sisa kredit hari ini: X"
  di atas tombol generate (Wizard step 4 dan form Generator Paket).
- Copy jujur: "Kredit harian habis. Kredit diperbarui besok." Tanpa klaim palsu,
  tanpa countdown palsu.

## Screens

1. **Login**: kartu terpusat (lihat komponen Layar Login).
2. **Landing**: hero pernyataan + 2 CTA, pita berjalan berisi tipe dokumen
   (satu-satunya gerak ambient; lambat, bisa dijeda dengan
   prefers-reduced-motion), fitur sebagai daftar kartu per tipe dokumen,
   cara kerja mengikuti alur nyata 4 tahap, pita CTA, footer.
3. **Beranda (Proyek Saya)**: kartu hero "Ruang Perencanaan" (langkah 01)
   + daftar proyek (langkah 02). Satu proyek = satu mata pelajaran (+ kelas,
   semester, tahun ajaran); kartu proyek menampilkan jumlah dokumen dan aksi
   Buka / Ubah / Hapus (hapus proyek tidak menghapus dokumennya: dokumen
   pindah ke "Tanpa Proyek"). Di bawahnya seksi "Tanpa Proyek" untuk dokumen
   yang belum dikelompokkan. Proyek disimpan di localStorage (`ma-projects`);
   dokumen menunjuk proyek lewat `projectId` di meta. Migrasi sekali jalan
   (`ma-migrasi-proyek-v1`): paket perencanaan lama menjadi proyek.
4. **Ruang Perencanaan**: berbasis proyek. Pilih proyek di atas (atau buat
   baru), lalu 5 langkah CP, ATP, Minggu Efektif, Prota, Prosem sebagai langkah
   berurutan dengan status per langkah. Dokumen perencanaan tersimpan dengan
   `projectId`; baris paket legacy tertaut tetap dipelihara agar pemilih
   "Paket Perencanaan" di Wizard terus berfungsi.
5. **Generator Paket**: form paket + pilih/buat proyek + daftar topik +
   unggahan, lalu mode pantau job (langkah vertikal + progres + jeda review
   opsional). `projectId` dikirim lewat info job sehingga semua dokumen hasil
   tersimpan di proyek tersebut.
6. **Wizard**: form multi-langkah pembuatan dokumen tunggal. Langkah Informasi
   diawali pemilih Proyek: memilih proyek mengisi info otomatis dan mengatur
   acuan dari dokumen perencanaan proyek itu; pemilih acuan manual (paket,
   modul acuan, dokumen tersimpan) tetap berfungsi sebagai override.
   Dokumen tersimpan dengan `projectId` bila proyek dipilih.
7. **Detail Proyek**: judul + meta proyek, tombol "Buka Ruang Perencanaan" dan
   "Buat Modul Ajar", seksi Perencanaan (5 langkah dengan status), lalu grup
   Modul Ajar / LKPD / Penilaian. Posisi detail proyek bertahan saat refresh
   (`ma-view` menyimpan `projectId`).
8. **DocView / Editor**: kertas dokumen A4 dengan blok yang bisa diedit,
   toolbar aksi (regenerasi, gambar, ekspor).

### Tema Dokumen

Hasil dokumen punya 3 tema tampilan yang bisa dipilih guru di toolbar
(segmented control, tersimpan di localStorage `ma-tema-dokumen`):
1. **Kertas Hangat** (bawaan): identitas Warm Paper, untuk dibaca di aplikasi.
2. **Resmi**: serif Times New Roman, judul rata tengah, teks justify, margin
   resmi. Untuk dokumen yang diserahkan ke sekolah.
3. **Modern**: sans bersih, heading rata kiri dengan aksen bata tipis sebagai
   penanda hierarki. Untuk dibaca di layar.
Tema berlaku konsisten di pratinjau (`DocPaper`), ekspor Word (`docxExport`),
dan cetak/PDF (varian `@media print` per tema). Lembar Pengesahan mengikuti
tema (serif penuh di tema Resmi).

## Bahasa & Copy

- Bahasa Indonesia, kalimat pendek, nada membantu seperti rekan guru.
- Tanpa em dash (—) di teks mana pun. Tanpa emoji di UI.
- CTA spesifik: "Buat Modul Ajar", "Buka Ruang Perencanaan", "Masuk dengan
  Google", "Muat ulang", "Coba lagi".
- Tanpa buzzword AI ("AI Powered", "Revolusioner", "Seamless").
- Angka hanya dari data nyata. Tidak ada statistik atau testimoni palsu.

## Do's and Don'ts

- LAKUKAN: satu aksen bata di momen kunci; border 2px ink yang konsisten;
  target sentuh 44px; status kosong/muat/error yang menyebut langkah
  berikutnya; fokus keyboard yang selalu terlihat.
- JANGAN: gradien (terutama biru-ungu), glassmorphism, glow, grid bento,
  badge kapsul "AI Powered", ikon generik tanpa makna (sparkle, robot),
  panah di setiap tombol, bayangan lembut di semua elemen, dark mode
  default, link navigasi mati, tombol yang tidak berbuat apa-apa.
- JANGAN menjiplak tampilan Notion/Linear/Stripe/Vercel. Referensi di atas
  adalah inspirasi prinsip, identitas tetap milik ModulAjar.

## Alasan Keputusan (R-31)

- Kertas hangat + tinta: produk menghasilkan dokumen cetak; bahasanya
  bahasa cetak, bukan bahasa dashboard SaaS.
- Satu aksen bata `#B5362A`: identitas yang sudah ada sejak awal; dipakai
  hemat agar tiap kemunculannya berarti.
- Bayangan kaku offset: motif "kertas bertumpuk", satu-satunya efek
  kedalaman yang dipakai.
- Archivo: grotesk tegas yang hangat, terbaca besar oleh guru senior.
- Ukuran teks 16px + opsi Teks besar: audiens senior; 16px juga mencegah
  zoom otomatis di iOS.
- Daftar vertikal untuk langkah job: mengikuti prinsip GOV.UK, daftar lebih
  mudah dipindai daripada kartu grid.
- Menu pengguna (bukan tombol Keluar telanjang): keluar adalah aksi akun,
  dikelompokkan dengan profil dan pengaturan.
- Radius 0: potongan kertas; lingkaran hanya untuk manusia (avatar).
- MOTION 2: audiens guru, perangkat kelas bervariasi; gerak sebagai umpan
  balik dan orientasi, masing-masing dengan tujuan tertulis: transisi view
  (tahu layar berganti), stagger langkah (mata mengikuti urutan), kursor
  ketik dan shimmer (tahu AI sedang bekerja). Tanpa gerak ambient tanpa
  tujuan; semua mati saat prefers-reduced-motion.
