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

// ================= REGULASI & ATURAN GLOBAL =================
// Kurikulum Merdeka — acuan regulasi terbaru:
// - 8 Dimensi Profil Lulusan (Permendikdasmen No. 10/2025) menggantikan P5/Profil Pelajar Pancasila
// - Pembelajaran mendalam: berkesadaran, bermakna, menggembirakan (Permendikdasmen No. 13/2025)
const DIMENSI_LULUSAN = `8 Dimensi Profil Lulusan (Permendikdasmen No. 10/2025): 1) Keimanan dan Ketakwaan kepada Tuhan Yang Maha Esa; 2) Kewargaan; 3) Penalaran Kritis; 4) Kreativitas; 5) Kolaborasi; 6) Kemandirian; 7) Kesehatan; 8) Komunikasi`;
const ANTI_FIKSI = `DILARANG mengarang: jangan membuat indikator, fakta, rumus, data, definisi, atau tujuan pembelajaran yang fiktif/tidak nyata. Semua materi harus materi yang benar-benar ada dan kredibel. Jika ragu, tulis sesuai pengetahuan yang mapan, bukan karangan.`;
const ISTILAH_BARU = `Gunakan istilah "8 Dimensi Profil Lulusan" (Permendikdasmen No. 10/2025); JANGAN gunakan istilah lama "Profil Pelajar Pancasila"/"P5".`;

// ================= SINTAKS MODEL PEMBELAJARAN (kanonis, server-side) =================
// Dulu sintaks diserahkan ke ingatan model AI ("sesuai sintaks model yang dipilih") —
// sekarang tiap model punya daftar fase resmi yang dipakai sebagai kerangka kegiatan inti.
const SINTAKS_MODEL = {
  pbl: {
    nama: 'Problem Based Learning (PBL)',
    fase: [
      'Orientasi peserta didik pada masalah',
      'Mengorganisasikan peserta didik untuk belajar',
      'Membimbing penyelidikan individu maupun kelompok',
      'Mengembangkan dan menyajikan hasil karya',
      'Menganalisis dan mengevaluasi proses pemecahan masalah',
    ],
  },
  pjbl: {
    nama: 'Project Based Learning (PjBL)',
    fase: [
      'Penentuan pertanyaan mendasar',
      'Mendesain perencanaan proyek',
      'Menyusun jadwal pelaksanaan proyek',
      'Memonitoring keaktifan dan perkembangan proyek',
      'Menguji hasil dan mempresentasikan proyek',
      'Mengevaluasi pengalaman belajar',
    ],
  },
  discovery: {
    nama: 'Discovery Learning',
    fase: [
      'Stimulasi (pemberian rangsangan)',
      'Pernyataan/identifikasi masalah',
      'Pengumpulan data',
      'Pengolahan data',
      'Pembuktian/verifikasi',
      'Menarik kesimpulan/generalisasi',
    ],
  },
  inquiry: {
    nama: 'Inquiry Learning',
    fase: [
      'Orientasi',
      'Merumuskan masalah',
      'Merumuskan hipotesis',
      'Mengumpulkan data',
      'Menguji hipotesis',
      'Merumuskan kesimpulan',
    ],
  },
  kooperatif: {
    nama: 'Pembelajaran Kooperatif',
    fase: [
      'Penyampaian tujuan dan motivasi',
      'Penyajian informasi',
      'Pengorganisasian ke dalam kelompok belajar',
      'Pembimbingan kelompok bekerja dan belajar',
      'Evaluasi hasil belajar',
      'Pemberian penghargaan',
    ],
  },
  langsung: {
    nama: 'Pembelajaran Langsung',
    fase: [
      'Menyampaikan tujuan dan mempersiapkan peserta didik',
      'Mendemonstrasikan pengetahuan dan keterampilan',
      'Membimbing pelatihan',
      'Mengecek pemahaman dan memberikan umpan balik',
      'Memberikan kesempatan latihan lanjutan',
    ],
  },
  diferensiasi: {
    nama: 'Pembelajaran Berdiferensiasi',
    fase: [
      'Pemetaan kebutuhan belajar peserta didik',
      'Perencanaan diferensiasi konten, proses, dan produk',
      'Pelaksanaan pembelajaran berdiferensiasi',
      'Refleksi dan tindak lanjut',
    ],
  },
  ctl: {
    nama: 'Contextual Teaching and Learning (CTL)',
    fase: [
      'Konstruktivisme (membangun pemahaman)',
      'Bertanya (questioning)',
      'Menemukan (inquiry)',
      'Masyarakat belajar (learning community)',
      'Pemodelan (modeling)',
      'Refleksi',
      'Penilaian autentik',
    ],
  },
};
const SINTAKS_DEFAULT = {
  nama: 'Model Pembelajaran (umum)',
  fase: ['Eksplorasi konsep', 'Elaborasi dan penerapan', 'Konfirmasi dan penguatan'],
};

export function deteksiSintaks(modelName) {
  const s = String(modelName || '').toLowerCase();
  if (/problem based|\(pbl\)|\bpbl\b/.test(s)) return SINTAKS_MODEL.pbl;
  if (/project based|pjbl/.test(s)) return SINTAKS_MODEL.pjbl;
  if (/discovery/.test(s)) return SINTAKS_MODEL.discovery;
  if (/inquiry|inkuiri/.test(s)) return SINTAKS_MODEL.inquiry;
  if (/kooperatif|cooperative/.test(s)) return SINTAKS_MODEL.kooperatif;
  if (/langsung|direct/.test(s)) return SINTAKS_MODEL.langsung;
  if (/diferensiasi|diferensial/.test(s)) return SINTAKS_MODEL.diferensiasi;
  if (/contextual|\bctl\b/.test(s)) return SINTAKS_MODEL.ctl;
  return SINTAKS_DEFAULT;
}

// ================= ALOKASI WAKTU (deterministik, bukan tebakan AI) =================
// Dulu AI diminta menghitung menit dari teks bebas ("2 x 45 menit" = 90) dan totalnya
// sering meleset. Sekarang parsing dilakukan server-side dan budget diteruskan eksplisit.
const MENIT_PER_JP = 45;

export function parseAlokasi(alokasi) {
  const s = String(alokasi || '').toLowerCase().replace(/,/g, '.');
  let m = s.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(menit|mnt)/);
  if (m) {
    const total = Math.round(parseFloat(m[1]) * parseFloat(m[2]));
    return { totalMenit: total, label: `${m[1]} x ${m[2]} menit (${total} menit)` };
  }
  m = s.match(/(\d+(?:\.\d+)?)\s*(menit|mnt)/);
  if (m) {
    const total = Math.round(parseFloat(m[1]));
    return { totalMenit: total, label: `${total} menit` };
  }
  m = s.match(/(\d+(?:\.\d+)?)\s*jp/);
  if (m) {
    const total = Math.round(parseFloat(m[1]) * MENIT_PER_JP);
    return { totalMenit: total, label: `${m[1]} JP (${total} menit)` };
  }
  return { totalMenit: 2 * MENIT_PER_JP, label: `default 2 JP (90 menit)` };
}

export function budgetKegiatan(totalMenit) {
  if (totalMenit >= 40) return { pendahuluan: 10, inti: totalMenit - 20, penutup: 10 };
  const p = Math.max(3, Math.round(totalMenit * 0.15));
  return { pendahuluan: p, inti: totalMenit - p * 2, penutup: p };
}

// Jumlahkan semua penanda "(X menit)" dalam teks — dipakai untuk validasi.
export function jumlahMenit(teks) {
  const re = /\((\d+)\s*menit\)/gi;
  let total = 0, m;
  while ((m = re.exec(teks)) !== null) total += parseInt(m[1], 10);
  return total;
}

const IDENT = (info) => `
- Nama Guru: ${info.nama || '(diisi guru)'}
- Sekolah: ${info.sekolah || '(diisi guru)'}
- Tahun Ajaran: ${info.tahunAjaran || '-'}
- Jenjang: ${info.jenjang || '-'} | Fase: ${info.fase || '-'} | Kelas: ${info.kelas || '-'} | Semester: ${info.semester || '-'}
- Mata Pelajaran: ${info.mapel || '-'}`;

function blokAcuan(sumber) {
  if (!(sumber && sumber.trim())) return '';
  return `\n\nDOKUMEN ACUAN PERENCANAAN (sumber resmi — WAJIB dijadikan dasar utama):\n${sumber.trim()}\n\nATURAN ACUAN: Seluruh TP, materi pokok, indikator, dan alokasi waktu HARUS diambil dari dokumen acuan di atas. DILARANG mengarang indikator, fakta, rumus, data, atau tujuan pembelajaran yang tidak tercantum dalam acuan. Jika sesuatu tidak tercantum di acuan, jangan diada-adakan — tulis sesuai acuan apa adanya.`;
}

// Hierarki sumber yang dipakai di semua tahap: acuan perencanaan > materi sumber > pengetahuan model.
function konteksSumber(materi, sumber) {
  const parts = [];
  if (materi && materi.trim()) parts.push(`MATERI SUMBER (acuan utama ISI pembelajaran):\n${materi.trim()}`);
  else parts.push(`MATERI SUMBER: (tidak ada — susun berdasarkan topik dengan pengetahuan yang mapan)`);
  parts.push(blokAcuan(sumber));
  return parts.join('\n');
}

// ================= PIPELINE GENERATE MODUL AJAR =================
// Algoritma baru (menggantikan satu tembakan raksasa):
//   Tahap 1 — Fondasi: CP + TP (ABCD) + dimensi lulusan + pemahaman + pemantik (JSON terstruktur)
//   Tahap 2 — Kegiatan: pendahuluan/inti/penutup mengikuti SINTAKS kanonis + budget menit eksplisit,
//             lalu DIVALIDASI server-side (jumlah "(X menit)" harus tepat = budget); retry 1x bila meleset
//   Tahap 3 — Asesmen & pelengkap: diturunkan dari TP tahap 1 (bukan karangan bebas)
//   Tahap 4 — Assembly deterministik + validasi heading
// Kontrak API tidak berubah: tetap POST /api/generate-doc -> { ok, markdown }.

function promptTahap1(info, materi, sumber, rekomendasi) {
  const kunciRekomendasi = rekomendasi && (rekomendasi.judul || rekomendasi.model || (rekomendasi.tp && rekomendasi.tp.length))
    ? `\nKONSTRAIN DARI TAHAP REKOMENDASI (wajib dipakai, jangan diubah):\n- Judul: ${rekomendasi.judul || '-'}\n- Model pembelajaran: ${rekomendasi.model || '-'}\n- Alokasi: ${rekomendasi.alokasi || '-'}\n- TP awal: ${(rekomendasi.tp || []).map((t, i) => `${i + 1}. ${t}`).join('\n')}\n`
    : '';
  const system = `Kamu adalah asisten penyusun Modul Ajar Kurikulum Merdeka untuk guru Indonesia.
Tugasmu HANYA menyusun fondasi modul (bukan modul lengkap). ${ANTI_FIKSI}
Kembalikan JSON MURNI tanpa markdown dan tanpa teks lain, dengan struktur persis:
{"judul": "...", "cp": "...", "tp": ["...", "...", "..."], "dimensi": [{"nama": "...", "wujud": "..."}], "pemahaman": "...", "pemantik": ["...", "...", "..."]}
Aturan:
- "judul": judul modul yang menarik dan spesifik.
- "cp": parafrase Capaian Pembelajaran nasional yang relevan dengan fase. Jika ada DOKUMEN ACUAN, rujuk CP dari sana.
- "tp": minimal 3 Tujuan Pembelajaran format ABCD (Audience, Behavior, Condition, Degree), diberi makna operasional dan terukur. Jika ada DOKUMEN ACUAN, TP WAJIB diambil dari ATP/Prosem pada acuan.
- "dimensi": 2-3 dimensi dari: ${DIMENSI_LULUSAN}, masing-masing beserta wujudnya dalam kegiatan.
- "pemahaman": 2-3 kalimat pemahaman bermakna bagi peserta didik.
- "pemantik": 3-5 pertanyaan pemantik yang terbuka.
- Bahasa Indonesia formal. ${ISTILAH_BARU}`;
  const user = `Susun fondasi modul dengan data berikut:\n${IDENT(info)}\n- Materi Pokok/Topik: ${info.topik || '-'}${kunciRekomendasi}\n\n${konteksSumber(materi, sumber)}`;
  return { system, user };
}

function promptTahap2(info, fondasi, budget, sintaks, materi, sumber) {
  const daftarFase = sintaks.fase.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const system = `Kamu adalah asisten penyusun Modul Ajar Kurikulum Merdeka untuk guru Indonesia.
Tugasmu HANYA menyusun bagian KEGIATAN PEMBELAJARAN dalam markdown. ${ANTI_FIKSI}
Terapkan prinsip pembelajaran mendalam: berkesadaran, bermakna, menggembirakan.

BUDGET WAKTU (sudah dihitung — WAJIB dipatuhi tepat):
- Total: ${budget.pendahuluan + budget.inti + budget.penutup} menit
- Pendahuluan: TEPAT ${budget.pendahuluan} menit
- Kegiatan Inti: TEPAT ${budget.inti} menit
- Penutup: TEPAT ${budget.penutup} menit

MODEL: ${sintaks.nama}. Kegiatan inti WAJIB mengikuti fase-fase sintaks berikut secara berurutan:
${daftarFase}

FORMAT WAJIB (penanda menit hanya dalam dua bentuk ini, jangan campur):
- Sub-heading bagian: "#### a. Pendahuluan — ${budget.pendahuluan} menit" (pakai strip "—", TANPA kurung)
- Sub-heading fase: "**Fase N: [nama fase]** — alokasi Y menit" (pakai strip "—", TANPA kurung)
- Setiap langkah kegiatan diakhiri "(X menit)" (WAJIB dalam kurung)

#### a. Pendahuluan — ${budget.pendahuluan} menit
1. [langkah] (X menit)
2. [langkah] (X menit)
(jumlah semua (X menit) pada bagian ini HARUS TEPAT ${budget.pendahuluan})

#### b. Kegiatan Inti — ${budget.inti} menit
Untuk SETIAP fase sintaks di atas, tulis sub-heading dengan format persis:
**Fase N: [nama fase]** — alokasi Y menit
lalu langkah-langkahnya, masing-masing diakhiri (X menit).
Jumlah (X menit) dalam satu fase HARUS TEPAT = Y menit fase tersebut, dan jumlah seluruh fase HARUS TEPAT ${budget.inti} menit.
PENTING: angka menit fase hanya boleh muncul di sub-heading fase (format "— alokasi Y menit", TANPA kurung), sedangkan angka menit langkah selalu dalam kurung "(X menit)". Jangan menulis angka menit dalam kurung di sub-heading bagian maupun fase.

#### c. Penutup — ${budget.penutup} menit
Langkah refleksi, umpan balik, tindak lanjut — masing-masing diakhiri (X menit), total TEPAT ${budget.penutup} menit.

#### c. Penutup (${budget.penutup} menit)
Langkah refleksi, umpan balik, tindak lanjut — masing-masing diakhiri (X menit), total TEPAT ${budget.penutup} menit.

Kembalikan HANYA markdown kegiatan (tiga sub-bagian di atas), tanpa pembuka/penutup tambahan. Bahasa Indonesia formal.`;
  const user = `Susun kegiatan pembelajaran untuk modul "${fondasi.judul}".
Data: ${IDENT(info)}
- Materi Pokok/Topik: ${info.topik || '-'}
- Tujuan Pembelajaran yang harus dicapai kegiatan ini:\n${fondasi.tp.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n${konteksSumber(materi, sumber)}`;
  return { system, user };
}

function promptTahap3(info, fondasi, materi, sumber) {
  const system = `Kamu adalah asisten penyusun Modul Ajar Kurikulum Merdeka untuk guru Indonesia.
Tugasmu HANYA menyusun bagian ASESMEN, PENGAYAAN/REMEDIAL, REFLEKSI, dan LAMPIRAN dalam markdown. ${ANTI_FIKSI}
Semua asesmen WAJIB diturunkan langsung dari Tujuan Pembelajaran berikut (jangan mengarang indikator baru):
${fondasi.tp.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Struktur WAJIB persis:
### 7. Asesmen
- **Asesmen Diagnostik**: ...
- **Asesmen Formatif**: ... beserta contoh instrumen/soal singkat yang mengukur TP di atas
- **Asesmen Sumatif**: ... beserta kisi-kisi singkat yang merujuk TP di atas

### 8. Pengayaan dan Remedial
- **Pengayaan**: ...
- **Remedial**: ...

### 9. Refleksi Peserta Didik dan Guru
Pertanyaan refleksi untuk peserta didik dan untuk guru.

## C. Lampiran
- **LKPD**: kerangka lembar kerja selaras TP di atas
- **Bahan Bacaan**: ringkasan materi pengayaan untuk guru
- **Glosarium**: istilah + definisi singkat
- **Daftar Pustaka**: minimal 3 sumber nyata (buku/teori/penulis yang benar-benar ada)

Kembalikan HANYA markdown bagian-bagian di atas. Bahasa Indonesia formal. ${ISTILAH_BARU}`;
  const user = `Susun asesmen dan pelengkap untuk modul "${fondasi.judul}".\nData: ${IDENT(info)}\n- Mata Pelajaran: ${info.mapel || '-'} | Materi: ${info.topik || '-'}\n\n${konteksSumber(materi, sumber)}`;
  return { system, user };
}

function rakitModul(info, fondasi, budget, sintaks, kegiatanMd, asesmenMd) {
  const alokasiLabel = `${info.alokasi || '-'} (${budget.pendahuluan + budget.inti + budget.penutup} menit)`;
  return `# ${fondasi.judul}

## A. Informasi Umum
- **Nama Penyusun**: ${info.nama || '(diisi guru)'}
- **Sekolah**: ${info.sekolah || '(diisi guru)'}
- **Tahun Ajaran**: ${info.tahunAjaran || '-'}
- **Jenjang / Fase / Kelas**: ${info.jenjang || '-'} / ${info.fase || '-'} / ${info.kelas || '-'}
- **Mata Pelajaran**: ${info.mapel || '-'}
- **Materi Pokok**: ${info.topik || '-'}
- **Alokasi Waktu**: ${alokasiLabel} — Pendahuluan ${budget.pendahuluan} menit, Inti ${budget.inti} menit, Penutup ${budget.penutup} menit
- **Model Pembelajaran**: ${sintaks.nama}

## B. Komponen Inti

### 1. Capaian Pembelajaran (CP)
${fondasi.cp}

### 2. Tujuan Pembelajaran (TP)
${fondasi.tp.map((t, i) => `${i + 1}. ${t}`).join('\n')}

### 3. Dimensi Profil Lulusan
${fondasi.dimensi.map((d) => `- **${d.nama}**: ${d.wujud}`).join('\n')}

### 4. Pemahaman Bermakna
${fondasi.pemahaman}

### 5. Pertanyaan Pemantik
${fondasi.pemantik.map((p) => `- ${p}`).join('\n')}

### 6. Kegiatan Pembelajaran
${kegiatanMd}

${asesmenMd}
`;
}

// Ambil hanya bagian kegiatan (### 6.) agar validasi menit tidak tercemar
// penanda "(X menit)" dari bagian lain (asesmen/lampiran).
export function bagianKegiatan(markdown) {
  const mulai = markdown.indexOf('### 6.');
  if (mulai === -1) return markdown;
  const akhir = markdown.indexOf('### 7.', mulai);
  return akhir === -1 ? markdown.slice(mulai) : markdown.slice(mulai, akhir);
}

function validasiAkhir(markdown, budget) {
  const masalah = [];
  const wajib = ['## A. Informasi Umum', '### 1.', '### 2.', '### 6.', '### 7.', '## C. Lampiran'];
  for (const h of wajib) if (!markdown.includes(h)) masalah.push(`Heading hilang: ${h}`);
  const total = jumlahMenit(bagianKegiatan(markdown));
  const ekspektasi = budget.pendahuluan + budget.inti + budget.penutup;
  if (total !== ekspektasi) masalah.push(`Total menit kegiatan ${total}, seharusnya ${ekspektasi}`);
  return masalah;
}

// Ekstraksi JSON yang toleran: tangani code fence dan koma menggantung.
function ekstrakJson(raw) {
  let s = String(raw || '');
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1];
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Tidak ada objek JSON dalam respons AI.');
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    const fixed = m[0].replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(fixed);
  }
}

async function generateModulPipeline(info, materi, sumber, rekomendasi) {
  // Tahap 1 — fondasi terstruktur
  const p1 = promptTahap1(info, materi, sumber, rekomendasi);
  let fondasi;
  try {
    fondasi = ekstrakJson(await ai(p1.system, p1.user, 2500, 0.5));
  } catch (e1) {
    console.warn('[modulajar] tahap 1: JSON tidak valid, retry dengan suhu rendah:', e1.message);
    const raw2 = await ai(p1.system + '\nPENTING: Kembalikan HANYA JSON yang valid (RFC 8259). Escape setiap tanda kutip ganda di dalam string dengan backslash.', p1.user, 2500, 0.3);
    fondasi = ekstrakJson(raw2);
  }
  if (!fondasi || !Array.isArray(fondasi.tp) || fondasi.tp.length < 1) throw new Error('Tahap 1 gagal: TP kosong.');

  // Tahap 2 — kegiatan + validasi menit (retry 1x dengan koreksi)
  const { totalMenit, label } = parseAlokasi(info.alokasi);
  const budget = budgetKegiatan(totalMenit);
  const sintaks = deteksiSintaks(info.model || (rekomendasi && rekomendasi.model) || '');
  const p2 = promptTahap2(info, fondasi, budget, sintaks, materi, sumber);
  let kegiatanMd = await ai(p2.system, p2.user, 6000, 0.7);
  let totalKegiatan = jumlahMenit(kegiatanMd);
  const target = budget.pendahuluan + budget.inti + budget.penutup;
  if (totalKegiatan !== target) {
    console.warn(`[modulajar] tahap 2: total menit ${totalKegiatan} != ${target} (${label}), retry dengan koreksi`);
    const koreksi = `\n\nKOREKSI: total menit kegiatanmu ${totalKegiatan}, HARUS TEPAT ${target} (Pendahuluan ${budget.pendahuluan} + Inti ${budget.inti} + Penutup ${budget.penutup}). Tulis ulang dengan total yang tepat.`;
    kegiatanMd = await ai(p2.system, p2.user + koreksi, 6000, 0.5);
    totalKegiatan = jumlahMenit(kegiatanMd);
    if (totalKegiatan !== target) console.warn(`[modulajar] tahap 2: retry masih meleset (${totalKegiatan} != ${target})`);
  }

  // Tahap 3 — asesmen & pelengkap dari TP
  const p3 = promptTahap3(info, fondasi, materi, sumber);
  const asesmenMd = await ai(p3.system, p3.user, 5000, 0.7);

  // Tahap 4 — assembly + validasi akhir
  const markdown = rakitModul(info, fondasi, budget, sintaks, kegiatanMd.trim(), asesmenMd.trim());
  const masalah = validasiAkhir(markdown, budget);
  if (masalah.length) console.warn('[modulajar] validasi akhir:', masalah.join(' | '));
  return markdown;
}

// Prompt single-shot lama untuk docType=modul — dipakai sebagai FALLBACK
const LEGACY_MODUL = `Kamu adalah asisten penyusun Modul Ajar Kurikulum Merdeka untuk guru Indonesia.
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

Aturan: Bahasa Indonesia formal. Kegiatan inti mengikuti sintaks model pembelajaran. Sesuaikan kedalaman dengan jenjang/fase. Gunakan kerangka 8 Dimensi Profil Lulusan — BUKAN lagi Profil Pelajar Pancasila/P5.`;

// ================= PROMPTS DOKUMEN LAIN (single-shot, tidak berubah) =================
const PROMPTS = {
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

| Minggu | Materi Pokok | Tujuan Pembelajaran | Alokasi (JP) | Keterangan |
|--------|--------------|---------------------|--------------|------------|
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
Susun KRITERIA KETERCAPAIAN TUJUAN PEMBELAJARAN (KKTP) — tolok ukur yang dipakai guru untuk menilai apakah peserta didik mencapai TP. WAJIB merujuk pada TP yang tercantum di acuan — jangan mengarang TP baru.

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
    const { docType = 'modul', info = {}, materi = '', sumber = '', rekomendasi = null } = req.body;
    if (docType === 'modul') {
      try {
        const markdown = await generateModulPipeline(info, materi, sumber, rekomendasi);
        return res.json({ ok: true, markdown });
      } catch (e) {
        console.error('[modulajar] pipeline gagal, fallback ke single-shot:', e.message);
      }
    }
    // Jalur dokumen lain + fallback: single-shot seperti semula
    const system = docType === 'modul' ? LEGACY_MODUL : PROMPTS[docType];
    if (!system) return res.status(400).json({ ok: false, error: 'Jenis dokumen tidak dikenal.' });
    const userMsg = `Susun dokumen dengan data berikut:\n${IDENT(info)}\n- Materi Pokok/Topik: ${info.topik || '-'}\n- Alokasi Waktu: ${info.alokasi || '-'}\n- Model Pembelajaran: ${info.model || '-'}\n- Jumlah Soal PG: ${info.jmlPG || '-'} | Uraian: ${info.jmlUraian || '-'}\n\n${konteksSumber(materi, sumber)}`;
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
