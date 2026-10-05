# DESIGN-SENIOR — Varian "Ramah Guru Senior"

Varian desain alternatif ModulAjar untuk guru senior / orang tua.
Diterapkan sebagai lapisan override di akhir `src/styles.css`
(bagian `DESIGN-SENIOR`), menimpa skala tanpa mengubah struktur.

## Prinsip

1. **Huruf besar** — body 18px (dari 16px), isi dokumen 17.5px,
   judul seksi ≥20px. Tidak ada teks penting di bawah 14px.
2. **Kontras kuat** — teks redup (`--muted`) digelapkan
   `#8A7F70` → `#5C5348`. Tetap di atas kertas krem hangat.
3. **Tombol besar** — tinggi minimum 54px (tombol kecil 46px),
   font 17px. Di layar ponsel tombol aksi menjadi selebar layar
   agar mudah disentuh.
4. **Formulir lega** — input padding 15–16px, font 17px
   (sekaligus mencegah zoom otomatis di iPhone).
5. **Jarak bernapas** — kartu padding 30px, gap grid 22px,
   kartu dokumen min. 320px (lebih sedikit kolom = lebih besar).
6. **Fokus keyboard jelas** — `:focus-visible` outline merah 4px
   untuk yang memakai keyboard/tab.
7. **Langkah wizard terbaca** — label langkah 14px, angka 24px
   (di ponsel 12px/20px, bukan 9.5px).

## Yang TIDAK berubah

- Palet warm paper (#FBF6EE) + aksen bata (#B5362A).
- Alur runtut: 01 Ruang Perencanaan → 02 Dokumen Saya.
- Struktur komponen, nama kelas CSS, dan perilaku.
- Hormat `prefers-reduced-motion`.

## Cara kembali ke desain lama

Hapus blok `DESIGN-SENIOR` di akhir `src/styles.css`
dan kembalikan `--muted` ke `#8A7F70` di `:root`.
