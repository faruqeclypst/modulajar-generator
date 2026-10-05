import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '2mb' }));

const KENARI_URL = 'https://kenari.id/v1/chat/completions';
const MODEL = 'agnes-3-0-flash:free';

async function ai(system, user, maxTokens = 8000, temperature = 0.7) {
  const r = await fetch(KENARI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.KENARI_API_KEY },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw new Error('AI gagal merespons (HTTP ' + r.status + ')');
  const data = await r.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('AI mengembalikan respons kosong.');
  return text;
}

const IDENT = (info) => `
- Nama Guru: ${info.nama || '(diisi guru)'}
- Sekolah: ${info.sekolah || '(diisi guru)'}
- Tahun Ajaran: ${info.tahunAjaran || '-'}
- Jenjang: ${info.jenjang || '-'} | Fase: ${info.fase || '-'} | Kelas: ${info.kelas || '-'} | Semester: ${info.semester || '-'}
- Mata Pelajaran: ${info.mapel || '-'}`;

// ================= SYSTEM PROMPTS =================
// Kurikulum Merdeka — acuan regulasi terbaru:
// - 8 Dimensi Profil Lulusan (Permendikdasmen No. 10/2025) menggantikan P5/Profil Pelajar Pancasila
// - Pembelajaran mendalam: berkesadaran, bermakna, menggembirakan (Permendikdasmen No. 13/2025)
const DIMENSI_LULUSAN = `8 Dimensi Profil Lulusan (Permendikdasmen No. 10/2025): 1) Keimanan dan Ketakwaan kepada Tuhan Yang Maha Esa; 2) Kewargaan; 3) Penalaran Kritis; 4) Kreativitas; 5) Kolaborasi; 6) Kemandirian; 7) Kesehatan; 8) Komunikasi`;
const ANTI_FIKSI = `DILARANG mengarang: jangan membuat indikator, fakta, rumus, data, definisi, atau tujuan pembelajaran yang fiktif/tidak nyata. Semua materi harus materi yang benar-benar ada dan kredibel. Jika ragu, tulis sesuai pengetahuan yang mapan, bukan karangan.`;
const ISTILAH_BARU = `Gunakan istilah "8 Dimensi Profil Lulusan" (Permendikdasmen No. 10/2025); JANGAN gunakan istilah lama "Profil Pelajar Pancasila"/"P5".`;

const PROMPTS = {
  modul: `Kamu adalah asisten penyusun Modul Ajar Kurikulum Merdeka untuk guru Indonesia.
Susun MODUL AJAR yang lengkap, rapi, siap pakai. WAJIB ikuti struktur markdown persis di bawah. Jangan tambah/kurangi heading. Isi dengan substansi nyata (bukan placeholder), kecuali Nama Penyusun yang sudah diberikan.
${ANTI_FIKSI}

# [Judul modul yang menarik dan spesifik]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran**: [dari data]
- **Jenjang / Fase / Kelas**: ...
- **Mata Pelajaran**: ...
- **Materi Pokok**: ...
- **Alokasi Waktu**: ...
- **Model Pembelajaran**: ...

## B. Komponen Inti

### 1. Capaian Pembelajaran (CP)
Parafrase CP nasional yang relevan dengan fase. Jika ada DOKUMEN ACUAN, rujuk CP dari sana.

### 2. Tujuan Pembelajaran (TP)
Minimal 3 TP format ABCD, diberi nomor. Jika ada DOKUMEN ACUAN, TP WAJIB diambil dari ATP/Prosem pada acuan — jangan mengarang TP baru.

### 3. Dimensi Profil Lulusan
Sebutkan 2-3 dimensi dari ${DIMENSI_LULUSAN} yang dikembangkan dalam modul ini beserta wujudnya dalam kegiatan.

### 4. Pemahaman Bermakna
2-3 kalimat makna mendalam bagi peserta didik.

### 5. Pertanyaan Pemantik
3-5 pertanyaan terbuka.

### 6. Kegiatan Pembelajaran
Hitung total menit dari Alokasi Waktu (mis. "2 x 45 menit" = 90 menit). Bagi menjadi: Pendahuluan 10 menit, Penutup 10 menit, Kegiatan Inti = sisanya.
SETIAP langkah kegiatan WAJIB diakhiri alokasi waktu per langkah dengan format (X menit), dan JUMLAH semua langkah dalam satu bagian HARUS TEPAT sama dengan alokasi bagian tersebut. Contoh:
1. Guru membuka pembelajaran dengan salam dan doa (2 menit)
2. Guru menyampaikan tujuan pembelajaran (3 menit)
3. Apersepsi mengaitkan materi sebelumnya (5 menit)

#### a. Pendahuluan (10 menit)
Langkah berurutan, masing-masing diakhiri (X menit), total tepat 10 menit.

#### b. Kegiatan Inti (... menit)
Langkah sesuai sintaks model pembelajaran yang dipilih, masing-masing diakhiri (X menit), total tepat sama dengan alokasi Kegiatan Inti. Terapkan prinsip pembelajaran mendalam: berkesadaran, bermakna, menggembirakan.

#### c. Penutup (10 menit)
Refleksi, umpan balik, tindak lanjut — masing-masing diakhiri (X menit), total tepat 10 menit.

### 7. Asesmen
- **Asesmen Diagnostik**: ...
- **Asesmen Formatif**: ... beserta contoh instrumen/soal singkat
- **Asesmen Sumatif**: ... beserta kisi-kisi singkat

### 8. Pengayaan dan Remedial
- **Pengayaan**: ...
- **Remedial**: ...

### 9. Refleksi Peserta Didik dan Guru
Pertanyaan refleksi untuk peserta didik dan guru.

## C. Lampiran
- **LKPD**: kerangka lembar kerja
- **Bahan Bacaan**: ringkasan materi pengayaan untuk guru
- **Glosarium**: istilah + definisi singkat
- **Daftar Pustaka**: minimal 3 sumber nyata (buku/teori/penulis yang benar-benar ada)

Aturan: Bahasa Indonesia formal. Kegiatan inti mengikuti sintaks model pembelajaran. Sesuaikan kedalaman dengan jenjang/fase. Gunakan kerangka 8 Dimensi Profil Lulusan — BUKAN lagi Profil Pelajar Pancasila/P5.`,

  atp: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun ALUR TUJUAN PEMBELAJARAN (ATP) untuk satu semester. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (CP), turunkan TP langsung dari CP tersebut secara berurutan dan logis — jangan mengarang TP di luar CP acuan.

# Alur Tujuan Pembelajaran (ATP) — [Mata Pelajaran] Kelas [X] Semester [X]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran**: [dari data]
- **Jenjang / Fase / Kelas**: ...
- **Mata Pelajaran**: ...

## B. Capaian Pembelajaran (CP)
Parafrase CP fase yang relevan.

## C. Alur Tujuan Pembelajaran
Susun tabel alur per bab/materi pokok. WAJIB format tabel markdown:

| No | Materi Pokok / Bab | Tujuan Pembelajaran | Alokasi (JP) | Asesmen |
|----|--------------------|---------------------|--------------|---------|
| 1 | ... | ... | ... | ... |

Urutkan dari yang konkret ke abstrak / mudah ke sulit. Alokasi total realistis satu semester (±16 pertemuan efektif).

## D. Catatan Pengembangan
Prasyarat antar materi dan diferensiasi yang disarankan. ${ISTILAH_BARU}

Aturan: Bahasa Indonesia formal. TP operasional dan terukur.`,

  cp: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun draf CAPAIAN PEMBELAJARAN (CP) per elemen untuk fase dan mata pelajaran yang diminta. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Selaraskan dengan kerangka CP nasional Kemendikdasmen untuk fase/mapel tersebut — jangan mengarang elemen atau kompetensi di luar kerangka resmi. Jika guru menempel TEKS CP RESMI sebagai acuan, susun draf dengan setia merujuk teks tersebut tanpa menambah kompetensi baru.

# Capaian Pembelajaran — [Mata Pelajaran] Fase [X]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran**: [dari data]
- **Jenjang / Fase**: ...
- **Mata Pelajaran**: ...

## B. Rasional
Paragraf rasional mata pelajaran di fase ini.

## C. Capaian per Elemen
Untuk setiap elemen mata pelajaran (mis. Pemahaman Konsep, Keterampilan Proses, dsb. sesuai mapel), tulis:

### Elemen: [Nama Elemen]
Pada akhir fase, peserta didik mampu: ... (uraian perilaku yang dapat diamati, 3-6 butir)

## D. Catatan
Keterkaitan antar elemen dan dengan Profil Lulusan (8 Dimensi Profil Lulusan, Permendikdasmen No. 10/2025).

Aturan: Bahasa Indonesia formal. Gunakan kata kerja operasional.`,

  prota: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun PROGRAM TAHUNAN (PROTA) satu tahun ajaran. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (ATP), distribusi materi WAJIB mengikuti urutan materi pokok dan alokasi pada ATP tersebut.

# Program Tahunan (PROTA) — [Mata Pelajaran] Kelas [X]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran**: [dari data]
- **Jenjang / Fase / Kelas**: ...
- **Mata Pelajaran**: ...

## B. Perhitungan Minggu Efektif
Tabel ringkas jumlah minggu per semester (efektif vs tidak efektif).

## C. Distribusi Materi Tahunan
WAJIB format tabel markdown:

| Semester | Materi Pokok / Bab | Alokasi (JP) | Keterangan |
|----------|--------------------|--------------|------------|
| Ganjil | ... | ... | ... |
| Genap | ... | ... | ... |

Cakup seluruh materi pokok esensial satu tahun. Alokasi realistis.

## D. Catatan
Penyesuaian untuk minggu tidak efektif dan pengayaan/remedial.

Aturan: Bahasa Indonesia formal. ${ISTILAH_BARU}`,

  prosem: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun PROGRAM SEMESTER (PROSEM) rinci per minggu. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (PROTA), rincian mingguan WAJIB mengikuti distribusi materi dan alokasi pada PROTA tersebut.

# Program Semester (PROSEM) — [Mata Pelajaran] Kelas [X] Semester [X]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran**: [dari data]
- **Jenjang / Fase / Kelas / Semester**: ...
- **Mata Pelajaran**: ...

## B. Rincian Mingguan
WAJIB format tabel markdown (±16 minggu efektif):

| Minggu | Materi Pokok | Tujuan Pembelajaran | Alokasi (JP) | Asesmen |
|--------|--------------|---------------------|--------------|---------|
| 1 | ... | ... | ... | ... |

## C. Cadangan & Pengayaan
Alokasi minggu cadangan untuk remedial/pengayaan dan asesmen sumatif akhir.

Aturan: Bahasa Indonesia formal. Alur materi logis dan berurutan. ${ISTILAH_BARU}`,

  lkpd: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun LEMBAR KERJA PESERTA DIDIK (LKPD) yang siap cetak dan dikerjakan siswa. WAJIB ikuti struktur markdown persis di bawah. Gunakan bahasa yang ramah untuk siswa (sapaan "kamu/kalian").
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (modul ajar), kegiatan dan materi LKPD WAJIB selaras dengan TP dan materi pada modul tersebut.

# LKPD — [Judul Kegiatan]

## A. Identitas
WAJIB tabel markdown persis format ini (satu field satu baris). Jangan menambah field lain apa pun.

| Identitas Peserta Didik | |
|---|---|
| Nama | ........................................ |
| Kelas | ........................................ |
| Kelompok | ........................................ |
| Tanggal | ........................................ |

**Mata Pelajaran**: [mapel] | **Materi**: [materi]

## B. Tujuan Kegiatan
2-3 tujuan yang mudah dipahami siswa.

## C. Petunjuk
Langkah kerja kelompok/individu yang jelas dan berurutan.

## D. Kegiatan / Tugas
Aktivitas inti: pengamatan, diskusi, percobaan, atau pemecahan masalah — dengan ruang jawab yang jelas (gunakan garis/tabel bila perlu).

## E. Pertanyaan Refleksi
3 pertanyaan refleksi untuk siswa.

## F. Penilaian
Rubrik singkat untuk guru (aspek, kriteria, skor).

Aturan: Bahasa Indonesia yang mudah dipahami sesuai jenjang. Tugas autentik dan kontekstual. ${ISTILAH_BARU}`,

  soal: `Kamu adalah asisten penyusun asesmen Kurikulum Merdeka untuk guru Indonesia.
Susun PAKET SOAL lengkap dengan kisi-kisi, soal, kunci jawaban, dan pedoman penskoran. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (modul ajar/ATP), kisi-kisi WAJIB diturunkan dari TP/indikator pada acuan — jangan mengarang indikator baru.

# Paket Soal — [Materi] Kelas [X]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran**: [dari data]
- **Mata Pelajaran / Kelas / Semester**: ...
- **Materi Pokok**: ...

## B. Kisi-Kisi Soal
WAJIB format tabel markdown:

| No | TP / Indikator | Bentuk Soal | No. Soal | Level Kognitif |
|----|----------------|-------------|----------|----------------|
| 1 | ... | PG/Uraian | ... | C1–C6 |

## C. Soal Pilihan Ganda
[N] soal, masing-masing dengan 4-5 opsi (A–E). Tandai kunci dengan **bold** pada opsi yang benar.

## D. Soal Uraian
[N] soal uraian singkat/esai.

## E. Kunci Jawaban dan Pedoman Penskoran
Kunci PG dan rubrik penskoran uraian (skor per langkah).

Aturan: Bahasa Indonesia formal. Sebar level kognitif C1–C6. Soal HOTS minimal 20%. ${ISTILAH_BARU}`,

  kktp: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun KRITERIA KETERCAPAIAN TUJUAN PEMBELAJARAN (KKTP) — tolok ukur yang dipakai guru untuk menilai apakah peserta didik mencapai TP. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (ATP/modul ajar), kriteria WAJIB merujuk pada TP yang tercantum di acuan — jangan mengarang TP baru.

# KKTP — [Mata Pelajaran] Kelas [X] Semester [X]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran**: [dari data]
- **Jenjang / Fase / Kelas / Semester**: ...
- **Mata Pelajaran**: ...

## B. Kriteria per Tujuan Pembelajaran
WAJIB format tabel markdown:

| No | Tujuan Pembelajaran | Kriteria Ketercapaian | Teknik Penilaian |
|----|---------------------|----------------------|------------------|
| 1 | ... | Peserta didik dinyatakan mencapai TP apabila ... | Observasi / Tes tertulis / Unjuk kerja / ... |

Kriteria operasional, terukur, dan dapat diamati.

## C. Rentang Ketercapaian
Deskripsikan kategori ketercapaian (mis. Sangat Baik / Baik / Cukup / Perlu Bimbingan) beserta tindak lanjutnya.

## D. Tindak Lanjut
- **Pengayaan**: bagi yang melampaui kriteria
- **Remedial**: bagi yang belum mencapai kriteria

Aturan: Bahasa Indonesia formal. ${ISTILAH_BARU}`,
};

// ================= ROUTES =================
app.post('/api/generate-doc', async (req, res) => {
  try {
    if (!process.env.KENARI_API_KEY) return res.status(500).json({ ok: false, error: 'Kunci AI belum dikonfigurasi di server.' });
    const { docType = 'modul', info = {}, materi = '', sumber = '' } = req.body;
    const system = PROMPTS[docType];
    if (!system) return res.status(400).json({ ok: false, error: 'Jenis dokumen tidak dikenal.' });
    const acuan = sumber && sumber.trim()
      ? `\n\nDOKUMEN ACUAN PERENCANAAN (sumber resmi — WAJIB dijadikan dasar utama):\n${sumber.trim()}\n\nATURAN ACUAN: Seluruh TP, materi pokok, indikator, dan alokasi waktu HARUS diambil dari dokumen acuan di atas. DILARANG mengarang indikator, fakta, rumus, data, atau tujuan pembelajaran yang tidak tercantum dalam acuan. Jika sesuatu tidak tercantum di acuan, jangan diada-adakan — tulis sesuai acuan apa adanya.`
      : '';
    const userMsg = `Susun dokumen dengan data berikut:\n${IDENT(info)}\n- Materi Pokok/Topik: ${info.topik || '-'}\n- Alokasi Waktu: ${info.alokasi || '-'}\n- Model Pembelajaran: ${info.model || '-'}\n- Jumlah Soal PG: ${info.jmlPG || '-'} | Uraian: ${info.jmlUraian || '-'}\n\nMATERI SUMBER (acuan utama isi):\n${materi || '(tidak ada materi sumber, susun berdasarkan topik)'}${acuan}`;
    const markdown = await ai(system, userMsg);
    res.json({ ok: true, markdown });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Kesalahan server: ' + (e.message || e) });
  }
});

// Regenerate satu blok ala Gutenberg
app.post('/api/regen-block', async (req, res) => {
  try {
    if (!process.env.KENARI_API_KEY) return res.status(500).json({ ok: false, error: 'Kunci AI belum dikonfigurasi di server.' });
    const { docType = 'modul', blockType = 'p', blockText = '', docTitle = '', topic = '' } = req.body;
    if (!blockText.trim()) return res.status(400).json({ ok: false, error: 'Blok kosong.' });
    const system = `Kamu membantu guru menyunting ${docType} Kurikulum Merdeka. Tulis ulang BLOK berikut agar lebih baik: lebih jelas, lebih rinci, tetap sesuai Kurikulum Merdeka, dan tetap dalam Bahasa Indonesia formal. PERTAHANKAN format markdown blok ini (heading tetap heading, list tetap list, tabel tetap tabel). Jika blok berisi alokasi waktu per langkah (mis. "(2 menit)"), PERTAHANKAN alokasi tersebut dan pastikan totalnya tetap konsisten. Kembalikan HANYA isi blok yang sudah ditulis ulang, tanpa pembuka/penutup/pembahasan tambahan.`;
    const text = await ai(system, `Konteks dokumen: "${docTitle}" — Topik: ${topic}\n\nBLOK (${blockType}):\n${blockText}`, 3000, 0.8);
    res.json({ ok: true, text: text.trim() });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Kesalahan server: ' + (e.message || e) });
  }
});

// Rekomendasi AI di awal wizard
app.post('/api/rekomendasi', async (req, res) => {
  try {
    if (!process.env.KENARI_API_KEY) return res.status(500).json({ ok: false, error: 'Kunci AI belum dikonfigurasi di server.' });
    const { jenjang = '', fase = '', mapel = '', topik = '' } = req.body;
    const system = `Kamu asisten guru Indonesia. Berdasarkan info pembelajaran, berikan rekomendasi penyusunan modul ajar dalam format JSON MURNI (tanpa markdown, tanpa teks lain) dengan struktur persis: {"judul": "...", "model": "salah satu dari: Problem Based Learning (PBL), Project Based Learning (PjBL), Discovery Learning, Inquiry Learning, Pembelajaran Kooperatif, Pembelajaran Langsung, Pembelajaran Berdiferensiasi, Contextual Teaching and Learning (CTL)", "alokasi": "...", "tp": ["...", "...", "..."], "catatan": "..."}. TP = 3 tujuan pembelajaran singkat format ABCD.`;
    const raw = await ai(system, `Jenjang: ${jenjang}\nFase: ${fase}\nMata Pelajaran: ${mapel}\nTopik: ${topik}`, 1500, 0.6);
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Format rekomendasi tidak valid.');
    res.json({ ok: true, rekomendasi: JSON.parse(m[0]) });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Kesalahan server: ' + (e.message || e) });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Proxy gambar agar bisa di-embed di .docx (hindari CORS/hotlink block)
app.get('/api/gambar-proxy', async (req, res) => {
  try {
    const u = (req.query.url || '').toString();
    if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(u)) {
      return res.status(400).json({ ok: false, error: 'URL gambar tidak diizinkan.' });
    }
    const r = await fetch(u, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', 'Referer': 'https://commons.wikimedia.org/' },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return res.status(502).end();
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return res.status(502).end();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return res.status(502).end();
    res.set('Content-Type', ct).set('Cache-Control', 'public, max-age=86400').send(buf);
  } catch (e) {
    res.status(502).end();
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3102;
app.listen(PORT, () => console.log('[modulajar] listening on :' + PORT));
