import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '2mb' }));

const KENARI_URL = 'https://kenari.id/v1/chat/completions';
const MODEL = 'agnes-3-0-flash:free';

// ============ KUOTA HARIAN (disebut "Kredit" di UI) ============
const KUOTA_MINGGUAN = parseInt(process.env.KUOTA_MINGGUAN || process.env.KUOTA_HARIAN || '10', 10);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'faruq.blogger@gmail.com')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

function isAdmin(user) {
  return ADMIN_EMAILS.includes((user?.email || '').toLowerCase());
}
// Periode kuota berjalan 15:00 WIB s.d. 15:00 WIB berikutnya.
// Key = tanggal WIB saat periode dimulai (bila sekarang < 15:00 WIB, pakai tanggal kemarin).
function periodeKuota() {
  // Kuota MINGGUAN: reset tiap Minggu jam 15:00 WIB.
  // Anchor = Minggu 15:00 WIB terakhir (jika sekarang Minggu sebelum jam 15:00,
  // masih dihitung minggu lalu). Key periode = tanggal Minggu anchor (YYYY-MM-DD),
  // disimpan di kolom kuota_harian.tanggal seperti sebelumnya.
  const kini = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const anchor = new Date(kini);
  anchor.setHours(15, 0, 0, 0);
  anchor.setDate(anchor.getDate() - anchor.getDay()); // mundur ke hari Minggu
  if (anchor > kini) anchor.setDate(anchor.getDate() - 7);
  const y = anchor.getFullYear();
  const m = String(anchor.getMonth() + 1).padStart(2, '0');
  const d = String(anchor.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function windowStart() {
  // Window bonus & referral DISELARASKAN dengan reset kuota mingguan (Minggu 15:00 WIB):
  // memakai anchor periode yang sama dengan periodeKuota().
  return periodeKuota();
}
// Peringatan kuota dibatasi agar log tidak kebanjiran saat tabel hilang
let kuotaWarnAt = 0;
function warnKuota(e) {
  const kini = Date.now();
  if (kini - kuotaWarnAt < 10 * 60 * 1000) return;
  kuotaWarnAt = kini;
  console.warn('[modulajar] KUOTA NONAKTIF SEMENTARA: tabel kuota_harian tidak bisa diakses (' +
    (e?.message || e) + '). Jalankan supabase-bundle.sql di Supabase Dashboard. Generate tetap diizinkan.');
}
async function kuotaInfo(userId) {
  const periode = periodeKuota();
  let dipakai = 0, bonus = 0;
  if (sb) {
    try {
      const { data, error } = await sb.from('kuota_harian')
        .select('dipakai').eq('user_id', userId).eq('tanggal', periode).single();
      // PGRST116 = baris belum ada (user belum memakai kuota periode ini): wajar, bukan error
      if (error && error.code !== 'PGRST116') throw error;
      dipakai = data?.dipakai || 0;
    } catch (e) {
      warnKuota(e); // tabel hilang: kuota dianggap penuh (fail-open), generate tidak digagalkan
    }
    try {
      const { data, error } = await sb.from('bonus_kuota')
        .select('bonus').eq('user_id', userId).eq('window_start', windowStart()).single();
      if (error && error.code !== 'PGRST116') throw error;
      bonus = data?.bonus || 0;
    } catch { /* tabel bonus belum ada: abaikan */ }
  }
  const sisa = Math.max(0, KUOTA_MINGGUAN - dipakai + bonus);
  return { batas: KUOTA_MINGGUAN, dipakai, bonus, sisa, resetInfo: 'Minggu 15:00 WIB', periode };
}
// Increment kuota diserialkan: langkah paralel (modul/LKPD, konkurensi 3)
// tidak boleh baca-tulis bersamaan sampai ada increment yang hilang
let antriKuota = Promise.resolve();
function tambahKuota(userId, n = 1) {
  antriKuota = antriKuota.then(() => tambahKuotaInner(userId, n)).catch(() => {});
  return antriKuota;
}
async function tambahKuotaInner(userId, n = 1) {
  if (!sb) return;
  try {
    const tanggal = periodeKuota();
    const { data, error } = await sb.from('kuota_harian')
      .select('dipakai').eq('user_id', userId).eq('tanggal', tanggal).single();
    if (error && error.code !== 'PGRST116') throw error;
    if (data) {
      const { error: e2 } = await sb.from('kuota_harian').update({ dipakai: data.dipakai + n })
        .eq('user_id', userId).eq('tanggal', tanggal);
      if (e2) throw e2;
    } else {
      const { error: e3 } = await sb.from('kuota_harian').insert({ user_id: userId, tanggal, dipakai: n });
      if (e3) {
        if (e3.code === '23505') {
          // Balapan insert (multi-proses): baca ulang lalu update
          const { data: d2 } = await sb.from('kuota_harian')
            .select('dipakai').eq('user_id', userId).eq('tanggal', tanggal).single();
          if (d2) await sb.from('kuota_harian').update({ dipakai: d2.dipakai + n })
            .eq('user_id', userId).eq('tanggal', tanggal);
        } else throw e3;
      }
    }
  } catch (e) {
    warnKuota(e); // kegagalan kuota tidak boleh menggagalkan generate
  }
}
// Reservasi kuota atomik: cek DAN potong dalam satu giliran antrean serial,
// sehingga dua request konkuren tidak bisa sama-sama lolos lalu melewati batas.
// Mengembalikan true bila kuota cukup (dan sudah dipotong), false bila tidak.
// Tanpa DB / tabel hilang: fail-open (true) seperti perilaku lama.
async function potongKuotaAtomik(userId, butuh = 1) {
  let hasil = false;
  antriKuota = antriKuota.then(async () => {
    const periode = periodeKuota();
    let dipakai = 0, bonus = 0;
    if (!sb) { hasil = true; return; }
    try {
      const { data, error } = await sb.from('kuota_harian')
        .select('dipakai').eq('user_id', userId).eq('tanggal', periode).single();
      if (error && error.code !== 'PGRST116') throw error;
      dipakai = data?.dipakai || 0;
    } catch (e) { warnKuota(e); hasil = true; return; }
    try {
      const { data, error } = await sb.from('bonus_kuota')
        .select('bonus').eq('user_id', userId).eq('window_start', windowStart()).single();
      if (error && error.code !== 'PGRST116') throw error;
      bonus = data?.bonus || 0;
    } catch { /* tabel bonus belum ada: abaikan */ }
    const sisa = Math.max(0, KUOTA_MINGGUAN - dipakai + bonus);
    if (sisa < butuh) { hasil = false; return; }
    await tambahKuotaInner(userId, butuh);
    hasil = true;
  }).catch(() => { hasil = false; });
  await antriKuota;
  return hasil;
}
// Bonus referral +n ke window 3-hari berjalan. Tidak pernah throw.
// Diserialkan seperti kuota agar klaim konkuren tidak menghilangkan bonus.
let antriBonus = Promise.resolve();
function tambahBonus(userId, n = 3) {
  antriBonus = antriBonus.then(() => tambahBonusInner(userId, n)).catch(() => {});
  return antriBonus;
}
async function tambahBonusInner(userId, n = 3) {
  if (!sb) return;
  try {
    const ws = windowStart();
    const { data } = await sb.from('bonus_kuota')
      .select('bonus').eq('user_id', userId).eq('window_start', ws).single();
    if (data) {
      await sb.from('bonus_kuota').update({ bonus: data.bonus + n })
        .eq('user_id', userId).eq('window_start', ws);
    } else {
      await sb.from('bonus_kuota').insert({ user_id: userId, window_start: ws, bonus: n });
    }
  } catch (e) { console.warn('[modulajar] tambahBonus gagal:', e.message); }
}
// Email user dari id (untuk penentuan admin di job yang berjalan di background)
async function emailOf(userId) {
  try {
    const { data } = await sb.auth.admin.getUserById(userId);
    return data?.user?.email || '';
  } catch { return ''; }
}

// ============ BYOK (bawa kunci AI sendiri) ============
// Konteks kunci AI aktif per alur async (request / job). AsyncLocalStorage
// memastikan job paket yang berjalan paralel tidak saling tukar kunci.
const aiKeyCtx = new AsyncLocalStorage(); // { baseUrl, apiKey, model } | null

// Kunci AI milik user. null bila tidak ada / tabel belum ada. Tidak pernah throw.
// Mengembalikan { baseUrl, apiKey, model, pakaiBawaan }.
async function resolveKunciAI(userId) {
  if (!sb || !userId) return null;
  try {
    const { data } = await sb.from('kunci_ai')
      .select('base_url, api_key, model, pakai_bawaan').eq('user_id', userId).single();
    if (!data?.api_key || !data?.base_url) return { pakaiBawaan: data?.pakai_bawaan !== false, kosong: true };
    return { baseUrl: String(data.base_url).replace(/\/+$/, ''), apiKey: data.api_key, model: data.model || null, pakaiBawaan: data.pakai_bawaan !== false };
  } catch { return null; }
}

// ---------- Pengaturan AI global (diatur admin) ----------
// Cache 5 menit agar tiap request AI tidak query DB.
let cachePengaturanAI = { data: null, ts: 0 };
function pengaturanAIDefault() {
  return {
    bawaanAktif: true,
    umum: { baseUrl: 'https://kenari.id/v1', apiKey: process.env.KENARI_API_KEY || '', model: MODEL },
    admin: { baseUrl: 'https://kenari.id/v1', apiKey: '', model: MODEL },
  };
}
async function getPengaturanAI() {
  if (Date.now() - cachePengaturanAI.ts < 5 * 60 * 1000 && cachePengaturanAI.data) return cachePengaturanAI.data;
  let d = pengaturanAIDefault();
  if (sb) {
    try {
      const { data } = await sb.from('pengaturan_ai').select('*').eq('id', 1).single();
      if (data) {
        d = {
          bawaanAktif: data.bawaan_aktif !== false,
          umum: { baseUrl: String(data.umum_base_url || 'https://kenari.id/v1').replace(/\/+$/, ''), apiKey: data.umum_api_key || '', model: data.umum_model || MODEL },
          admin: { baseUrl: String(data.admin_base_url || 'https://kenari.id/v1').replace(/\/+$/, ''), apiKey: data.admin_api_key || '', model: data.admin_model || MODEL },
        };
      }
    } catch { /* tabel belum ada → pakai default */ }
  }
  cachePengaturanAI = { data: d, ts: Date.now() };
  return d;
}
function resetCachePengaturanAI() { cachePengaturanAI = { data: null, ts: 0 }; }

// Resolusi kunci efektif untuk satu request/job.
// Prioritas: 1) BYOK (bila user memilih "AI sendiri"),
//            2) key khusus admin (bila user admin),
//            3) key umum (bila toggle bawaan aktif),
//            4) fallback env KENARI_API_KEY.
// Mengembalikan { baseUrl, apiKey, model, sumber: 'sendiri'|'admin'|'umum'|'env' }.
// Kuota hanya dipotong bila sumber = 'umum' atau 'env'.
async function resolveKunciEfektif(userId, user) {
  const admin = isAdmin(user);
  const byok = await resolveKunciAI(userId);
  if (byok && !byok.kosong && byok.pakaiBawaan === false) {
    return { baseUrl: byok.baseUrl, apiKey: byok.apiKey, model: byok.model || MODEL, sumber: 'sendiri' };
  }
  const cfg = await getPengaturanAI();
  if (admin && cfg.admin.apiKey) {
    return { baseUrl: cfg.admin.baseUrl, apiKey: cfg.admin.apiKey, model: cfg.admin.model, sumber: 'admin' };
  }
  if (cfg.bawaanAktif && cfg.umum.apiKey) {
    return { baseUrl: cfg.umum.baseUrl, apiKey: cfg.umum.apiKey, model: cfg.umum.model, sumber: 'umum' };
  }
  if (cfg.bawaanAktif && process.env.KENARI_API_KEY && !cfg.umum.apiKey) {
    // Fallback kompatibilitas: env masih diisi tapi DB belum dikonfigurasi.
    // Hanya bila AI bawaan AKTIF — bila admin mematikannya, jangan hidupkan
    // diam-diam lewat env (kill-switch admin harus dihormati).
    return { baseUrl: 'https://kenari.id/v1', apiKey: process.env.KENARI_API_KEY, model: MODEL, sumber: 'env' };
  }
  throw new Error('AI bawaan sedang nonaktif. Pasang kunci AI sendiri di Pengaturan untuk tetap bisa memakai.');
}
// Kuota dipotong hanya bila memakai AI bawaan (umum/env), bukan BYOK.
// Admin tidak pernah kena kuota, apa pun sumber kuncinya.
function potongKuota(sumber, user) {
  if (isAdmin(user)) return false;
  return sumber === 'umum' || sumber === 'env';
}
function maskKey(k) {
  const s = String(k || '');
  return s.length <= 4 ? '••••' : '••••' + s.slice(-4);
}

// ============ SUPABASE ============
const SB_URL = process.env.SUPABASE_URL || '';
const SB_ANON = process.env.SUPABASE_ANON_KEY || '';
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY || '';
const sb = (SB_URL && SB_SERVICE) ? createClient(SB_URL, SB_SERVICE) : null;
if (!sb) console.warn('[modulajar] SUPABASE belum dikonfigurasi — mode tanpa auth, job paket nonaktif.');

function extractTitle(markdown) {
  const m = String(markdown || '').match(/^#\s+(.+)$/m);
  return m ? m[1].trim().slice(0, 140) : 'Dokumen Ajar';
}

// Auth opsional: bila Supabase dikonfigurasi, endpoint butuh JWT user yang valid
async function authUser(req) {
  if (!sb) return { id: 'anon' };
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
function requireAuth(handler) {
  return async (req, res) => {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Perlu login.' });
    req.user = user;
    return handler(req, res);
  };
}

async function ai(system, user, maxTokens = 8000, temperature = 0.7, onDelta = null, onAntre = null) {
  // Antrean global: batasi panggilan AI bersamaan agar server tidak kebanjiran
  // saat banyak guru generate di waktu yang sama. FIFO; onAntre(posisi) dipanggil
  // saat menunggu agar UI bisa menampilkan "Antrean #N".
  // onAntre bisa lewat parameter atau konteks aiKeyCtx (untuk panggilan bertingkat).
  const cbAntre = onAntre || (() => { try { return aiKeyCtx.getStore()?.onAntre || null; } catch { return null; } })();
  await antreAI(cbAntre);
  try {
  // Kunci efektif sudah diresolusi per request/job via resolveKunciEfektif
  // (prioritas: BYOK sendiri → key admin → key umum → env).
  const kunci = aiKeyCtx.getStore() || null;
  if (!kunci?.apiKey) throw new Error('Kunci AI belum dikonfigurasi. Hubungi admin atau pasang kunci sendiri di Pengaturan.');
  const url = (kunci.baseUrl || 'https://kenari.id/v1') + '/chat/completions';
  const model = kunci.model || MODEL;
  const apiKey = kunci.apiKey;
  const body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, max_tokens: maxTokens };
  if (onDelta) { body.stream = true; body.stream_options = { include_usage: true }; } // minta usage di chunk terakhir
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw new Error('AI gagal merespons (HTTP ' + r.status + ')');
  if (!onDelta) {
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || '';
    catatUsage(model, data.usage);
    if (!text.trim()) throw new Error('AI mengembalikan respons kosong.');
    return text;
  }
  // Jalur streaming: teruskan tiap delta ke pemanggil, kembalikan teks penuh
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '', usageStream = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const d = JSON.parse(payload);
          const delta = d.choices?.[0]?.delta?.content || '';
          if (delta) {
            full += delta;
            try { await onDelta(delta); } catch { /* callback user, jangan gagalkan stream */ }
          }
          if (d.usage) usageStream = d.usage; // chunk terakhir membawa usage
        } catch { /* baris rusak, abaikan */ }
      }
    }
  }
  catatUsage(model, usageStream);
  if (!full.trim()) throw new Error('AI mengembalikan respons kosong.');
  return full;
  } finally {
    lepasAI();
  }
}

// ================= ANTREAN AI GLOBAL =================
// Batasi panggilan AI yang berjalan bersamaan (default 5, via env AI_MAX_BARENG).
// Kelebihan permintaan menunggu FIFO; posisi antrean dilaporkan via onAntre.
const AI_MAX_BARENG = Math.max(1, Number(process.env.AI_MAX_BARENG || 5));
let aiJalan = 0;
const aiAntre = []; // [{ resolve, onAntre }]

function antreAI(onAntre) {
  if (aiJalan < AI_MAX_BARENG) { aiJalan++; return Promise.resolve(); }
  return new Promise((resolve) => {
    const entri = { resolve, onAntre };
    aiAntre.push(entri);
    try { onAntre && onAntre(aiAntre.length); } catch { /* abaikan */ }
  }).then(() => { aiJalan++; });
}

function lepasAI() {
  aiJalan = Math.max(0, aiJalan - 1);
  const next = aiAntre.shift();
  if (next) {
    // Kabari sisa antrean bahwa posisi mereka maju
    aiAntre.forEach((q, i) => { try { q.onAntre && q.onAntre(i + 1); } catch { /* abaikan */ } });
    next.resolve();
  }
}

// Status antrean untuk endpoint monitoring
function statusAntreanAI() {
  return { berjalan: aiJalan, menunggu: aiAntre.length, maks: AI_MAX_BARENG };
}

// Catat pemakaian token per panggilan AI (termasuk cache hit bila provider melaporkannya).
// Format: [ai] model=... prompt=2456 cached=1200 completion=1024
function catatUsage(model, usage) {
  if (!usage) return;
  const prompt = usage.prompt_tokens ?? '?';
  const completion = usage.completion_tokens ?? '?';
  const cached = usage.prompt_tokens_details?.cached_tokens ?? usage.cached_tokens ?? 0;
  console.log(`[ai] model=${model} prompt=${prompt} cached=${cached} completion=${completion}`);
}

// ================= REGULASI & ATURAN GLOBAL =================
// Kurikulum Merdeka — acuan regulasi terbaru:
// - 8 Dimensi Profil Lulusan (Permendikdasmen No. 10/2025) menggantikan P5/Profil Pelajar Pancasila
// - Pembelajaran mendalam: berkesadaran, bermakna, menggembirakan (Permendikdasmen No. 13/2025)
const DIMENSI_LULUSAN = `8 Dimensi Profil Lulusan (Permendikdasmen No. 10/2025): 1) Keimanan dan Ketakwaan kepada Tuhan Yang Maha Esa; 2) Kewargaan; 3) Penalaran Kritis; 4) Kreativitas; 5) Kolaborasi; 6) Kemandirian; 7) Kesehatan; 8) Komunikasi`;
const ANTI_FIKSI = `DILARANG mengarang: jangan membuat indikator, fakta, rumus, data, definisi, atau tujuan pembelajaran yang fiktif/tidak nyata. Semua materi harus materi yang benar-benar ada dan kredibel. Jika ragu, tulis sesuai pengetahuan yang mapan, bukan karangan.`;
const ISTILAH_BARU = `Gunakan istilah "8 Dimensi Profil Lulusan" (Permendikdasmen No. 10/2025); JANGAN gunakan istilah lama "Profil Pelajar Pancasila"/"P5".`;
// Kualitas isi: larang placeholder kosong dan jaga konsistensi istilah di semua dokumen.
const ANTI_SLOP = `Tulis isi yang lengkap dan siap pakai. DILARANG menulis "...", "[...]", "[diisi]", atau placeholder kosong sebagai isi bagian mana pun. Setiap bagian harus berisi teks final yang benar-benar bisa dipakai guru di kelas.`;
const RANTAI_VALIDITAS = `RANTAI DOKUMEN (WAJIB DIPAHAMI): Perangkat pembelajaran adalah SATU KESATUAN yang saling terhubung, bukan dokumen lepas. Urutannya: CP → Analisis CP → TP → ATP → Minggu Efektif → Distribusi JP → Prota → Prosem → Modul Ajar → Asesmen → LKPD. SETIAP dokumen WAJIB diturunkan dari dokumen sebelumnya: materi di Prosem HARUS SAMA dengan materi di Prota/ATP/TP (tidak boleh ganti topik); materi di Modul Ajar HARUS SAMA dengan materi di Prosem (ambil dari baris Prosem yang sesuai, jangan karang topik baru); TP di Modul HARUS SAMA dengan TP di ATP. Jika dokumen acuan tersedia, JANGAN mengarang materi/TP/tujuan baru di luar acuan. Pelanggaran rantai = dokumen TIDAK VALID.`;
const KONSISTENSI = `Pakai sebutan mata pelajaran, kelas, fase, semester, dan topik PERSIS seperti pada data di atas di seluruh dokumen. Jangan mengubah-ubah istilahnya di tengah dokumen. IDENTITAS SINGKAT: setiap field identitas/informasi umum (nama, sekolah, kelas, fase, mata pelajaran, dll.) hanya berisi nilainya saja dari data — contoh: "X", "PJOK". DILARANG menulis penjelasan, catatan, analisis, atau koreksi di field identitas; kalau data tampak tidak konsisten, tetap tulis apa adanya tanpa komentar.`;
// (IDENTITAS_SINGKAT sudah digabung ke KONSISTENSI di atas)

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

// Pilih model pembelajaran otomatis: AI memilih yang paling cocok untuk topik/materi.
// Dipakai bila info.model === 'auto'.
const DAFTAR_MODEL = [
  'Problem Based Learning (PBL)',
  'Project Based Learning (PjBL)',
  'Discovery Learning',
  'Inquiry Learning',
  'Pembelajaran Kooperatif',
  'Pembelajaran Langsung',
  'Pembelajaran Berdiferensiasi',
  'Contextual Teaching and Learning (CTL)',
];
async function pilihModelOtomatis(info, materi) {
  const system = 'Kamu adalah ahli pedagogi Kurikulum Merdeka. Tugasmu HANYA memilih satu model pembelajaran yang paling cocok.';
  const user = `Pilih SATU model pembelajaran yang paling cocok dari daftar berikut untuk materi ini:\n${DAFTAR_MODEL.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\nMata pelajaran: ${info.mapel || '-'}\nJenjang/Fase/Kelas: ${info.jenjang || '-'} / ${info.fase || '-'} / ${info.kelas || '-'}\nTopik/Materi: ${info.topik || '-'}\nRingkasan materi: ${(materi || '').slice(0, 1500)}\n\nBalas HANYA dengan nama model yang persis seperti di daftar (contoh: "Discovery Learning"). Tanpa penjelasan.`;
  try {
    const hasil = await ai(system, user, 100, 0.3, null);
    const bersih = String(hasil || '').trim();
    // Cocokkan dengan daftar (toleran variasi kecil)
    const cocok = DAFTAR_MODEL.find((m) => bersih.toLowerCase().includes(m.toLowerCase().split(' (')[0].toLowerCase()) || m.toLowerCase().includes(bersih.toLowerCase().split(' (')[0]));
    if (cocok) return cocok;
    // Fallback: cari yang paling mirip
    for (const m of DAFTAR_MODEL) {
      if (bersih.toLowerCase().includes(m.split(' ')[0].toLowerCase())) return m;
    }
  } catch (e) {
    console.warn('[modulajar] pilihModelOtomatis gagal:', e.message);
  }
  return 'Discovery Learning'; // fallback aman
}

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
- Mata Pelajaran: ${info.mapel || '-'}
- JP per Minggu: ${info.jpPerMinggu || '-'} | Durasi 1 JP: ${info.menitPerJP || 45} menit (pakai untuk menghitung alokasi waktu, contoh: 2 JP = ${2 * (info.menitPerJP || 45)} menit)${info.personaGuru ? '\n\n' + info.personaGuru : ''}`;

function blokAcuan(sumber) {
  if (!(sumber && sumber.trim())) return '';
  return `\n\nDOKUMEN ACUAN PERENCANAAN (sumber resmi, WAJIB dijadikan dasar utama):\n${sumber.trim()}\n\nATURAN ACUAN: Seluruh TP, materi pokok, indikator, dan alokasi waktu HARUS diambil dari dokumen acuan di atas. DILARANG mengarang indikator, fakta, rumus, data, atau tujuan pembelajaran yang tidak tercantum dalam acuan. Jika sesuatu tidak tercantum di acuan, jangan diada-adakan, tulis sesuai acuan apa adanya.`;
}

// Hierarki sumber yang dipakai di semua tahap: acuan perencanaan > materi sumber > pengetahuan model.
function konteksSumber(materi, sumber) {
  const parts = [];
  if (materi && materi.trim()) parts.push(`MATERI SUMBER (acuan utama ISI pembelajaran):\n${materi.trim()}`);
  else parts.push(`MATERI SUMBER: (tidak ada, susun berdasarkan topik dengan pengetahuan yang mapan)`);
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
  // Multi-pertemuan: daftar pertemuan diteruskan agar TP mencakup seluruh bab.
  // Satu modul = satu bab = N pertemuan (best practice: diambil dari Prosem;
  // mode manual: materi sama untuk semua pertemuan, AI membagi bab secara runtut).
  const daftarP = Array.isArray(info.pertemuanList) && info.pertemuanList.length > 1 ? info.pertemuanList : null;
  const txtPertemuan = (() => {
    if (!daftarP) return '';
    const tpWajib = '- "tp": WAJIB mencakup tujuan untuk SEMUA pertemuan di atas (minimal 1 TP per pertemuan).';
    const semuaSama = daftarP.every((p) => p.materi === daftarP[0].materi);
    if (semuaSama) {
      return `\n- Struktur modul: 1 bab = ${daftarP.length} pertemuan.\n- Materi bab: ${daftarP[0].materi}${daftarP[0].alokasi ? ` (${daftarP[0].alokasi} per pertemuan)` : ''}.\n- Bagi materi bab tersebut secara runtut dan logis menjadi ${daftarP.length} pertemuan (dari pengenalan konsep sampai penerapan/evaluasi).\n${tpWajib}`;
    }
    return `\n- Struktur modul: 1 bab = ${daftarP.length} pertemuan:\n${daftarP.map((p, i) => `  ${i + 1}. ${p.materi}${p.alokasi ? ` (${p.alokasi})` : ''}`).join('\n')}\n${tpWajib}`;
  })();
  const system = `Kamu adalah asisten penyusun Modul Ajar Kurikulum Merdeka untuk guru Indonesia.
Tugasmu HANYA menyusun fondasi modul (bukan modul lengkap). ${ANTI_FIKSI}
Kembalikan JSON MURNI tanpa markdown dan tanpa teks lain, dengan struktur persis:
{"judul": "...", "cp": "...", "tp": ["...", "...", "..."], "dimensi": [{"nama": "...", "wujud": "..."}], "pemahaman": "...", "pemantik": ["...", "...", "..."]}
Aturan:
- "judul": judul modul yang spesifik, menyebut topik dan konteks atau pendekatan kegiatannya (bukan judul generik seperti "Modul Ajar IPA").
- "cp": parafrase Capaian Pembelajaran nasional yang relevan dengan fase. Jika ada DOKUMEN ACUAN, rujuk CP dari sana.
- "tp": minimal 3 Tujuan Pembelajaran format ABCD (Audience, Behavior, Condition, Degree), diberi makna operasional dan terukur. Jika ada DOKUMEN ACUAN, TP WAJIB diambil dari ATP/Prosem pada acuan.
- "dimensi": 2-3 dimensi dari: ${DIMENSI_LULUSAN}, masing-masing beserta wujudnya dalam kegiatan.
- "pemahaman": 2-3 kalimat pemahaman bermakna bagi peserta didik.
- "pemantik": 3-5 pertanyaan pemantik yang terbuka dan dekat dengan pengalaman peserta didik.
- Sesuaikan kedalaman bahasa, contoh, dan kompleksitas dengan jenjang, fase, dan kelas pada data.
- Isi setiap field dengan teks final, bukan placeholder. ${RANTAI_VALIDITAS} ${KONSISTENSI}
Bahasa Indonesia formal. ${ISTILAH_BARU}`;
  const user = `Susun fondasi modul dengan data berikut:\n${IDENT(info)}\n- Materi Pokok/Topik: ${info.topik || '-'}${kunciRekomendasi}${txtPertemuan}\n\n${konteksSumber(materi, sumber)}`;
  return { system, user };
}

function promptTahap2(info, fondasi, budgets, daftar, sintaks, materi, sumber) {
  // budgets: array per pertemuan (multi) atau [budget] (tunggal, kompatibel pemanggil lama).
  // System 100% statis per varian (tanpa data dinamis) agar prefix prompt stabil dan
  // context caching provider (DeepSeek) bisa hit. Semua angka/nama dinamis
  // ada di user message.
  const multi = Array.isArray(daftar) && daftar.length > 1 && budgets.length === daftar.length;
  const budgetTunggal = budgets[0];
  const systemTunggal = `Kamu adalah asisten penyusun Modul Ajar Kurikulum Merdeka untuk guru Indonesia.
Tugasmu HANYA menyusun bagian KEGIATAN PEMBELAJARAN dalam markdown. ${ANTI_FIKSI}
Terapkan prinsip pembelajaran mendalam: berkesadaran, bermakna, menggembirakan.

BUDGET WAKTU, MODEL/SINTAKS, dan TUJUAN PEMBELAJARAN ada pada bagian DATA di pesan pengguna. WAJIB dipatuhi tepat.

FORMAT WAJIB (penanda menit hanya dalam dua bentuk ini, jangan campur):
- Sub-heading bagian: "#### a. Pendahuluan: [N] menit" (pakai titik dua, TANPA kurung)
- Sub-heading fase: "**Fase N: [nama fase]**, alokasi Y menit" (pakai koma, TANPA kurung)
- Setiap langkah kegiatan diakhiri "(X menit)" (WAJIB dalam kurung)

#### a. Pendahuluan: [N] menit
1. [langkah] (X menit)
2. [langkah] (X menit)
(jumlah semua (X menit) pada bagian ini HARUS TEPAT = N menit pendahuluan pada DATA)

#### b. Kegiatan Inti: [N] menit
Untuk SETIAP fase sintaks pada DATA, tulis sub-heading dengan format persis:
**Fase N: [nama fase]**, alokasi Y menit
lalu langkah-langkahnya, masing-masing diakhiri (X menit).
Jumlah (X menit) dalam satu fase HARUS TEPAT = Y menit fase tersebut, dan jumlah seluruh fase HARUS TEPAT = N menit inti pada DATA.
PENTING: angka menit fase hanya boleh muncul di sub-heading fase (format koma "alokasi Y menit", TANPA kurung), sedangkan angka menit langkah selalu dalam kurung "(X menit)". Jangan menulis angka menit dalam kurung di sub-heading bagian maupun fase.

#### c. Penutup: [N] menit
Langkah refleksi, umpan balik, tindak lanjut, masing-masing diakhiri (X menit), total TEPAT = N menit penutup pada DATA.

Tulis langkah kegiatan yang konkret dan bisa langsung dilaksanakan (siapa berbuat apa, dengan bahan atau media apa), bukan instruksi umum seperti "Guru melaksanakan pembelajaran". ${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Kembalikan HANYA markdown kegiatan (tiga sub-bagian di atas), tanpa pembuka/penutup tambahan. Bahasa Indonesia formal.`;
  const systemMulti = `Kamu adalah asisten penyusun Modul Ajar Kurikulum Merdeka untuk guru Indonesia.
Tugasmu HANYA menyusun bagian KEGIATAN PEMBELAJARAN dalam markdown. ${ANTI_FIKSI}
Terapkan prinsip pembelajaran mendalam: berkesadaran, bermakna, menggembirakan.

Modul ini adalah SATU BAB yang terdiri dari BEBERAPA PERTEMUAN. BUDGET WAKTU PER PERTEMUAN, MODEL/SINTAKS, TUJUAN PEMBELAJARAN, dan DAFTAR PERTEMUAN ada pada bagian DATA di pesan pengguna. WAJIB dipatuhi tepat.

Untuk SETIAP pertemuan, tulis blok dengan format persis:

#### Pertemuan N: [materi pertemuan] — [alokasi, contoh "2 x 45 menit"]
#### a. Pendahuluan: [P] menit
1. [langkah] (X menit)
2. [langkah] (X menit)
(jumlah semua (X menit) pada bagian ini HARUS TEPAT = P menit pendahuluan pertemuan ini pada DATA)

#### b. Kegiatan Inti: [I] menit
Untuk SETIAP fase sintaks pada DATA, tulis sub-heading dengan format persis:
**Fase N: [nama fase]**, alokasi Y menit
lalu langkah-langkahnya, masing-masing diakhiri (X menit).
Jumlah (X menit) dalam satu fase HARUS TEPAT = Y menit fase tersebut, dan jumlah seluruh fase HARUS TEPAT = I menit inti pertemuan ini.
PENTING: angka menit fase hanya boleh muncul di sub-heading fase (format koma "alokasi Y menit", TANPA kurung), sedangkan angka menit langkah selalu dalam kurung "(X menit)". Jangan menulis angka menit dalam kurung di sub-heading bagian maupun fase.

#### c. Penutup: [C] menit
Langkah refleksi, umpan balik, tindak lanjut, masing-masing diakhiri (X menit), total TEPAT = C menit penutup pertemuan ini pada DATA.

ATURAN PENANDA MENIT (hanya dua bentuk ini, jangan campur):
- Sub-heading bagian: "#### a. Pendahuluan: [N] menit" (pakai titik dua, TANPA kurung)
- Setiap langkah kegiatan diakhiri "(X menit)" (WAJIB dalam kurung)

Tulis langkah kegiatan yang konkret dan bisa langsung dilaksanakan (siapa berbuat apa, dengan bahan atau media apa), bukan instruksi umum seperti "Guru melaksanakan pembelajaran". ${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Kembalikan HANYA markdown kegiatan (satu blok per pertemuan, berurutan), tanpa pembuka/penutup tambahan. Bahasa Indonesia formal.`;
  const system = multi ? systemMulti : systemTunggal;
  const daftarFase = sintaks.fase.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const budgetTunggalTxt = `BUDGET WAKTU (WAJIB dipatuhi tepat):
- Total: ${budgetTunggal.pendahuluan + budgetTunggal.inti + budgetTunggal.penutup} menit
- Pendahuluan: TEPAT ${budgetTunggal.pendahuluan} menit
- Kegiatan Inti: TEPAT ${budgetTunggal.inti} menit
- Penutup: TEPAT ${budgetTunggal.penutup} menit`;
  const budgetMultiTxt = `BUDGET WAKTU PER PERTEMUAN (WAJIB dipatuhi tepat per pertemuan):
${daftar.map((p, i) => {
    const b = budgets[i];
    const t = b.pendahuluan + b.inti + b.penutup;
    return `- Pertemuan ${i + 1} "${String(p.materi).slice(0, 80)}": Total TEPAT ${t} menit (Pendahuluan TEPAT ${b.pendahuluan} + Inti TEPAT ${b.inti} + Penutup TEPAT ${b.penutup})`;
  }).join('\n')}`;
  const user = `${multi ? budgetMultiTxt : budgetTunggalTxt}

MODEL: ${sintaks.nama}. Kegiatan inti WAJIB mengikuti fase-fase sintaks berikut secara berurutan:
${daftarFase}

Susun kegiatan pembelajaran untuk modul "${fondasi.judul}".
Data: ${IDENT(info)}
- Materi Pokok/Topik: ${info.topik || '-'}
- Tujuan Pembelajaran yang harus dicapai kegiatan ini:\n${fondasi.tp.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n${konteksSumber(materi, sumber)}`;
  return { system, user };
}

function promptTahap3(info, fondasi, materi, sumber) {
  // System 100% statis agar prefix prompt stabil (context caching). Daftar TP
  // dipindah ke user message.
  const system = `Kamu adalah asisten penyusun Modul Ajar Kurikulum Merdeka untuk guru Indonesia.
Tugasmu HANYA menyusun bagian ASESMEN, PENGAYAAN/REMEDIAL, dan REFLEKSI dalam markdown. ${ANTI_FIKSI}
Semua asesmen WAJIB diturunkan langsung dari Tujuan Pembelajaran pada bagian DATA di pesan pengguna (jangan mengarang indikator baru).

Struktur WAJIB persis:
### 7. Asesmen
- **Asesmen Diagnostik**: ...
- **Asesmen Formatif**: ... beserta contoh instrumen atau soal singkat yang lengkap dan benar-benar bisa dipakai untuk mengukur TP di atas (tulis soalnya utuh beserta kunci bila berupa soal, bukan kerangka seperti "Soal 1: ...")
- **Asesmen Sumatif**: ... beserta kisi-kisi singkat yang merujuk TP di atas

### 8. Pengayaan dan Remedial
- **Pengayaan**: kegiatan konkret untuk peserta didik yang melampaui TP
- **Remedial**: kegiatan konkret untuk peserta didik yang belum mencapai TP

### 9. Refleksi Peserta Didik dan Guru
Pertanyaan refleksi untuk peserta didik dan untuk guru.

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Kembalikan HANYA markdown bagian-bagian di atas. Bahasa Indonesia formal. ${ISTILAH_BARU}`;
  const user = `Susun asesmen dan pelengkap untuk modul "${fondasi.judul}".\nData: ${IDENT(info)}\n- Mata Pelajaran: ${info.mapel || '-'} | Materi: ${info.topik || '-'}\n- Tujuan Pembelajaran (rujukan asesmen):\n${fondasi.tp.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n${konteksSumber(materi, sumber)}`;
  return { system, user };
}

// Tahap 4 (baru): materi pembelajaran lengkap + bank soal + rubrik penilaian.
// Dipisah dari tahap 3 agar tiap panggilan AI tetap fokus dan tidak terpotong.
function promptTahapMateri(info, fondasi, materi, sumber) {
  const nPG = info.jmlPG || 10;
  const nUraian = info.jmlUraian || 5;
  // System 100% statis agar prefix prompt stabil (context caching). TP dan
  // jumlah soal dipindah ke user message.
  const system = `Kamu adalah asisten penyusun Modul Ajar Kurikulum Merdeka untuk guru Indonesia.
Tugasmu HANYA menyusun bagian MATERI PEMBELAJARAN dan BANK SOAL dalam markdown. ${ANTI_FIKSI}
Materi harus selaras dengan Tujuan Pembelajaran pada bagian DATA di pesan pengguna.

Struktur WAJIB persis:
### 10. Materi Pembelajaran
Uraian materi yang lengkap dan runtut per sub-topik: konsep kunci, penjelasan dengan contoh konkret yang dekat dengan kehidupan peserta didik Indonesia, dan (bila relevan) langkah atau mekanisme. Bahasa formal namun komunikatif. Minimal 400 kata.

### 11. Bank Soal
- **Soal Pilihan Ganda** (jumlah sesuai DATA): tiap soal bernomor, 4 opsi (A-D). Opsi pengecoh harus masuk akal (miskonsepsi yang umum terjadi), bukan asal. Tulis kunci jawaban di akhir bagian ini dengan format: 1-B, 2-C, ...
- **Soal Uraian** (jumlah sesuai DATA): tiap soal bernomor beserta pedoman penskoran singkat.
Soal harus mengukur TP di atas, bervariasi dari C1 sampai C4.

### 12. Rubrik Penilaian
Tabel rubrik: kolom Aspek | Skor 4 | Skor 3 | Skor 2 | Skor 1, untuk penilaian uraian atau produk di atas. Deskriptor tiap sel harus konkret dan bisa diamati (bukan "baik", "cukup", "kurang" tanpa penjelasan). Plus panduan konversi skor ke nilai 0-100.

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Kembalikan HANYA markdown bagian-bagian di atas. Bahasa Indonesia formal. ${ISTILAH_BARU}`;
  const user = `Susun materi pembelajaran dan bank soal untuk modul "${fondasi.judul}".\nData: ${IDENT(info)}\n- Mata Pelajaran: ${info.mapel || '-'} | Materi: ${info.topik || '-'}\n- Jumlah soal: ${nPG} pilihan ganda, ${nUraian} uraian\n- Tujuan Pembelajaran (rujukan materi & soal):\n${fondasi.tp.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n${konteksSumber(materi, sumber)}`;
  return { system, user };
}

function rakitModul(info, fondasi, budgets, daftar, sintaks, kegiatanMd, asesmenMd, materiMd) {
  const multi = Array.isArray(daftar) && daftar.length > 1 && budgets.length === daftar.length;
  // Alokasi tampil polos tanpa rincian menit (sesuai permintaan guru).
  const alokasiLabel = multi ? `${daftar.length} pertemuan` : (info.alokasi || '-');
  const tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  return `# ${fondasi.judul}

## A. Informasi Umum
- **Nama Penyusun**: ${info.nama || '(diisi guru)'}
- **Sekolah**: ${info.sekolah || '(diisi guru)'}
- **Tahun Ajaran**: ${info.tahunAjaran || '-'}
- **Jenjang / Fase / Kelas**: ${info.jenjang || '-'} / ${info.fase || '-'} / ${info.kelas || '-'}
- **Mata Pelajaran**: ${info.mapel || '-'}
- **Materi Pokok**: ${info.topik || '-'}
- **Alokasi Waktu**: ${alokasiLabel}
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

${materiMd}

## C. Lampiran
- **LKPD**: kerangka lembar kerja selaras TP di atas
- **Bahan Bacaan**: ringkasan materi pengayaan untuk guru
- **Glosarium**: istilah + definisi singkat
- **Daftar Pustaka**: minimal 3 sumber nyata (buku/teori/penulis yang benar-benar ada)

## D. Lembar Pengesahan

Modul ajar ini telah disusun dan disetujui untuk digunakan dalam kegiatan pembelajaran.

**Sekolah**: ${info.sekolah || '(diisi guru)'}

| | |
|---|---|
| Mengetahui, | ............, ${tanggal} |
| Kepala Sekolah | Guru Mata Pelajaran |
| | |
| ( ............................................ ) | ( ${info.nama || '............................................'} ) |
| NIP. ........................................ | NIP. ........................................ |
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

function validasiAkhir(markdown, budgets) {
  const masalah = [];
  const wajib = ['## A. Informasi Umum', '### 1.', '### 2.', '### 6.', '### 7.', '### 10.', '### 11.', '### 12.', '## C. Lampiran', '## D. Lembar Pengesahan'];
  for (const h of wajib) if (!markdown.includes(h)) masalah.push(`Heading hilang: ${h}`);
  const total = jumlahMenit(bagianKegiatan(markdown));
  const ekspektasi = budgets.reduce((s, b) => s + b.pendahuluan + b.inti + b.penutup, 0);
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

// Guru sering mengisi Topik/Alokasi dengan bahasa santai berupa INSTRUKSI
// ("cari aja di internet", "sesuaikan 1JP=40 menit"), bukan nilai final.
// Fungsi ini menerjemahkannya menjadi nilai konkret via satu AI call kecil.
// Gagal → lempar error, ditangani siapkanInfo (pakai info apa adanya).
async function interpretasiInput(info) {
  const system = `Kamu adalah penerjemah input guru menjadi data formulir yang rapi. Guru Indonesia sering mengisi formulir dengan bahasa santai atau instruksi, bukan nilai final. Tugasmu: ubah menjadi NILAI FINAL yang konkret. Konteks (JANGAN diubah): Jenjang, Fase, Kelas, Mapel, Nama, Sekolah, Tahun Ajaran, Semester, Model. Aturan: 1. TOPIK/MATERI: jika berisi instruksi ('cari aja di...', 'sesuai mapel dan kelas', 'terserah', 'apapun', dll) atau tidak jelas, TENTUKAN satu topik paling tepat untuk mapel+kelas+jenjang itu berdasarkan kurikulum Indonesia yang umum; kembalikan topik final yang konkret dan spesifik, BUKAN instruksinya. Jika sudah konkret, kembalikan apa adanya dengan kapitalisasi rapi. 2. ALOKASI: jika berisi instruksi ('sesuaikan', '1JP = 40 menit', 'pendahuluan 10 inti 20 penutup 10'), ekstrak total menit dan pembagiannya; kembalikan format kanonis 'N x M menit' (contoh '1 x 40 menit'). Jika hanya total tanpa pembagian, kembalikan pendahuluan/inti/penutup = null. 3. Jangan pernah mengembalikan teks instruksi mentah. Kembalikan JSON MURNI: {"topik": "...", "alokasi": "1 x 40 menit", "pendahuluan": 10, "inti": 20, "penutup": 10}.`;
  const userMsg = `Jenjang: ${info.jenjang || '-'} | Fase: ${info.fase || '-'} | Kelas: ${info.kelas || '-'} | Mapel: ${info.mapel || '-'} | Semester: ${info.semester || '-'} | Model: ${info.model || '-'}\nTopik (mentah): ${info.topik || '-'}\nAlokasi (mentah): ${info.alokasi || '-'}`;
  const raw = await ai(system, userMsg, 800, 0.3);
  return ekstrakJson(raw);
}

// Bersihkan info guru: topik/alokasi konkret + budget menit.
// Selalu aman dipanggil: gagal interpretasi → info apa adanya + budget default.
async function siapkanInfo(info) {
  // Multi-pertemuan: satu modul = satu bab = N pertemuan (dipilih dari Prosem).
  // Budget dihitung per pertemuan, bukan dari info.alokasi.
  const daftar = Array.isArray(info.pertemuanList)
    ? info.pertemuanList.filter((p) => p && String(p.materi || '').trim()).slice(0, 12)
    : [];
  if (daftar.length > 1) {
    const budgets = daftar.map((p) => budgetKegiatan(parseAlokasi(p.alokasi).totalMenit));
    return { info, budgets, daftar };
  }
  try {
    const r = await interpretasiInput(info);
    const infoBaru = {
      ...info,
      topik: (r.topik && String(r.topik).trim()) || info.topik,
      alokasi: (r.alokasi && String(r.alokasi).trim()) || info.alokasi,
    };
    const { totalMenit } = parseAlokasi(infoBaru.alokasi);
    const p = Number(r.pendahuluan), i = Number(r.inti), n = Number(r.penutup);
    const budget = (p > 0 && i > 0 && n > 0 && p + i + n === totalMenit)
      ? { pendahuluan: p, inti: i, penutup: n }
      : budgetKegiatan(totalMenit);
    return { info: infoBaru, budget };
  } catch (e) {
    console.warn('[modulajar] interpretasi input gagal, pakai info apa adanya:', e.message);
    const { totalMenit } = parseAlokasi(info.alokasi);
    return { info, budget: budgetKegiatan(totalMenit) };
  }
}

async function generateModulPipeline(info, materi, sumber, rekomendasi, onTahap = () => {}, onTeks = () => {}) {
  // Tahap 0 — pahami maksud pengisian formulir (guru sering menulis instruksi santai,
  // bukan nilai final; ubah menjadi nilai konkret sebelum dipakai tahap lain)
  await onTahap('pahami');
  const siap = await siapkanInfo(info);
  info = siap.info;
  const budgets = siap.budgets || [siap.budget];
  const daftar = siap.daftar || null;
  const multi = !!(daftar && daftar.length > 1);
  const targetMenit = budgets.reduce((s, b) => s + b.pendahuluan + b.inti + b.penutup, 0);
  const { label } = parseAlokasi(info.alokasi);

  // Tahap 1 — fondasi terstruktur (JSON internal: tidak di-stream agar tidak tampil mentah ke user)
  await onTahap('fondasi');
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
  // budget sudah dihitung di tahap 0 (siapkanInfo), memakai pembagian guru bila valid
  await onTahap('kegiatan');
  // Model 'auto': AI pilihkan yang paling cocok untuk topik ini
  let modelEfektif = info.model || (rekomendasi && rekomendasi.model) || '';
  if (String(modelEfektif).toLowerCase() === 'auto') {
    await onTahap('pilih-model');
    modelEfektif = await pilihModelOtomatis(info, materi);
    // Simpan model terpilih agar tampil di dokumen & tahap berikutnya
    info.model = modelEfektif;
  }
  const sintaks = deteksiSintaks(modelEfektif);
  const p2 = promptTahap2(info, fondasi, budgets, daftar, sintaks, materi, sumber);
  let kegiatanMd = await ai(p2.system, p2.user, multi ? 9000 : 6000, 0.7, (d) => onTeks('kegiatan', d));
  let totalKegiatan = jumlahMenit(kegiatanMd);
  if (totalKegiatan !== targetMenit) {
    console.warn(`[modulajar] tahap 2: total menit ${totalKegiatan} != ${targetMenit} (${label}), retry dengan koreksi`);
    onTeks('teks-reset', 'kegiatan'); // beri tahu pendengar: teks kegiatan ditulis ulang, jangan di-append
    await onTahap('koreksi');
    const koreksi = multi
      ? `\n\nKOREKSI: total menit kegiatanmu ${totalKegiatan}, HARUS TEPAT ${targetMenit}. Rincian per pertemuan: ${daftar.map((p, i) => {
          const b = budgets[i];
          return `Pertemuan ${i + 1} = TEPAT ${b.pendahuluan + b.inti + b.penutup} (P${b.pendahuluan}+I${b.inti}+C${b.penutup})`;
        }).join('; ')}. Tulis ulang dengan total yang tepat PER PERTEMUAN.`
      : `\n\nKOREKSI: total menit kegiatanmu ${totalKegiatan}, HARUS TEPAT ${targetMenit} (Pendahuluan ${budgets[0].pendahuluan} + Inti ${budgets[0].inti} + Penutup ${budgets[0].penutup}). Tulis ulang dengan total yang tepat.`;
    kegiatanMd = await ai(p2.system, p2.user + koreksi, multi ? 9000 : 6000, 0.5, (d) => onTeks('kegiatan', d));
    totalKegiatan = jumlahMenit(kegiatanMd);
    if (totalKegiatan !== targetMenit) console.warn(`[modulajar] tahap 2: retry masih meleset (${totalKegiatan} != ${targetMenit})`);
  }

  // Tahap 3 — asesmen & pelengkap dari TP
  await onTahap('asesmen');
  const p3 = promptTahap3(info, fondasi, materi, sumber);
  const asesmenMd = await ai(p3.system, p3.user, 5000, 0.7, (d) => onTeks('asesmen', d));

  // Tahap 4 — materi pembelajaran + bank soal + rubrik
  await onTahap('materi');
  const p4 = promptTahapMateri(info, fondasi, materi, sumber);
  const materiMd = await ai(p4.system, p4.user, 7000, 0.7, (d) => onTeks('materi', d));

  // Tahap 5 — assembly + validasi akhir
  await onTahap('rakit');
  const markdown = rakitModul(info, fondasi, budgets, daftar, sintaks, kegiatanMd.trim(), asesmenMd.trim(), materiMd.trim());
  const masalah = validasiAkhir(markdown, budgets);
  if (masalah.length) console.warn('[modulajar] validasi akhir:', masalah.join(' | '));
  return markdown;
}

// Prompt single-shot lama untuk docType=modul — dipakai sebagai FALLBACK
const LEGACY_MODUL = `Kamu adalah asisten penyusun Modul Ajar Kurikulum Merdeka untuk guru Indonesia.
Susun MODUL AJAR yang lengkap, rapi, siap pakai. WAJIB ikuti struktur markdown persis di bawah. Jangan tambah/kurangi heading.
${ANTI_FIKSI} ${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

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
Minimal 3 TP format ABCD, diberi nomor. Jika ada DOKUMEN ACUAN, TP WAJIB diambil dari ATP/Prosem pada acuan, jangan mengarang TP baru.

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

#### a. Pendahuluan: 10 menit
Langkah berurutan, masing-masing diakhiri (X menit), total tepat 10 menit.

#### b. Kegiatan Inti: ... menit
Langkah sesuai sintaks model pembelajaran yang dipilih, masing-masing diakhiri (X menit), total tepat sama dengan alokasi Kegiatan Inti. Terapkan prinsip pembelajaran mendalam: berkesadaran, bermakna, menggembirakan. Tulis langkah yang konkret dan bisa langsung dilaksanakan, bukan instruksi umum.

#### c. Penutup: 10 menit
Refleksi, umpan balik, tindak lanjut, masing-masing diakhiri (X menit), total tepat 10 menit.

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

Aturan: Bahasa Indonesia formal. Kegiatan inti mengikuti sintaks model pembelajaran. Sesuaikan kedalaman dengan jenjang/fase. Gunakan kerangka 8 Dimensi Profil Lulusan, BUKAN lagi Profil Pelajar Pancasila/P5.`;

// ================= PROMPTS DOKUMEN LAIN (single-shot, tidak berubah) =================
const PROMPTS = {
  atp: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun ALUR TUJUAN PEMBELAJARAN (ATP) untuk satu semester. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (CP), turunkan TP langsung dari CP tersebut secara berurutan dan logis, jangan mengarang TP di luar CP acuan.

# Alur Tujuan Pembelajaran (ATP): [Mata Pelajaran] Kelas [X] Semester [X]

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

Urutkan dari yang konkret ke abstrak / mudah ke sulit. Jika data memuat JP per minggu, pakai untuk menghitung total JP; bila tidak ada, asumsikan alokasi total yang realistis satu semester (sekitar 16 pertemuan efektif).

## D. Catatan Pengembangan
Prasyarat antar materi dan diferensiasi yang disarankan. ${ISTILAH_BARU}

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Aturan: Bahasa Indonesia formal. TP operasional dan terukur.`,

  cp: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun draf CAPAIAN PEMBELAJARAN (CP) per elemen untuk fase dan mata pelajaran yang diminta. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Selaraskan dengan kerangka CP nasional Kemendikdasmen untuk fase/mapel tersebut, jangan mengarang elemen atau kompetensi di luar kerangka resmi. Jika guru menempel TEKS CP RESMI sebagai acuan, susun draf dengan setia merujuk teks tersebut tanpa menambah kompetensi baru.

# Capaian Pembelajaran: [Mata Pelajaran] Fase [X]

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

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Aturan: Bahasa Indonesia formal. Gunakan kata kerja operasional.`,

  analisis_cp: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun ANALISIS CAPAIAN PEMBELAJARAN (CP): bedah CP per elemen menjadi komponen yang operasional untuk perencanaan. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (CP), analisis WAJIB merujuk CP tersebut; jangan menambah kompetensi di luar CP acuan.

# Analisis Capaian Pembelajaran: [Mata Pelajaran] Fase [X]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran**: [dari data]
- **Jenjang / Fase**: ...
- **Mata Pelajaran**: ...

## B. Ringkasan CP
Parafrase CP fase yang relevan per elemen, singkat dan setia pada teks acuan.

## C. Bedah per Elemen
Untuk setiap elemen, susun tabel:

| Elemen | Kompetensi Inti (dari CP) | Kata Kerja Operasional | Materi Esensial Terkait | Catatan |
|--------|---------------------------|------------------------|-------------------------|---------|
| ... | ... | ... | ... | ... |

## D. Implikasi untuk TP
Butir-butir turunan yang siap dirumuskan menjadi Tujuan Pembelajaran (TP): operasional, terukur, berurutan dari mudah ke sulit.

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Aturan: Bahasa Indonesia formal. ${ISTILAH_BARU}`,

  tp: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun DAFTAR TUJUAN PEMBELAJARAN (TP) yang diturunkan dari CP/analisis CP. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (analisis CP atau CP), setiap TP WAJIB dapat ditelusur kembali ke CP acuan; jangan mengarang TP di luar CP.

# Tujuan Pembelajaran: [Mata Pelajaran] Kelas [X] Semester [X]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran**: [dari data]
- **Jenjang / Fase / Kelas**: ...
- **Mata Pelajaran**: ...

## B. Daftar Tujuan Pembelajaran
Susun tabel TP bernomor, diurutkan dari yang paling dasar ke yang kompleks:

| No | Tujuan Pembelajaran | Elemen CP Terkait | Profil Lulusan Terkait |
|----|---------------------|-------------------|------------------------|
| 1 | Peserta didik mampu ... | ... | ... |

Setiap TP memakai kata kerja operasional yang dapat diamati/diukur (mengidentifikasi, menjelaskan, menganalisis, membuat, dsb.).

## C. Catatan
Keterkaitan antar TP dan saran pengelompokan menjadi bab/materi pokok untuk ATP.

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Aturan: Bahasa Indonesia formal. ${ISTILAH_BARU}`,

  distribusi_jp: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun DISTRIBUSI ALOKASI JAM PELAJARAN (JP): pembagian JP per materi pokok/bab selama satu semester. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (ATP atau minggu efektif), alokasi WAJIB konsisten dengan total JP efektif pada acuan tersebut.

# Distribusi Alokasi JP: [Mata Pelajaran] Kelas [X] Semester [X]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran**: [dari data]
- **Jenjang / Fase / Kelas**: ...
- **Mata Pelajaran**: ...
- **JP per Minggu**: [dari data]

## B. Rekapitulasi JP
Total JP efektif semester ini dan dasar perhitungannya (JP/minggu × minggu efektif).

## C. Tabel Distribusi JP
WAJIB format tabel markdown:

| No | Materi Pokok / Bab | Jumlah JP | Pertemuan ke- | Keterangan |
|----|--------------------|-----------|---------------|------------|
| 1 | ... | 4 | 1–2 | ... |
| 2 | ... | 6 | 3–5 | ... |

(Contoh di atas untuk 2 JP/minggu: 4 JP = 2 pertemuan, 6 JP = 3 pertemuan.)

ATURAN KERAS NOMOR PERTEMUAN:
- 1 pertemuan = 1 minggu kalender = (JP per minggu) JP. CONTOH: bila 2 JP/minggu, maka materi 4 JP = 2 pertemuan; materi 6 JP = 3 pertemuan.
- Kolom "Pertemuan ke-" menghitung PERTEMUAN (minggu), BUKAN JP satuan. Contoh dengan 2 JP/minggu: baris 1 = 4 JP → "1–2", baris 2 = 6 JP → "3–5", baris 3 = 4 JP → "6–7".
- Nomor pertemuan WAJIB berurutan menyambung tanpa lompat: baris berikutnya melanjutkan dari nomor terakhir + 1. DILARANG menulis "1–4", "5–10" untuk materi 4 JP dan 6 JP (itu menghitung JP, bukan pertemuan).

PEMBAGIAN SEMESTER: bila Semester = "Ganjil + Genap (1 tahun ajaran)", tabel WAJIB dibagi dua bagian yang jelas: tulis sub-heading "**Semester Ganjil**" sebelum baris-baris semester ganjil dan "**Semester Genap**" sebelum baris-baris semester genap (sebagai baris pemisah di dalam tabel atau heading di antara dua tabel). Nomor pertemuan di semester genap MELANJUTKAN dari semester ganjil (tidak mengulang dari 1). Bila hanya satu semester, tidak perlu pembagian ini.

Total JP pada tabel WAJIB sama dengan rekapitulasi. Sisakan JP untuk asesmen sumatif dan cadangan/remedial.

## D. Catatan
Penyesuaian bila ada minggu tidak efektif susulan.

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}
LARANGAN KERAS: DILARANG menampilkan proses berpikir, draf awal, atau bagian "Perbaikan Tabel". Hitung SEMUA angka (total JP, nomor pertemuan) dengan benar SEBELUM menulis — pastikan sudah tepat dari awal. Keluarkan HANYA satu versi final yang sudah benar. Jangan pernah menulis dua versi tabel (salah lalu dibetulkan).

Aturan: Bahasa Indonesia formal.`,

  prota: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun PROGRAM TAHUNAN (PROTA) satu tahun ajaran. WAJIB ikuti struktur markdown persis di bawah.
Jika Semester = 'Ganjil + Genap (1 tahun ajaran)', pastikan distribusi materi mencakup semester ganjil dan genap secara seimbang dalam satu tahun ajaran penuh.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (ATP), distribusi materi WAJIB mengikuti urutan materi pokok dan alokasi pada ATP tersebut.

# Program Tahunan (PROTA): [Mata Pelajaran] Kelas [X]

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

Cakup seluruh materi pokok esensial satu tahun. Alokasi realistis; jika data memuat JP per minggu, pakai sebagai dasar hitungan.

## D. Catatan
Penyesuaian untuk minggu tidak efektif dan pengayaan/remedial.

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Aturan: Bahasa Indonesia formal. ${ISTILAH_BARU}`,

  prosem: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun PROGRAM SEMESTER (PROSEM) dalam format MATRIKS KALENDER seperti dokumen Prosem resmi sekolah Indonesia: baris = materi pokok, kolom = bulan yang dipecah per minggu. WAJIB ikuti struktur markdown persis di bawah.
Jika Semester = 'Ganjil + Genap (1 tahun ajaran)', susun DUA matriks terpisah: satu untuk semester ganjil, satu untuk semester genap, dengan pemisah heading yang jelas.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (PROTA), materi dan alokasi JP WAJIB mengikuti PROTA tersebut.

# Program Semester (PROSEM): [Mata Pelajaran] Kelas [X] Semester [X]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran**: [dari data]
- **Jenjang / Fase / Kelas / Semester**: ...
- **Mata Pelajaran**: ...
- **Alokasi Waktu**: [JP per minggu] JP/minggu

## B. Matriks Program Semester

PERHATIAN: Untuk section B ini, JANGAN tulis tabel apapun. JANGAN tulis kalimat penjelasan. Tulis HANYA satu blok kode JSON persis seperti contoh berikut (sistem akan mengubahnya menjadi tabel otomatis):

CONTOH:
\`\`\`json
{
  "ganjil": [
    {"materi": "Berpikir Komputasional", "jp": 4, "ket": "TP 1-2"},
    {"materi": "Algoritma dan Pemrograman", "jp": 6, "ket": "TP 3-5"},
    {"materi": "Struktur Data", "jp": 2, "ket": "TP 6"},
    {"materi": "Asesmen Sumatif", "jp": 2, "ket": ""},
    {"materi": "Cadangan", "jp": 2, "ket": "Buffer"}
  ],
  "genap": [
    {"materi": "Proyek Sistem Digital", "jp": 12, "ket": "Proyek"}
  ],
  "struktur_bulan_ganjil": {"Jul": [3,4,5], "Agu": 4, "Sep": 4, "Okt": 5, "Nov": 4, "Des": 5},
  "struktur_bulan_genap": {"Jan": 4, "Feb": 4, "Mar": 5, "Apr": 4, "Mei": 4, "Jun": 5},
  "libur_ganjil": {"Sep-4": "Flash Event Sekolah", "Des-2": "Asesmen Akhir Semester", "Des-3": "Ekstrakurikuler", "Des-4": "Libur Semester Ganjil", "Des-5": "Libur Semester Ganjil"},
  "libur_genap": {"Feb-4": "Libur Awal Ramadhan", "Mar-4": "Libur Idul Fitri", "Mar-5": "Libur Idul Fitri"}
}
\`\`\`

CARA MENGISI (PENTING — BACA DULU):
Lihat dokumen ATP acuan. Setiap kelompok TP yang besar WAJIB dipecah menjadi sub-topik SPESIFIK dengan nama yang bermakna. JANGAN menulis ulang judul kelompoknya.

Contoh SALAH (jangan ditiru):
{"materi": "Pengantar Informatika: Komputasi, Algoritma, dan Struktur Data (TP 1-9)", "jp": 18}

Contoh BENAR (ditiru polanya):
{"materi": "Berpikir Komputasional: dekomposisi dan pengenalan pola", "jp": 6, "ket": "TP 1-3"},
{"materi": "Algoritma dan Pemrograman Python dasar", "jp": 6, "ket": "TP 4-6"},
{"materi": "Struktur Data: array, list, dan dictionary", "jp": 6, "ket": "TP 7-9"}

Setiap objek harus bisa dibaca guru dan langsung tahu apa yang diajarkan — bukan judul bab yang umum.

STRUKTUR MINGGU (WAJIB): Buka dokumen Analisis Minggu Efektif, baca TABEL 1 (Ganjil) dan TABEL 2 (Genap). Untuk tiap bulan, salin angka dari kolom "Jumlah Minggu". Susun ke dalam "struktur_bulan_ganjil" / "struktur_bulan_genap". ATURAN PENOMORAN: Jika jumlah minggu < 5, tulis DAFTAR EKSPLISIT minggu mana yang masuk. Konvensi: bulan di AWAL semester (Juli, Januari) -> minggu TERAKHIR (mis. Juli 3 minggu = {"Jul": [3,4,5]}); bulan di AKHIR semester (Desember, Juni) -> tulis angka saja (sistem tampilkan semua, minggu libur ditandai terpisah). Contoh: {"Jul": [3,4,5], "Agu": 4, "Sep": 4, "Okt": 5, "Nov": 4, "Des": 5}. SEMUA bulan wajib dicantumkan. JANGAN samakan semua jadi 4.\n1. ACUAN WAJIB (JANGAN mengarang di luar ini):
   a. PROTA (Program Tahunan) — SUMBER UTAMA. Prosem DITURUNKAN LANGSUNG dari PROTA: materi, urutan, dan alokasi bulan mengikuti PROTA persis.
   b. Analisis Minggu Efektif — menentukan minggu mana yang efektif vs libur (untuk libur_ganjil/genap).
   c. Distribusi Alokasi JP — acuan pembagian JP per pertemuan/topik.
   Alokasi JP per materi mengikuti acuan — bisa 1 JP, 2 JP, 5 JP, dst. Bersifat DINAMIS, bukan pola tetap.
2. Nama "materi" harus KONKRET dan SPESIFIK sesuai rincian TP di ATP (contoh: "Sorting dan searching array", bukan "Struktur Data lanjutan"). Jika ATP mengelompokkan banyak TP dalam satu judul umum, pecah menjadi sub-topik yang lebih spesifik.
3. Urutan array = urutan pengajaran.
4. HITUNG TOTAL JP DENGAN BENAR (JANGAN asal):
   a. Dari dokumen Analisis Minggu Efektif, baca "Total JP Efektif" pada baris TOTAL (mis. Ganjil = 40 JP, Genap = 34 JP). Jika tidak ada, hitung: (kolom "Minggu Efektif" per bulan, dijumlahkan) × (JP per minggu).
   b. Total "jp" SEMUA objek per semester HARUS SAMA PERSIS dengan angka Total JP Efektif ini. DILARANG kurang.
   c. Materi harus tersebar dari minggu efektif PERTAMA hingga minggu efektif TERAKHIR — DILARANG berhenti di tengah semester (mis. berakhir Oktober padahal semester sampai Desember).
   d. Jika materi pokok tidak cukup mengisi semua minggu efektif, tambahkan objek {"materi": "Pengayaan / Remedial / Proyek", "jp": <selisih>, "ket": "Buffer"} atau {"materi": "Cadangan", "jp": <selisih>, "ket": "Buffer"}.
5. Jika satu semester saja, array semester lainnya = [].

## C. Pengesahan". DILARANG menambah section lain.



## C. Pengesahan
Tulis blok tanda tangan: "Mengetahui, Kepala Sekolah" dan "[Kota], [Bulan Tahun] — Guru Mata Pelajaran", masing-masing dengan baris "Nama" dan "NIP".

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Aturan: Bahasa Indonesia formal. Alur materi logis dan berurutan. ${ISTILAH_BARU}`,

  minggu_efektif: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun ANALISIS MINGGU EFEKTIF untuk satu semester. WAJIB ikuti struktur markdown persis di bawah.
Jika Semester = 'Ganjil + Genap (1 tahun ajaran)', susun untuk SATU TAHUN AJARAN penuh mencakup semester ganjil dan genap, dengan tabel per semester dan baris TOTAL gabungan.
${ANTI_FIKSI} Jika guru menempel/mengunggah DOKUMEN MINGGU EFEKTIF milik sekolah sebagai acuan, susun dengan setia mengikuti data tersebut.

# Analisis Minggu Efektif: [Mata Pelajaran] Kelas [X] Semester [X]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran / Semester**: [dari data]
- **Jenjang / Fase / Kelas**: ...
- **Mata Pelajaran**: ...

## B. Kalender Pendidikan Ringkas
Uraian bulan-bulan dalam semester berjalan beserta catatan hari libur, ujian, dan kegiatan sekolah. Jangan mengarang tanggal atau hari libur spesifik: susun berdasarkan pola umum kalender pendidikan nasional (semester ganjil Juli sampai Desember, semester genap Januari sampai Juni) dan tulis catatan bahwa guru wajib menyesuaikan dengan kalender pendidikan sekolah masing-masing.

## C. Perhitungan Minggu Efektif
WAJIB format tabel markdown:

| Bulan | Jumlah Minggu | Minggu Efektif | Minggu Tidak Efektif | Keterangan |
|-------|---------------|----------------|----------------------|------------|
| ... | ... | ... | ... | Libur / PTS / PAS / ... |

Tambahkan baris TOTAL di akhir tabel. Total minggu efektif realistis (umumnya 16-19 per semester).

## D. Distribusi Jam Pelajaran
Alokasi JP per minggu untuk mata pelajaran ini dan total JP efektif selama satu semester.

## E. Catatan Penyesuaian
Hal yang perlu disesuaikan bila kalender pendidikan berubah.

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Aturan: Bahasa Indonesia formal. ${ISTILAH_BARU}`,

  lkpd: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun LEMBAR KERJA PESERTA DIDIK (LKPD) yang siap cetak dan dikerjakan siswa. WAJIB ikuti struktur markdown persis di bawah. Gunakan bahasa yang ramah untuk siswa (sapaan "kamu/kalian").
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (modul ajar), kegiatan dan materi LKPD WAJIB selaras dengan TP dan materi pada modul tersebut.

# LKPD: [Judul Kegiatan]

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
Aktivitas inti: pengamatan, diskusi, percobaan, atau pemecahan masalah. Setiap tugas harus bisa langsung dikerjakan di lembar ini: sediakan ruang jawab yang jelas (garis, tabel, atau kotak jawab). Jangan menulis instruksi tanpa tempat menjawab.

## E. Pertanyaan Refleksi
3 pertanyaan refleksi untuk siswa.

## F. Penilaian
Rubrik singkat untuk guru (aspek, kriteria, skor). Kriteria tiap skor harus konkret dan bisa diamati.

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Aturan: Bahasa Indonesia yang mudah dipahami sesuai jenjang. Tugas autentik dan kontekstual. ${ISTILAH_BARU}`,

  asesmen: `Kamu adalah asisten penyusun asesmen Kurikulum Merdeka untuk guru Indonesia.
Susun ASESMEN & RUBRIK yang selaras dengan modul ajar: mencakup asesmen diagnostik, formatif, dan sumatif beserta rubrik penilaiannya. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (modul ajar), setiap butir asesmen WAJIB mengukur TP pada modul tersebut; jangan mengarang materi di luar modul.

# Asesmen & Rubrik: [Judul Modul/Topik]

## A. Informasi Umum
- **Nama Penyusun**: [dari data]
- **Sekolah**: [dari data]
- **Tahun Ajaran**: [dari data]
- **Jenjang / Fase / Kelas**: ...
- **Mata Pelajaran**: ...

## B. Pemetaan TP ke Asesmen
Tabel: TP → jenis asesmen (diagnostik/formatif/sumatif) → teknik (tes tulis, observasi, unjuk kerja, proyek, portofolio).

## C. Asesmen Diagnostik
Instrumen singkat awal pembelajaran (kognitif & non-kognitif).

## D. Asesmen Formatif
Butir-butir/formatif per kegiatan inti beserta kunci/indikator ketercapaian.

## E. Asesmen Sumatif
Soal sumatif akhir (bentuk pilihan ganda dan uraian) beserta kunci jawaban dan pedoman penskoran.

## F. Rubrik Penilaian
Rubrik untuk tiap teknik: aspek, kriteria per level, skor. Kriteria konkret dan dapat diamati.

## G. Tindak Lanjut
Rencana remedial dan pengayaan berdasarkan hasil.

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Aturan: Bahasa Indonesia formal. ${ISTILAH_BARU}`,

  bahan_ajar: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun BAHAN AJAR: materi bacaan/ringkasan yang selaras dengan modul ajar, siap dibagikan ke siswa. WAJIB ikuti struktur markdown persis di bawah. Gunakan bahasa yang ramah untuk siswa (sapaan "kamu/kalian") sesuai jenjang.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (modul ajar), materi WAJIB selaras dengan TP dan urutan materi pada modul tersebut.

# Bahan Ajar: [Judul Topik]

## A. Tujuan
TP yang dicapai dari bahan ajar ini (diringkas dari modul).

## B. Uraian Materi
Penjelasan konsep yang runtut, lengkap dengan contoh konkret dan ilustrasi deskriptif. Bagi menjadi sub-bagian berjudul jelas.

## C. Istilah Penting
Glosarium istilah + definisi singkat.

## D. Rangkuman
Poin-poin kunci dalam daftar ringkas.

## E. Latihan Mandiri
5–8 pertanyaan latihan tanpa kunci (untuk dikerjakan mandiri).

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Aturan: Bahasa Indonesia yang mudah dipahami sesuai jenjang. ${ISTILAH_BARU}`,

  soal: () => {
    // Jumlah soal (PG/Uraian) TIDAK disematkan di system prompt: nilainya ada di
    // user message (cache prefix system tetap stabil → hit rate context caching).
    return `Kamu adalah asisten penyusun asesmen Kurikulum Merdeka untuk guru Indonesia.
Susun PAKET SOAL lengkap dengan kisi-kisi, soal, kunci jawaban, dan pedoman penskoran. WAJIB ikuti struktur markdown persis di bawah.
${ANTI_FIKSI} Jika ada DOKUMEN ACUAN (modul ajar/ATP), kisi-kisi WAJIB diturunkan dari TP/indikator pada acuan, jangan mengarang indikator baru. Jika tidak ada acuan, turunkan dari materi pokok/topik pada data.

# Paket Soal: [Materi] Kelas [X]

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
| 1 | ... | PG/Uraian | ... | C1-C6 |

## C. Soal Pilihan Ganda
Jumlah sesuai baris "Jumlah Soal PG" pada pesan pengguna (bila tertulis '-', pakai 10), masing-masing dengan 4 opsi (A-D). Opsi pengecoh harus masuk akal (miskonsepsi yang umum terjadi), bukan asal.

## D. Soal Uraian
Jumlah sesuai baris "Uraian" pada pesan pengguna (bila tertulis '-', pakai 5): soal uraian singkat/esai.

## E. Kunci Jawaban dan Pedoman Penskoran
Kunci PG dengan format: 1-B, 2-C, ... (tanpa bold pada opsi). Rubrik penskoran uraian: skor per langkah penyelesaian, dengan deskriptor yang konkret.

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Aturan: Bahasa Indonesia formal. Sebar level kognitif C1-C6. Soal HOTS (C4-C6) minimal 20%. ${ISTILAH_BARU}`;
  },

  kktp: `Kamu adalah asisten penyusun perangkat pembelajaran Kurikulum Merdeka untuk guru Indonesia.
Susun KRITERIA KETERCAPAIAN TUJUAN PEMBELAJARAN (KKTP): tolok ukur yang dipakai guru untuk menilai apakah peserta didik mencapai TP. ${ANTI_FIKSI} Jika ada DOKUMEN ACUAN, WAJIB merujuk pada TP yang tercantum di acuan, jangan mengarang TP baru. Jika tidak ada acuan, turunkan TP dari materi pokok/topik pada data.

# KKTP: [Mata Pelajaran] Kelas [X] Semester [X]

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

${ANTI_SLOP} ${RANTAI_VALIDITAS} ${KONSISTENSI}

Aturan: Bahasa Indonesia formal. ${ISTILAH_BARU}`,
};

// Inti generate satu dokumen — dipakai route langsung maupun job paket

// Pembangun Matriks Prosem: AI hanya mengeluarkan JSON data sederhana;
// tabel HTML dibangun deterministik oleh kode sehingga sintaks SELALU valid.
// AI tidak pernah menulis <table> — tidak ada yang bisa rusak.
const BULAN_GANJIL = [['Juli', 'Jul'], ['Agustus', 'Agu'], ['September', 'Sep'], ['Oktober', 'Okt'], ['November', 'Nov'], ['Desember', 'Des']];
const BULAN_GENAP = [['Januari', 'Jan'], ['Februari', 'Feb'], ['Maret', 'Mar'], ['April', 'Apr'], ['Mei', 'Mei'], ['Juni', 'Jun']];

function bangunMatriksProsem(md, info) {
  if (!md || typeof md !== 'string') return md;
  // Cari JSON dengan beberapa pola (toleran terhadap format AI)
  let jsonStr = null;
  let m = md.match(/```json\s*([\s\S]*?)\s*```/);
  if (m) jsonStr = m[1];
  else {
    m = md.match(/```\s*([\s\S]*?"ganjil"[\s\S]*?)\s*```/);
    if (m) jsonStr = m[1];
    else {
      // JSON mentah tanpa fence: cari objek yang memuat "ganjil"
      m = md.match(/\{[\s\S]*?"ganjil"\s*:\s*\[[\s\S]*?\]\s*,?\s*"genap"[\s\S]*?\}/);
      if (m) jsonStr = m[0];
    }
  }
  if (!jsonStr) return md; // tidak ada JSON — kembalikan apa adanya
  let data;
  try { data = JSON.parse(jsonStr); }
  catch {
    // Coba perbaiki: buang trailing comma
    try { data = JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1')); }
    catch { return md; }
  }
  if (!data || (!Array.isArray(data.ganjil) && !Array.isArray(data.genap))) return md;
  const jpPerMinggu = Number(info?.jpPerMinggu) || 2;

  const bangunTabel = (daftar, bulan, tanda, daftarMinggu, libur) => {
    if (!Array.isArray(daftar)) return '';
    daftar = daftar.filter((it) => it && typeof it === 'object' && it.materi);
    if (daftar.length === 0) return '';

    // Kolom minggu DINAMIS dari daftar minggu efektif (AI).
    // Fallback: 5 minggu per bulan jika AI tidak menyediakan.
    const NAMA_BLN = { Jan: 'JANUARI', Feb: 'FEBRUARI', Mar: 'MARET', Apr: 'APRIL', Mei: 'MEI', Jun: 'JUNI', Jul: 'JULI', Agu: 'AGUSTUS', Sep: 'SEPTEMBER', Okt: 'OKTOBER', Nov: 'NOVEMBER', Des: 'DESEMBER' };
    const normKode = (k) => {
      const s = String(k || '').trim();
      const m = s.match(/([A-Za-z]+)\s*[-\s]?\s*(\d)/);
      if (!m) return null;
      const bln = m[1].slice(0, 3);
      const key = bln.charAt(0).toUpperCase() + bln.slice(1).toLowerCase();
      return { kode: key + '-' + m[2], bln: key, w: m[2] };
    };
    let kolomMinggu = [];
    let grupBulan = []; // [{nama, jml}]
    // Jika AI memberi struktur_bulan (mis. {"Okt": 5}), bangun daftar minggu darinya
    if (daftarMinggu && typeof daftarMinggu === 'object' && !Array.isArray(daftarMinggu)) {
      const daftarBaru = [];
      Object.entries(daftarMinggu).forEach(([bln, val]) => {
        const n = normKode(bln + '-1');
        if (!n) return;
        if (Array.isArray(val)) {
          // Daftar eksplisit: {"Jul": [3,4,5]}
          val.forEach((w) => { const wn = Number(w); if (wn >= 1 && wn <= 5) daftarBaru.push(n.bln + '-' + wn); });
        } else {
          // Angka saja: {"Jul": 3} -> 3 minggu TERAKHIR (konvensi awal semester)
          const j = Math.max(1, Math.min(5, Number(val) || 4));
          for (let w = 6 - j; w <= 5; w++) daftarBaru.push(n.bln + '-' + w);
        }
      });
      daftarMinggu = daftarBaru;
    }
    if (Array.isArray(daftarMinggu) && daftarMinggu.length > 0) {
      daftarMinggu.forEach((k) => {
        const n = normKode(k);
        if (!n) return;
        kolomMinggu.push(n.kode);
        const last = grupBulan[grupBulan.length - 1];
        if (last && last.kode === n.bln) last.jml++;
        else grupBulan.push({ kode: n.bln, nama: NAMA_BLN[n.bln] || n.bln.toUpperCase(), jml: 1 });
      });
    } else {
      bulan.forEach(([nama, kode]) => {
        for (let w = 1; w <= 5; w++) kolomMinggu.push(kode + '-' + w);
        grupBulan.push({ kode, nama, jml: 5 });
      });
    }
    // Header: baris bulan (colspan dinamis) + baris nomor minggu
    let html = '<table>\n<thead>\n<tr><th rowspan="2">Materi Pokok</th><th rowspan="2">JP</th>';
    grupBulan.forEach((g) => { html += '<th colspan="' + g.jml + '">' + g.nama + '</th>'; });
    html += '<th rowspan="2">Ket</th></tr>\n<tr>';
    kolomMinggu.forEach((k) => { html += '<th>' + k.split('-')[1] + '</th>'; });
    html += '</tr>\n</thead>\n<tbody>\n';
    // Baris jumlah per minggu (untuk LBR/PTS/PAS dan total)
    const jumlah = new Array(kolomMinggu.length).fill('');
    // Tandai kolom minggu tidak efektif lebih dulu (dipakai saat bangun sel)
    const kolomTanda = {};
    if (tanda && typeof tanda === 'object') {
      Object.entries(tanda).forEach(([k, v]) => {
        const nk = normKode(k);
        const i = nk ? kolomMinggu.indexOf(nk.kode) : -1;
        if (i >= 0) {
          const kode = String(v).toUpperCase().slice(0, 3);
          jumlah[i] = kode;
          kolomTanda[i] = kode === 'LBR' ? 'td-lbr' : kode === 'PTS' ? 'td-pts' : kode === 'PAS' ? 'td-pas' : 'td-tanda';
        }
      });
    }
    const clsKolom = (c) => kolomTanda[c] ? ' class="' + kolomTanda[c] + '"' : '';
    // Minggu libur/tidak efektif: tetap tampil dengan warna, tidak diisi materi
    const liburSet = new Set();
    // S4: minggu bertanda LBR ikut dilewati
    Object.entries(kolomTanda).forEach(([idx, cls]) => { if (cls === 'td-lbr') liburSet.add(Number(idx)); });
    const liburAlasan = {}; // idx -> alasan
    if (libur && typeof libur === 'object') {
      Object.entries(libur).forEach(([k, alasan]) => {
        const n = normKode(k);
        if (!n) return;
        const i = kolomMinggu.indexOf(n.kode);
        if (i >= 0) { liburSet.add(i); kolomTanda[i] = 'td-libur'; liburAlasan[i] = String(alasan || 'Tidak efektif'); jumlah[i] = ''; }
      });
    }
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Bin-packing: satu minggu bisa diisi beberapa materi (mis. 1 JP A + 1 JP B).
    // Setiap materi mengisi sisa kapasitas minggu berjalan sebelum pindah ke minggu berikut.
    let mingguAktif = 0, sisaKap = jpPerMinggu;
    // Simpan alokasi per materi: [{it, sel: {kolomIdx: jp}}]
    const alokasiSemua = daftar.map((it) => {
      const jp = Math.max(0, Number(it.jp) || 0);
      const sel = {};
      let sisa = jp;
      while (sisa > 0 && mingguAktif < kolomMinggu.length) {
        while (mingguAktif < kolomMinggu.length && liburSet.has(mingguAktif)) { mingguAktif++; sisaKap = jpPerMinggu; }
        if (mingguAktif >= kolomMinggu.length) break;
        const ambil = Math.min(sisaKap, sisa);
        sel[mingguAktif] = (sel[mingguAktif] || 0) + ambil;
        // S3: jangan timpa label tanda (PTS/LBR) dengan angka
        if (!kolomTanda[mingguAktif]) jumlah[mingguAktif] = String((Number(jumlah[mingguAktif]) || 0) + ambil);
        sisa -= ambil; sisaKap -= ambil;
        if (sisaKap <= 0) { mingguAktif++; sisaKap = jpPerMinggu; }
      }
      return { it, jp, sel };
    });
    alokasiSemua.forEach(({ it, jp, sel }) => {
      html += '<tr><td>' + esc(it.materi) + '</td><td>' + jp + '</td>';
      for (let c = 0; c < kolomMinggu.length; c++) {
        html += sel[c] ? '<td' + clsKolom(c) + '>' + sel[c] + '</td>' : '<td' + clsKolom(c) + '></td>';
      }
      html += '<td>' + esc(it.ket) + '</td></tr>\n';
    });
    const totalJP = daftar.reduce((a, it) => a + (Number(it.jp) || 0), 0);
    html += '<tr><td>Jumlah</td><td>' + totalJP + '</td>';
    jumlah.forEach((j, c) => { html += '<td' + clsKolom(c) + '>' + j + '</td>'; });
    html += '<td></td></tr>\n</tbody>\n</table>';
    // Legenda warna di bawah tabel
    const alasanUnik = [...new Set(Object.values(liburAlasan))];
    if (alasanUnik.length > 0) {
      html += '\n<div class="legenda-prosem"><span class="legenda-judul">Keterangan:</span> ';
      html += '<span class="legenda-item"><span class="legenda-warna warna-libur"></span> Minggu tidak efektif</span> ';
      html += '<span class="legenda-detail">(' + alasanUnik.map((a) => esc(a)).join('; ') + ')</span></div>';
    }
    return html;
  };

  const idxB = md.search(/##\s*B\.\s*Matriks/i);
  const idxC = md.search(/##\s*C\.\s*Pengesahan/i);
  const sebelumB = idxB >= 0 ? md.slice(0, idxB) : md;
  const sesudahC = idxC >= 0 ? md.slice(idxC) : '';
  let hasil = sebelumB + '## B. Matriks Program Semester\n';
  const tGanjil = bangunTabel(data.ganjil, BULAN_GANJIL, data.tanda_ganjil, data.struktur_bulan_ganjil || data.minggu_ganjil, data.libur_ganjil);
  const tGenap = bangunTabel(data.genap, BULAN_GENAP, data.tanda_genap, data.struktur_bulan_genap || data.minggu_genap, data.libur_genap);
  if (tGanjil) hasil += '\n### Semester Ganjil\n\n' + tGanjil + '\n';
  if (tGenap) hasil += '\n### Semester Genap\n\n' + tGenap + '\n';
  if (!tGanjil && !tGenap) return md; // gagal bangun — jangan rusak dokumen
  return hasil + '\n' + sesudahC;
}

// Pembangun Pengesahan: gantikan section pengesahan tulisan AI (sering berantakan,
// placeholder tidak terisi) dengan tabel baku yang dikenali parser frontend.
// Nama guru & tanggal diisi otomatis dari data; kolom KS dikosongkan untuk ttd basah.
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function tanggalID(d) {
  d = d || new Date();
  return d.getDate() + ' ' + BULAN_ID[d.getMonth()] + ' ' + d.getFullYear();
}
function bangunPengesahan(md, info) {
  if (!md || typeof md !== 'string') return md;
  const idx = md.search(/^#{1,4}\s+.*pengesahan.*$/im);
  if (idx < 0) return md;
  // Cari akhir section (heading ## berikutnya atau akhir dokumen)
  const setelah = md.slice(idx);
  const lines = setelah.split('\n');
  let endLine = lines.length;
  for (let i = 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { endLine = i; break; }
  }
  const sebelum = md.slice(0, idx);
  const sesudah = lines.slice(endLine).join('\n');
  const namaGuru = (info && info.nama ? String(info.nama).trim() : '').replace(/^\(+|\)+$/g, '') || '(................................)';
  const namaFmt = namaGuru.startsWith('(') ? namaGuru : '(' + namaGuru + ')';
  const g = '................................';
  const tabel =
    '## C. Pengesahan\n\n' +
    '| Mengetahui, | ' + tanggalID() + ' |\n' +
    '| Kepala Sekolah | Guru Mata Pelajaran |\n' +
    '| (' + g + ') | ' + namaFmt + ' |\n' +
    '| NIP. ' + g + ' | NIP. ' + g + ' |';
  return (sebelum.trimEnd() + '\n\n' + tabel + '\n\n' + sesudah.trimStart()).trim() + '\n';
}

async function generateDocInternal(docType = 'modul', info = {}, materi = '', sumber = '', rekomendasi = null, onTahap = () => {}, onTeks = () => {}) {
  // (Gate KENARI_API_KEY dihapus: ai() sudah melempar error yang benar bila
  // konteks kunci kosong, dan gate itu mematikan BYOK/key-admin saat env kosong.)
  if (docType === 'modul') {
    try {
      return await generateModulPipeline(info, materi, sumber, rekomendasi, onTahap, onTeks);
    } catch (e) {
      console.error('[modulajar] pipeline gagal, fallback ke single-shot:', e.message);
    }
  }
  const p = PROMPTS[docType];
  const system = docType === 'modul' ? LEGACY_MODUL : (typeof p === 'function' ? p(info) : p);
  if (!system) throw new Error('Jenis dokumen tidak dikenal: ' + docType);
  // Non-modul (atau fallback modul): bersihkan input santai guru dulu agar
  // dokumen tidak menggemakan instruksi mentah seperti "cari aja di internet".
  await onTahap('pahami');
  info = (await siapkanInfo(info)).info;
  await onTahap('susun');
  const userMsg = `Susun dokumen dengan data berikut:\n${IDENT(info)}\n- Materi Pokok/Topik: ${info.topik || '-'}\n- Alokasi Waktu: ${info.alokasi || '-'}\n- Model Pembelajaran: ${info.model || '-'}\n- Jumlah Soal PG: ${info.jmlPG || '-'} | Uraian: ${info.jmlUraian || '-'}\n\n${konteksSumber(materi, sumber)}`;
  let hasil = await ai(system, userMsg, 8000, 0.7, (d) => onTeks('susun', d));
  if (docType === 'prosem') hasil = bangunMatriksProsem(hasil, info);
  hasil = bangunPengesahan(hasil, info);
  return hasil;
}

async function rekomendasiAIInternal({ jenjang = '', fase = '', mapel = '', topik = '', prosem = [] }) {
  // Bila wizard dibuka "dari paket", rekomendasi HARUS selaras Prosem paket:
  // AI memilih KELOMPOK minggu berurutan (satu bab = beberapa pertemuan), bukan mengarang topik baru.
  const daftar = Array.isArray(prosem) ? prosem.slice(0, 30).filter((w) => w && w.materi) : [];
  if (daftar.length > 0) {
    const system = `Kamu asisten guru Indonesia. Diberikan daftar minggu Prosem (perencanaan semester) dari sebuah paket perangkat ajar Kurikulum Merdeka. Pilih SATU KELOMPOK minggu BERURUTAN (1 sampai 4 minggu) yang materinya membentuk satu bab/unit yang koheren untuk satu Modul Ajar — utamakan kelompok awal yang materinya fundamental sebagai pembuka bab.
Kembalikan JSON MURNI (tanpa markdown, tanpa teks lain) dengan struktur persis: {"mingguIxs": [<nomor index mulai 0 dari daftar di bawah, WAJIB berurutan>], "judul": "<nama bab/unit, mis. Bab 1: ...>", "model": "<salah satu dari: Problem Based Learning (PBL), Project Based Learning (PjBL), Discovery Learning, Inquiry Learning, Pembelajaran Kooperatif, Pembelajaran Langsung, Pembelajaran Berdiferensiasi, Contextual Teaching and Learning (CTL)>", "alokasi": "<jumlah pertemuan, mis. 3 pertemuan>", "tp": ["...", "...", "..."], "catatan": "..."}.
TP = 3 tujuan pembelajaran singkat format ABCD untuk keseluruhan bab, selaras dengan TP minggu-minggu terpilih bila tersedia. "catatan" berisi alasan singkat kenapa kelompok minggu itu dipilih.`;
    const user = `Jenjang: ${jenjang}\nFase: ${fase}\nMata Pelajaran: ${mapel}\n\nDaftar minggu Prosem:\n${daftar.map((w, i) => `${i}. Minggu ${String(w.minggu || (i + 1)).slice(0, 10)}: ${String(w.materi).slice(0, 300)}${w.alokasi ? ` (${String(w.alokasi).slice(0, 60)})` : ''}${w.tp ? `\n   TP: ${String(w.tp).slice(0, 400)}` : ''}`).join('\n')}`;
    const raw = await ai(system, user, 1500, 0.6);
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Format rekomendasi tidak valid.');
    const d = JSON.parse(m[0]);
    let ixs = Array.isArray(d.mingguIxs) ? d.mingguIxs : (Number.isInteger(d.mingguIx) ? [d.mingguIx] : []);
    ixs = [...new Set(ixs.map((x) => (Number.isInteger(x) ? x : parseInt(x, 10))).filter((x) => Number.isInteger(x) && x >= 0 && x < daftar.length))].sort((a, b) => a - b).slice(0, 4);
    if (ixs.length === 0) throw new Error('Format rekomendasi tidak valid.');
    d.mingguIxs = ixs;
    delete d.mingguIx;
    return d;
  }
  // (Gate KENARI_API_KEY dihapus dengan alasan yang sama seperti di generateDocInternal.)
  const system = `Kamu asisten guru Indonesia. Berdasarkan info pembelajaran, berikan rekomendasi penyusunan modul ajar dalam format JSON MURNI (tanpa markdown, tanpa teks lain) dengan struktur persis: {"judul": "...", "model": "salah satu dari: Problem Based Learning (PBL), Project Based Learning (PjBL), Discovery Learning, Inquiry Learning, Pembelajaran Kooperatif, Pembelajaran Langsung, Pembelajaran Berdiferensiasi, Contextual Teaching and Learning (CTL)", "alokasi": "...", "tp": ["...", "...", "..."], "catatan": "..."}. TP = 3 tujuan pembelajaran singkat format ABCD.`;
  const raw = await ai(system, `Jenjang: ${jenjang}\nFase: ${fase}\nMata Pelajaran: ${mapel}\nTopik: ${topik}`, 1500, 0.6);
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Format rekomendasi tidak valid.');
  return JSON.parse(m[0]);
}

// ================= JOB PAKET (generate di backend, tahan browser ditutup) =================
const JOB_KONKURENSI = 3;

const keyOf = (st) => (st.topik ? st.docType + ':' + st.topik : st.docType);

function rencanaJob(mode, topiks) {
  const langkah = [];
  const add = (docType, label, topik = null) =>
    langkah.push({ key: docType + (topik ? ':' + topik : ''), docType, label, topik, status: 'antri' });
  if (mode === 'lengkap' || mode === 'perencanaan') {
    add('cp', 'Capaian Pembelajaran');
    add('analisis_cp', 'Analisis CP');
    add('tp', 'Tujuan Pembelajaran');
    add('atp', 'ATP');
    add('minggu_efektif', 'Minggu Efektif');
    add('distribusi_jp', 'Distribusi Alokasi JP');
    add('prota', 'Prota');
    add('prosem', 'Prosem');
    add('kktp', 'KKTP');
  }
  if (mode === 'lengkap' || mode === 'pelaksanaan') {
    for (const t of topiks) add('modul', 'Modul Ajar', t);
    for (const t of topiks) add('asesmen', 'Asesmen & Rubrik', t);
    for (const t of topiks) add('lkpd', 'LKPD', t);
    for (const t of topiks) add('bahan_ajar', 'Bahan Ajar', t);
    add('soal', 'Paket Soal');
  }
  return langkah;
}

// Cari gambar relevan Wikimedia Commons untuk modul/LKPD
async function cariGambar(query, max = 3) {
  try {
    const params = new URLSearchParams({
      action: 'query', format: 'json', generator: 'search',
      gsrsearch: query + ' filetype:bitmap', gsrnamespace: '6', gsrlimit: '12',
      prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '900', origin: '*',
    });
    const r = await fetch('https://commons.wikimedia.org/w/api.php?' + params, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'ModulAjar/1.0' },
    });
    if (!r.ok) return [];
    const data = await r.json();
    const pages = Object.values(data.query?.pages || {});
    const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').trim().slice(0, 140);
    const out = [];
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl || (ii.width || 0) < 500) continue;
      const meta = ii.extmetadata || {};
      out.push({
        title: p.title.replace(/^File:/, '').replace(/\.[a-zA-Z0-9]+$/, '').replace(/_/g, ' ').slice(0, 90),
        thumbUrl: ii.thumburl, fullUrl: ii.url, width: ii.width, height: ii.height,
        artist: strip(meta.Artist?.value), license: strip(meta.LicenseShortName?.value) || 'CC',
        pageUrl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(p.title),
      });
      if (out.length >= max) break;
    }
    return out;
  } catch { return []; }
}

// Sisipkan gambar relevan langsung ke dalam markdown (tanpa persetujuan user).
// Gambar diletakkan sebelum "### 11. Bank Soal" agar menyatu dengan materi;
// jika heading tidak ketemu, ditempel di akhir dokumen.
// Format inline "![judul](fig:url)" sudah didukung DocPaper & export docx.
async function sisipkanGambarOtomatis(markdown, info, max = 3) {
  try {
    const query = [info.mapel, info.topik].filter(Boolean).join(' ');
    if (!query.trim()) return { markdown, images: [] };
    const images = await cariGambar(query, max);
    if (!images.length) return { markdown, images: [] };
    const blok = images.map((g) =>
      `\n\n![${g.title}](fig:${g.thumbUrl})\n*Sumber gambar: ${g.title} (${g.license})*`
    ).join('');
    const anchor = '\n### 11. Bank Soal';
    const md = markdown.includes(anchor)
      ? markdown.replace(anchor, blok + anchor)
      : markdown + blok;
    return { markdown: md, images };
  } catch {
    return { markdown, images: [] };
  }
}

async function sbGetJob(id) {
  const { data, error } = await sb.from('jobs').select('*').eq('id', id).single();
  if (error || !data) {
    const e = new Error('Job tidak ditemukan.');
    e.status = 404;
    throw e;
  }
  return data;
}
async function sbUpdateJob(id, patch) {
  patch.updated_at = new Date().toISOString();
  const { error } = await sb.from('jobs').update(patch).eq('id', id);
  if (error) throw new Error('Gagal update job: ' + error.message);
}
async function simpanDokumen(userId, docType, judul, markdown, meta, images = []) {
  const { data, error } = await sb.from('dokumen').insert({
    user_id: userId, doc_type: docType, judul, markdown, meta: meta || {}, images,
  }).select('id').single();
  if (error) throw new Error('Gagal menyimpan dokumen: ' + error.message);
  return data.id;
}
function serializeJob(j) {
  return {
    id: j.id, mode: j.mode, status: j.status,
    progress: j.progress || {}, hasil: j.hasil || [], error: j.error || null,
    createdAt: j.created_at, updatedAt: j.updated_at,
  };
}

const workerAktif = new Set();

// Dilempar saat worker mendeteksi job dibatalkan/gagal di tengah langkah:
// jangan simpan dokumen, jangan potong kuota, jangan timpa status di DB.
class HentiJob extends Error {}

async function jalankanJob(jobId) {
  if (!sb || workerAktif.has(jobId)) return;
  workerAktif.add(jobId); // sinkron sebelum await pertama: tutup race eksekusi ganda
  try {
    // Resolusi kunci efektif sekali di awal; konteks AsyncLocalStorage
    // membuat tiap job yang berjalan paralel memakai kuncinya sendiri.
    let kunciJob = null;
    try {
      const j0 = await sbGetJob(jobId);
      if (j0?.user_id) kunciJob = await resolveKunciEfektif(j0.user_id, { email: await emailOf(j0.user_id).catch(() => '') });
    } catch (e) {
      // Bila AI bawaan nonaktif & tanpa BYOK: gagalkan job dengan pesan jelas
      try { await sbUpdateJob(jobId, { status: 'gagal', error: e.message || String(e) }); } catch {}
      return;
    }
    await aiKeyCtx.run({ ...kunciJob, onAntre: null }, () => jalankanJobInti(jobId));
  } finally {
    workerAktif.delete(jobId);
  }
}
async function jalankanJobInti(jobId) {
  if (!sb) return;
  try {
    let job = await sbGetJob(jobId);
    if (job.status !== 'berjalan' && job.status !== 'antri') return;
    const userId = job.user_id;
    // Admin tidak dibatasi dan tidak dihitung kuotanya (ditentukan sekali di awal job)
    const adminJob = ADMIN_EMAILS.includes((await emailOf(userId) || '').toLowerCase());
    // Kuota hanya dipotong bila memakai AI bawaan: sumber 'umum'/'env'.
    // (Perbaikan: dulu !!aiKeyCtx.getStore() selalu truthy untuk semua sumber
    // sehingga kuota paket tidak pernah terpotong.)
    const bebasKuota = adminJob || aiKeyCtx.getStore()?.sumber === 'sendiri';
    // Kuota paket direservasi atomik di awal via POST /api/paket (flag di config);
    // job lama tanpa flag tetap memakai potongan per dokumen sebagai fallback.
    const cfg = job.config || {};
    const kuotaDireservasi = cfg.kuotaDireservasi || 0;
    const info0 = cfg.info || {};
    const uploads = cfg.uploads || {};
    const topiks = cfg.topiks || [];
    const langkah = job.progress?.langkah || rencanaJob(job.mode, topiks);
    const hasil = job.hasil || [];
    // Pulihkan markdown langkah yang sudah selesai (untuk resume)
    const md = {};
    for (const h of hasil) {
      if (h.dokumenId && h.key && !md[h.key]) {
        const { data } = await sb.from('dokumen').select('markdown').eq('id', h.dokumenId).single();
        if (data) md[h.key] = data.markdown;
      }
    }
    // Resume: langkah 'gagal' DAN 'jalan' yang basi dikembalikan ke 'antri'
    // ('jalan' basi = worker mati/restart di tengah langkah; dokumen 'ok' tidak diulang)
    for (const l of langkah) if (l.status === 'gagal' || l.status === 'jalan') l.status = 'antri';

    // Tulisan AI yang sedang berjalan (untuk ditampilkan realtime di frontend).
    // Diisi oleh kerjakan() via onTeks, dibaca updateProgress(). Last-write-wins
    // bila beberapa worker paralel sama-sama menulis.
    let liveAktif = null;

    // Draf otomatis: kolom opsional yang dikosongkan (acuan ATP/Prosem, materi)
    // disusun AI sekali di awal job agar langkah berikutnya tetap punya acuan.
    // Dipersist ke job.config.drafOtomatis agar resume tidak menyusun ulang.
    // Draf materi HANYA untuk modul/lkpd/soal, bukan untuk langkah perencanaan
    // (menghindari sirkular: materi yang disusun tanpa CP/ATP menjadi acuan CP/ATP).
    // Berjalan dalam konteks kunci AI job (aiKeyCtx), jadi pakai ai() langsung.
    const drafTersimpan = cfg.drafOtomatis || {};
    let drafAcuan = drafTersimpan.acuan || '';
    let drafMateri = drafTersimpan.materi || '';
    async function persistDraf() {
      try {
        await sbUpdateJob(jobId, { config: { ...cfg, drafOtomatis: { acuan: drafAcuan, materi: drafMateri } } });
      } catch { /* abaikan: draf tetap dipakai di memori */ }
    }
    if (job.mode === 'pelaksanaan' && !(uploads.acuan || '').trim() && !md['atp'] && !drafAcuan) {
      try {
        const { system, user, maxTokens } = promptDrafPaket('acuan', info0, topiks);
        drafAcuan = (await ai(system, user, maxTokens, 0.7)).trim();
        await persistDraf();
      } catch (e) { console.warn('[modulajar] draf acuan otomatis gagal:', e.message || e); }
    }
    if (drafAcuan) md['atp'] = drafAcuan;
    if (job.mode !== 'perencanaan' && !(cfg.materi || '').trim() && !drafMateri) {
      try {
        const { system, user, maxTokens } = promptDrafPaket('materi', info0, topiks);
        drafMateri = (await ai(system, user, maxTokens, 0.7)).trim();
        await persistDraf();
      } catch (e) { console.warn('[modulajar] draf materi otomatis gagal:', e.message || e); }
    }

    // Rekomendasi dibagikan antar pekerja paralel via satu promise yang sama
    // (guard boolean membuat pekerja kedua mendapat null tanpa menunggu).
    let rekPromise = null;
    function pastikanRekomendasi() {
      if (!rekPromise) {
        rekPromise = rekomendasiAIInternal({
          jenjang: info0.jenjang, fase: info0.fase, mapel: info0.mapel, topik: topiks[0] || '',
        }).catch(() => null);
      }
      return rekPromise;
    }

    function acuanUntuk(docType, topik) {
      const me = md['minggu_efektif'] ? `\n\n[DOKUMEN MINGGU EFEKTIF]\n${md['minggu_efektif']}` : '';
      switch (docType) {
        case 'cp': return uploads.cpResmi || '';
        case 'analisis_cp': return md['cp'] || uploads.cpResmi || '';
        case 'tp': return md['analisis_cp'] || md['cp'] || '';
        case 'atp': return md['tp'] || md['cp'] || '';
        case 'distribusi_jp': return (md['atp'] || '') + me;
        case 'prota': return (md['atp'] || '') + me;
        case 'prosem': return (md['prota'] || '') + me;
        case 'kktp': return md['atp'] || md['tp'] || '';
        case 'modul': return md['atp'] || uploads.acuan || '';
        case 'asesmen': return md['modul:' + topik] || '';
        case 'lkpd': return md['modul:' + topik] || '';
        case 'bahan_ajar': return md['modul:' + topik] || '';
        case 'soal': return md['atp'] || uploads.acuan || '';
        default: return '';
      }
    }

    async function updateProgress(fase) {
      // Hormati status terminal: jangan timpa 'dibatalkan'/'gagal'/'selesai'/
      // 'menunggu_review' kembali menjadi 'berjalan'. Kasus utama: user menekan
      // Batal di tengah langkah, atau worker paralel lain sudah menandai gagal.
      // Pekerja yang tertinggal juga tidak bisa menghidupkan job yang sudah mati.
      try {
        const cur = await sbGetJob(jobId);
        if (cur && !['antri', 'berjalan'].includes(cur.status)) return;
      } catch { /* lanjut: tulis seperti biasa */ }
      const selesai = langkah.filter((l) => l.status === 'ok').length;
      const jalan = langkah.find((l) => l.status === 'jalan');
      const progress = { total: langkah.length, selesai, fase: fase || (jalan ? jalan.label : ''), langkah };
      if (liveAktif) progress.live = liveAktif;
      // Pertahankan hitungan pemulihan otomatis agar sweeper tidak me-resume tanpa batas
      if (job.progress?.autoResume) progress.autoResume = job.progress.autoResume;
      await sbUpdateJob(jobId, { status: 'berjalan', progress, hasil });
    }

    async function kerjakan(step) {
      // Idempotensi resume: hasil langkah ini sudah tercatat (crash di antara
      // simpanDokumen dan persist status) → jangan kerjakan ulang.
      if (hasil.some((h) => h.key === step.key)) {
        step.status = 'ok';
        return;
      }
      step.status = 'jalan';
      await updateProgress();
      try {
        const info = { ...info0, topik: step.topik || topiks.join('; ') };
        let markdown;
        if (step.docType === 'minggu_efektif' && (uploads.mingguEfektif || '').trim()) {
          markdown = uploads.mingguEfektif.trim();
        } else {
          const infoStep = { ...info };
          let rek;
          if (step.docType === 'modul') {
            rek = await pastikanRekomendasi();
            if (!infoStep.model || infoStep.model === 'auto') infoStep.model = rek?.model || '';
            if (!infoStep.alokasi) infoStep.alokasi = rek?.alokasi || '';
          }
          // Live progress: subfase per tahap + akumulasi tulisan AI.
          // Tulis ke DB maksimal 1x per 2 detik agar tidak membanjiri Supabase.
          let teksBuf = '', subfaseBuf = '', lastWrite = 0;
          const tulisLive = async (force = false) => {
            const now = Date.now();
            if (!force && now - lastWrite < 2000) return;
            lastWrite = now;
            liveAktif = {
              key: step.key,
              label: step.label + (step.topik ? ' — ' + step.topik : ''),
              subfase: subfaseBuf,
              teks: teksBuf.slice(-3000),
            };
            await updateProgress();
          };
          const onTahap = async (key) => {
            subfaseBuf = key === 'susun' ? '' : (TAHAP_LABEL[key] || key);
            step.subfase = subfaseBuf;
            await tulisLive();
          };
          const onTeks = (key, delta) => {
            // Event khusus dari pipeline: bagian ditulis ulang (retry koreksi)
            if (key === 'teks-reset') { teksBuf = ''; return; }
            teksBuf += delta;
            tulisLive().catch(() => {});
          };
          // Draf materi otomatis HANYA untuk modul/lkpd/soal — langkah
          // perencanaan memakai materi milik user saja (atau kosong).
          const FASE_PERENCANAAN = ['cp', 'atp', 'minggu_efektif', 'prota', 'prosem', 'kktp'];
          const materiStep = FASE_PERENCANAAN.includes(step.docType) ? (cfg.materi || '') : (cfg.materi || drafMateri);
          try {
            markdown = await generateDocInternal(
              step.docType, infoStep, materiStep,
              acuanUntuk(step.docType, step.topik), step.docType === 'modul' ? rek : undefined,
              onTahap, onTeks,
            );
          } finally {
            liveAktif = null; // langkah selesai/gagal: bersihkan tampilan live
          }
        }
        // Cek pembatalan SETELAH AI selesai, SEBELUM menyimpan: user mungkin
        // menekan Batal selama generate berjalan. Lempar HentiJob agar dokumen
        // tidak disimpan, kuota tidak dipotong, dan status DB dihormati.
        if (!(await masihBerjalan())) throw new HentiJob('dibatalkan');
        // Gambar relevan langsung disisipkan ke naskah (tanpa persetujuan)
        let images = [];
        if (step.docType === 'modul' || step.docType === 'lkpd') {
          const r = await sisipkanGambarOtomatis(markdown, { ...info0, topik: step.topik });
          markdown = r.markdown;
          images = r.images;
        }
        const judul = extractTitle(markdown);
        const meta = { ...info0, topik: step.topik || topiks.join('; ') };
        const dokumenId = await simpanDokumen(userId, step.docType, judul, markdown, meta, images);
        hasil.push({ key: keyOf(step), docType: step.docType, topik: step.topik || null, dokumenId, judul });
        md[keyOf(step)] = markdown;
        step.status = 'ok';
        await updateProgress(); // persist hasil+status DULU, baru potong kuota
        // Fallback kuota untuk job lama tanpa reservasi di awal (config.kuotaDireservasi).
        // Job baru sudah direservasi penuh di POST /api/paket.
        if (!bebasKuota && !kuotaDireservasi) await tambahKuota(userId, 1);
      } catch (e) {
        if (e instanceof HentiJob) throw e; // bukan kegagalan: hormati status DB
        step.status = 'gagal';
        await updateProgress();
        throw new Error('Langkah ' + step.label + (step.topik ? ' (' + step.topik + ')' : '') + ' gagal: ' + (e.message || e));
      }
    }

    async function masihBerjalan() {
      const f = await sbGetJob(jobId);
      return f.status === 'berjalan';
    }

    const FASE1 = ['cp', 'atp', 'minggu_efektif', 'prota', 'prosem', 'kktp'];
    // Fase 1: perencanaan (sekuensial)
    let fase1Baru = 0;
    for (const step of langkah.filter((l) => FASE1.includes(l.docType) && l.status !== 'ok')) {
      if (!(await masihBerjalan())) return;
      await kerjakan(step);
      fase1Baru++;
    }
    // Jeda review setelah perencanaan HANYA bila guru memintanya lewat checkbox
    // "Jeda untuk review setelah perencanaan" di form (default mati: paket jalan terus satu klik).
    if (job.mode === 'lengkap' && fase1Baru > 0 && cfg.reviewJeda) {
      await sbUpdateJob(jobId, { status: 'menunggu_review' });
      return;
    }
    // Fase 2+3: modul & LKPD (paralel per fase)
    for (const tipe of ['modul', 'lkpd']) {
      const grup = langkah.filter((l) => l.docType === tipe && l.status !== 'ok');
      let i = 0;
      const pekerja = Array.from({ length: Math.min(JOB_KONKURENSI, grup.length) }, async () => {
        while (i < grup.length) {
          if (!(await masihBerjalan())) return;
          const idx = i++;
          await kerjakan(grup[idx]);
        }
      });
      await Promise.all(pekerja);
      if (!(await masihBerjalan())) return;
    }
    // Fase 4: paket soal
    for (const step of langkah.filter((l) => l.docType === 'soal' && l.status !== 'ok')) {
      if (!(await masihBerjalan())) return;
      await kerjakan(step);
    }
    await sbUpdateJob(jobId, { status: 'selesai', progress: { total: langkah.length, selesai: langkah.length, fase: '', langkah }, hasil });
  } catch (e) {
    // HentiJob = berhenti atas permintaan (dibatalkan) atau job sudah terminal:
    // JANGAN timpa status DB menjadi 'gagal'.
    if (!(e instanceof HentiJob)) {
      try { await sbUpdateJob(jobId, { status: 'gagal', error: e.message || String(e) }); }
      catch { /* abaikan */ }
    }
  }
}

function butuhSb(req, res) {
  if (!sb) { kirimGagal(res, 503, 'Supabase belum dikonfigurasi di server.'); return false; }
  return true;
}

// Respons error konsisten: {ok:false, error, code?}
function kirimGagal(res, status, error, code) {
  const body = { ok: false, error };
  if (code) body.code = code;
  return res.status(status).json(body);
}
// Pastikan nilai adalah objek polos (bukan array/null/string)
function objekAman(v) {
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}
// Kembalikan pesan error bila teks melebihi batas, atau null bila aman
function validasiPanjang(teks, maks, nama) {
  if (String(teks || '').length > maks) return nama + ' terlalu panjang (maks ' + maks + ' karakter).';
  return null;
}
// Validasi base URL provider AI (anti-SSRF): wajib https dan menolak
// hostname lokal/pribadi. Pengecekan berbasis string hostname saja — cukup
// untuk IP literal, tetapi TIDAK melindungi dari DNS rebinding (domain yang
// resolve ke IP privat); pengerasan penuh butuh resolve DNS + validasi IP
// ulang sebelum fetch.
// Mengembalikan null bila valid, atau pesan error (untuk 400) bila tidak.
function validasiBaseUrl(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  let u;
  try { u = new URL(s); } catch { return 'Base URL tidak valid. Contoh: https://api.openai.com/v1'; }
  if (u.protocol !== 'https:') return 'Base URL wajib memakai https.';
  if (u.username || u.password) return 'Base URL tidak boleh mengandung kredensial.';
  // hostname IPv6 dikembalikan dengan kurung (mis. "[::1]") — kupas dulu
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const privat =
    h === 'localhost' || h === '::1' || h === '0.0.0.0' || h.endsWith('.localhost') ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h);
  if (privat) return 'Base URL tidak boleh mengarah ke alamat lokal/pribadi.';
  return null;
}
// Rate limit in-memory per user per endpoint (per-proses: tidak dibagikan
// antar instance bila aplikasi di-scale horizontal).
// Mengembalikan true bila request diizinkan, false bila melebihi batas.
const rateBucket = new Map(); // key -> array timestamp (ms)
function cekRateLimit(userId, endpoint, maksPerJam) {
  const kini = Date.now();
  const batas = kini - 3600 * 1000;
  const key = userId + '|' + endpoint;
  let arr = rateBucket.get(key);
  if (!arr) { arr = []; rateBucket.set(key, arr); }
  while (arr.length && arr[0] <= batas) arr.shift();
  if (arr.length >= maksPerJam) return false;
  arr.push(kini);
  return true;
}
// Normalisasi + validasi daftar topik: harus list, cap 20 topik × 200 karakter.
// Mengembalikan { daftar } bila valid, atau { galat } bila tidak.
function validasiTopiks(topiksRaw) {
  if (topiksRaw !== undefined && !Array.isArray(topiksRaw)) return { galat: 'Daftar topik harus berupa list.' };
  const daftar = [...new Set((topiksRaw || []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 20);
  const panjang = daftar.find((t) => t.length > 200);
  if (panjang) return { galat: 'Topik terlalu panjang (maks 200 karakter): "' + panjang.slice(0, 60) + '".' };
  return { daftar };
}

app.post('/api/paket', requireAuth(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const { mode = 'lengkap', info: infoRaw = {}, materi = '', topiks: topiksRaw = [], uploads: uploadsRaw = {}, reviewJeda = false } = req.body || {};
    if (!['lengkap', 'perencanaan', 'pelaksanaan'].includes(mode))
      return kirimGagal(res, 400, 'Mode tidak dikenal.');
    const info = objekAman(infoRaw);
    const uploads = objekAman(uploadsRaw);
    if (!(info.mapel || '').trim())
      return kirimGagal(res, 400, 'Mata pelajaran wajib diisi.');
    const { daftar: daftarTopik, galat: galatTopik } = validasiTopiks(topiksRaw);
    if (galatTopik) return kirimGagal(res, 400, galatTopik);
    if ((mode === 'lengkap' || mode === 'pelaksanaan') && !daftarTopik.length)
      return kirimGagal(res, 400, 'Daftar topik kosong. Tambahkan minimal satu topik.');
    const errMateri = validasiPanjang(materi, 20000, 'Materi');
    if (errMateri) return kirimGagal(res, 400, errMateri);
    // Batas panjang kolom acuan agar prompt tiap langkah tidak membengkak
    for (const [k, label] of [['cpResmi', 'Teks CP resmi'], ['mingguEfektif', 'Dokumen minggu efektif'], ['acuan', 'Dokumen acuan']]) {
      const errU = validasiPanjang(uploads[k], 20000, label);
      if (errU) return kirimGagal(res, 400, errU);
    }
    const langkah = rencanaJob(mode, daftarTopik);
    // Reservasi kuota atomik SEBELUM job dibuat: cek + potong dalam satu
    // giliran antrean (tahan race double-submit). Worker tidak lagi memotong
    // per dokumen bila reservasi sudah dilakukan (flag kuotaDireservasi).
    // Kuota hanya dipotong bila memakai AI bawaan (bukan BYOK/admin).
    const kunciUser = await resolveKunciEfektif(req.user.id, req.user);
    let kuotaDireservasi = 0;
    if (potongKuota(kunciUser.sumber, req.user)) {
      const ok = await potongKuotaAtomik(req.user.id, langkah.length);
      if (!ok) {
        const cek = await kuotaInfo(req.user.id);
        return res.status(402).json({
          ok: false, code: 'kuota_habis',
          error: 'Kredit tidak cukup untuk paket ini. Kredit diperbarui setiap Minggu jam 15:00 WIB.',
          butuh: langkah.length, sisa: cek.sisa, batas: cek.batas, bonus: cek.bonus,
        });
      }
      kuotaDireservasi = langkah.length;
    }
    const { data, error } = await sb.from('jobs').insert({
      user_id: req.user.id, mode, status: 'antri',
      config: { info, materi: materi || '', topiks: daftarTopik, uploads, reviewJeda: !!reviewJeda, kuotaDireservasi },
      progress: { total: langkah.length, selesai: 0, fase: '', langkah }, hasil: [],
    }).select('id').single();
    if (error) throw new Error(error.message);
    // Rantai start: bila update status gagal, tandai job gagal agar tidak yatim
    sbUpdateJob(data.id, { status: 'berjalan' })
      .then(() => jalankanJob(data.id))
      .catch(async (e2) => {
        try { await sbUpdateJob(data.id, { status: 'gagal', error: 'Gagal memulai job: ' + (e2.message || e2) }); }
        catch { /* abaikan */ }
      });
    res.json({ ok: true, jobId: data.id });
  } catch (e) {
    kirimGagal(res, 500, e.message || String(e));
  }
}));

app.get('/api/paket', requireAuth(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const { data } = await sb.from('jobs')
      .select('id,mode,status,progress,created_at').eq('user_id', req.user.id)
      .order('created_at', { ascending: false }).limit(10);
    res.json({ ok: true, jobs: data || [] });
  } catch (e) {
    kirimGagal(res, 500, e.message || String(e));
  }
}));

app.get('/api/paket/:id', requireAuth(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const job = await sbGetJob(req.params.id);
    if (job.user_id !== req.user.id) return kirimGagal(res, 403, 'Akses ditolak.');
    res.json({ ok: true, job: serializeJob(job) });
  } catch (e) {
    kirimGagal(res, e.status || 500, e.message || String(e));
  }
}));

app.post('/api/paket/:id/lanjutkan', requireAuth(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const job = await sbGetJob(req.params.id);
    if (job.user_id !== req.user.id) return kirimGagal(res, 403, 'Akses ditolak.');
    // 'berjalan' diizinkan juga: idempoten (workerAktif mencegah eksekusi ganda),
    // berguna bila worker mati diam-diam tanpa menandai gagal
    if (!['menunggu_review', 'gagal', 'berjalan'].includes(job.status))
      return kirimGagal(res, 400, 'Job tidak dalam status bisa dilanjutkan.');
    await sbUpdateJob(job.id, { status: 'berjalan', error: null });
    jalankanJob(job.id);
    res.json({ ok: true });
  } catch (e) {
    kirimGagal(res, e.status || 500, e.message || String(e));
  }
}));

app.post('/api/paket/:id/batalkan', requireAuth(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const job = await sbGetJob(req.params.id);
    if (job.user_id !== req.user.id) return kirimGagal(res, 403, 'Akses ditolak.');
    await sbUpdateJob(job.id, { status: 'dibatalkan' });
    res.json({ ok: true });
  } catch (e) {
    kirimGagal(res, e.status || 500, e.message || String(e));
  }
}));

// ============ PEMULIHAN JOB ============
// Batas basi: updateProgress() menulis updated_at tiap ≤2 detik saat worker hidup
// (live write saat streaming) dan tiap ganti langkah. >30 menit tanpa update
// berarti worker mati tanpa sempat menandai gagal.
const STUCK_MENIT = 30;
const MAKS_AUTO_RESUME = 3;

async function pulihkanJobBasi() {
  if (!sb) return;
  try {
    const batas = new Date(Date.now() - STUCK_MENIT * 60000).toISOString();
    const { data, error } = await sb.from('jobs')
      .select('id,status,updated_at,progress')
      .in('status', ['berjalan', 'antri'])
      .lt('updated_at', batas);
    if (error) throw error;
    let dilanjutkan = 0, digagalkan = 0;
    for (const j of data || []) {
      if (workerAktif.has(j.id)) continue; // worker hidup di proses ini: jangan diganggu
      const autoN = j.progress?.autoResume || 0;
      if (autoN >= MAKS_AUTO_RESUME) {
        await sbUpdateJob(j.id, {
          status: 'gagal',
          error: 'Terhenti karena tidak ada kemajuan selama ' + STUCK_MENIT +
            ' menit. Tekan "Lanjutkan dari yang gagal" untuk mengulang langkah yang belum selesai.',
        });
        digagalkan++;
        continue;
      }
      const langkah = j.progress?.langkah || [];
      for (const l of langkah) if (l.status === 'jalan') l.status = 'antri';
      await sbUpdateJob(j.id, {
        status: 'berjalan', error: null,
        progress: { ...(j.progress || {}), langkah, autoResume: autoN + 1 },
      });
      jalankanJob(j.id); // idempoten: langkah 'ok' dilewati, 'antri' dikerjakan
      dilanjutkan++;
    }
    if (dilanjutkan || digagalkan)
      console.log('[modulajar] pulihkan job basi: ' + dilanjutkan + ' dilanjutkan, ' + digagalkan + ' ditandai gagal');
  } catch (e) {
    console.error('[modulajar] pulihkan job basi gagal:', e.message);
  }
}

// Saat server (re)start: semua job 'berjalan'/'antri' adalah yatim (worker mati
// bersama proses lama) → lanjutkan. workerAktif masih kosong sehingga aman
// dari eksekusi ganda.
(async () => {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('jobs').select('id').in('status', ['berjalan', 'antri']);
    if (error) throw error;
    for (const j of data || []) jalankanJob(j.id);
    if (data?.length) console.log('[modulajar] melanjutkan ' + data.length + ' job tertunda saat start');
  } catch (e) { console.error('[modulajar] resume job saat start gagal:', e.message); }
})();
// Sweeper berkala untuk worker yang mati tanpa crash (mis. promise menggantung)
setInterval(pulihkanJobBasi, 10 * 60 * 1000);

// ================= ROUTES =================
app.get('/api/config', (req, res) => {
  if (!SB_URL || !SB_ANON) return res.json({ ok: false, error: 'Supabase belum dikonfigurasi di server.' });
  res.json({ ok: true, supabaseUrl: SB_URL, supabaseAnonKey: SB_ANON, turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '' });
});

app.post('/api/generate-doc', requireAuth(async (req, res) => {
  try {
    const { docType = 'modul', info: infoRaw = {}, materi = '', sumber = '', rekomendasi = null } = req.body || {};
    const errValid = validasiGenerate({ docType, infoRaw, materi, sumber });
    if (errValid) return kirimGagal(res, 400, errValid);
    const info = objekAman(infoRaw);
    // Kuota hanya dipotong bila memakai AI bawaan (bukan BYOK/admin).
    // Reservasi atomik di awal; bila generate gagal, reservasi dikembalikan.
    const kunciUser = await resolveKunciEfektif(req.user.id, req.user);
    const kunciSendiri = kunciUser.sumber === 'sendiri';
    const potong = potongKuota(kunciUser.sumber, req.user);
    let direservasi = false;
    if (potong) {
      direservasi = await potongKuotaAtomik(req.user.id, 1);
      if (!direservasi) {
        const cek = await kuotaInfo(req.user.id);
        return res.status(402).json({
          ok: false, code: 'kuota_habis',
          error: 'Kredit mingguan habis. Kredit diperbarui setiap Minggu jam 15:00 WIB.',
          butuh: 1, sisa: cek.sisa, batas: cek.batas, bonus: cek.bonus,
        });
      }
    }
    let markdown;
    try {
      markdown = await aiKeyCtx.run(kunciUser, () =>
        generateDocInternal(docType, info, materi, sumber, rekomendasi));
    } catch (e) {
      if (direservasi) await tambahKuota(req.user.id, -1); // kembalikan reservasi
      throw e;
    }
    res.json({ ok: true, markdown, kunciSendiri });
  } catch (e) {
    kirimGagal(res, 500, 'Kesalahan server: ' + (e.message || e));
  }
}));

// Nama dokumen untuk label tahap stream
const NAMA_DOKUMEN = {
  modul: 'Modul Ajar', lkpd: 'LKPD', soal: 'Paket Soal', kktp: 'KKTP',
  cp: 'CP', analisis_cp: 'Analisis CP', tp: 'Tujuan Pembelajaran',
  atp: 'ATP', prota: 'Prota', prosem: 'Prosem', minggu_efektif: 'Minggu Efektif',
  distribusi_jp: 'Distribusi Alokasi JP', asesmen: 'Asesmen & Rubrik', bahan_ajar: 'Bahan Ajar',
};
// Validasi umum payload generate dokumen tunggal
function validasiGenerate({ docType, infoRaw, materi, sumber }) {
  if (!Object.keys(NAMA_DOKUMEN).includes(docType)) return 'Jenis dokumen tidak dikenal.';
  if (infoRaw !== undefined && (typeof infoRaw !== 'object' || infoRaw === null || Array.isArray(infoRaw)))
    return 'Data info tidak valid.';
  // Alokasi minimum 10 menit agar budgetKegiatan tidak negatif/nol.
  const infoAman = objekAman(infoRaw);
  const daftar = Array.isArray(infoAman.pertemuanList)
    ? infoAman.pertemuanList.filter((p) => p && String(p.materi || '').trim())
    : [];
  if (daftar.length > 1) {
    for (let i = 0; i < daftar.length; i++) {
      const tm = parseAlokasi(daftar[i].alokasi).totalMenit;
      if (!Number.isFinite(tm) || tm < 10)
        return `Alokasi pertemuan ke-${i + 1} minimal 10 menit (contoh: "2 x 40 menit").`;
    }
    if (daftar.length > 12) return 'Maksimal 12 pertemuan per modul.';
    return validasiPanjang(materi, 20000, 'Materi') || validasiPanjang(sumber, 20000, 'Sumber acuan');
  }
  const alokasi = infoAman.alokasi;
  if (alokasi) {
    const totalMenit = parseAlokasi(alokasi).totalMenit;
    if (!Number.isFinite(totalMenit) || totalMenit < 10)
      return 'Alokasi waktu minimal 10 menit (contoh: "2 x 40 menit").';
  }
  return validasiPanjang(materi, 20000, 'Materi') || validasiPanjang(sumber, 20000, 'Sumber acuan');
}

const TAHAP_LABEL = {
  pahami: 'Memahami maksud pengisian formulir',
  'pilih-model': 'Memilih model pembelajaran yang cocok',
  fondasi: 'Menyusun fondasi: CP, TP, dan dimensi lulusan',
  kegiatan: 'Menyusun kegiatan inti mengikuti sintaks model',
  koreksi: 'Mengoreksi alokasi waktu',
  asesmen: 'Menyusun asesmen dan pelengkap',
  materi: 'Menyusun materi, bank soal, dan rubrik',
  rakit: 'Merakit dokumen final',
};

// Generate dokumen tunggal dengan progress live via Server-Sent Events.
// Kuota dicek DULU (402 JSON biasa bila habis), lalu stream event:
//   data: {"tipe":"tahap","key":"...","label":"..."}
//   data: {"tipe":"selesai","markdown":"..."} | data: {"tipe":"gagal","error":"..."}
app.post('/api/generate-doc/stream', requireAuth(async (req, res) => {
  try {
    const { docType = 'modul', info: infoRaw = {}, materi = '', sumber = '', rekomendasi = null } = req.body || {};
    const errValid = validasiGenerate({ docType, infoRaw, materi, sumber });
    if (errValid) return kirimGagal(res, 400, errValid);
    const info = objekAman(infoRaw);
    const kunciUser = await resolveKunciEfektif(req.user.id, req.user);
    const kunciSendiri = kunciUser.sumber === 'sendiri';
    let direservasi = false;
    if (potongKuota(kunciUser.sumber, req.user)) {
      direservasi = await potongKuotaAtomik(req.user.id, 1);
      if (!direservasi) {
        const cek = await kuotaInfo(req.user.id);
        return res.status(402).json({
          ok: false, code: 'kuota_habis',
          error: 'Kredit mingguan habis. Kredit diperbarui setiap Minggu jam 15:00 WIB.',
          butuh: 1, sisa: cek.sisa, batas: cek.batas, bonus: cek.bonus,
        });
      }
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // penting: nginx tidak boleh buffer, kalau tidak "live" gagal
    });
    // Bila klien terputus (refresh/tutup tab) sebelum selesai, kembalikan reservasi kuota.
    let selesaiOk = false;
    req.on('close', () => {
      if (!selesaiOk && direservasi) {
        tambahKuota(req.user.id, -1).catch(() => {});
      }
    });
    const kirim = (obj) => {
      if (!res.writableEnded) res.write('data: ' + JSON.stringify(obj) + '\n\n');
    };
    const namaDoc = NAMA_DOKUMEN[docType] || 'dokumen';
    const onTahap = async (key) => {
      if (String(key).startsWith('antre:')) {
        const pos = String(key).slice(6);
        kirim({ tipe: 'tahap', key: 'antre', label: 'Antrean #' + pos + ' — menunggu giliran AI…' });
        return;
      }
      kirim({ tipe: 'tahap', key, label: key === 'susun' ? 'Menyusun ' + namaDoc : (TAHAP_LABEL[key] || key) });
    };
    // Teruskan tulisan AI apa adanya agar user bisa melihat prosesnya realtime
    const onTeks = (key, delta) => {
      // Event khusus: AI menulis ulang bagian (retry koreksi) — frontend
      // harus me-reset tampilan bagian itu, bukan meng-append.
      if (key === 'teks-reset') { kirim({ tipe: 'teks-reset', key: delta }); return; }
      kirim({ tipe: 'teks', key, delta });
    };
    try {
      let markdown = await aiKeyCtx.run({ ...kunciUser, onAntre: (pos) => onTahap('antre:' + pos) }, () =>
        generateDocInternal(docType, info, materi, sumber, rekomendasi, onTahap, onTeks));
      // Gambar relevan langsung disisipkan (modul/LKPD), tanpa persetujuan
      let images = [];
      if (docType === 'modul' || docType === 'lkpd') {
        const r = await sisipkanGambarOtomatis(markdown, info, 3);
        markdown = r.markdown;
        images = r.images;
      }
      kirim({ tipe: 'selesai', markdown, images, kunciSendiri });
      selesaiOk = true;
    } catch (e) {
      if (direservasi) await tambahKuota(req.user.id, -1); // kembalikan reservasi
      kirim({ tipe: 'gagal', error: e.message || String(e) });
    }
    res.end();
  } catch (e) {
    // Bila header SSE sudah terkirim, status tidak bisa diubah: cukup akhiri stream
    if (!res.headersSent) kirimGagal(res, 500, 'Kesalahan server: ' + (e.message || e));
    else res.end();
  }
}));

// Status kuota harian user yang login
app.get('/api/kuota', requireAuth(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const admin = isAdmin(req.user);
    const info = await kuotaInfo(req.user.id);
    res.json({
      ok: true, admin,
      batas: admin ? null : info.batas,
      dipakai: admin ? 0 : info.dipakai,
      bonus: admin ? 0 : info.bonus,
      sisa: admin ? null : info.sisa,
      resetInfo: 'Kredit diperbarui setiap Minggu jam 15:00 WIB.',
      periode: info.periode,
    });
  } catch (e) {
    kirimGagal(res, 500, e.message || String(e));
  }
}));

// ============ BYOK: kunci AI milik user ============
// Base URL adalah root API gaya OpenAI (tanpa /chat/completions), mis. https://api.openai.com/v1
// Status AI untuk user: apakah AI bawaan aktif + pilihan user saat ini
app.get('/api/ai-status', requireAuth(async (req, res) => {
  try {
    const cfg = await getPengaturanAI();
    const k = await resolveKunciAI(req.user.id);
    res.json({
      ok: true,
      bawaanAktif: cfg.bawaanAktif && !!cfg.umum.apiKey,
      pakaiBawaan: k ? k.pakaiBawaan !== false : true,
      adaByok: !!(k && !k.kosong),
      isAdmin: isAdmin(req.user),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

app.get('/api/ai-config', requireAuth(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const k = await resolveKunciAI(req.user.id);
    res.json({
      ok: true, ada: !!(k && !k.kosong),
      baseUrl: k?.baseUrl || '', model: k?.model || '',
      keyMasked: (k && !k.kosong) ? maskKey(k.apiKey) : '',
      pakaiBawaan: k ? k.pakaiBawaan !== false : true,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

// Pilihan user: pakai AI bawaan web atau kunci sendiri
app.post('/api/ai-config/pilihan', requireAuth(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const pakaiBawaan = req.body?.pakaiBawaan !== false;
    const k = await resolveKunciAI(req.user.id);
    if (k && !k.kosong) {
      const { error } = await sb.from('kunci_ai').update({ pakai_bawaan: pakaiBawaan }).eq('user_id', req.user.id);
      if (error) return res.status(500).json({ ok: false, error: error.message });
    } else {
      // Belum ada BYOK: simpan preferensi saja
      const { error } = await sb.from('kunci_ai').upsert({
        user_id: req.user.id, base_url: '', api_key: '', model: null,
        pakai_bawaan: pakaiBawaan, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error && !/null|not-null|check/i.test(error.message || '')) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    }
    res.json({ ok: true, pakaiBawaan });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

app.post('/api/ai-config', requireAuth(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const baseUrl = String(req.body?.baseUrl || '').trim().replace(/\/+$/, '');
    const apiKey = String(req.body?.apiKey || '').trim();
    const model = String(req.body?.model || '').trim();
    const errUrl = validasiBaseUrl(baseUrl);
    if (errUrl)
      return res.status(400).json({ ok: false, error: errUrl });
    if (apiKey.length < 8)
      return res.status(400).json({ ok: false, error: 'API key terlalu pendek (minimal 8 karakter).' });
    const { error } = await sb.from('kunci_ai').upsert({
      user_id: req.user.id, base_url: baseUrl, api_key: apiKey,
      model: model || null, pakai_bawaan: false, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) {
      const tabelHilang = /kunci_ai/i.test(error.message || '');
      return res.status(tabelHilang ? 503 : 500).json({
        ok: false,
        error: tabelHilang
          ? 'Fitur kunci AI belum dikonfigurasi di database.'
          : error.message,
      });
    }
    res.json({ ok: true, keyMasked: maskKey(apiKey) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

app.delete('/api/ai-config', requireAuth(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    await sb.from('kunci_ai').delete().eq('user_id', req.user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

// ============ REFERRAL: +3 kredit per klaim ============
// Kode 8 karakter (tanpa huruf/angka yang ambigu). Satu user punya satu kode selamanya.
function kodeAcak() {
  const abjad = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += abjad[b[i] % abjad.length];
  return s;
}
async function buatKodeReferal(userId) {
  for (let i = 0; i < 5; i++) {
    const kode = kodeAcak();
    const { error } = await sb.from('referal').insert({ kode, pemilik_id: userId });
    if (!error) return kode;
    if (!/duplicate|unique/i.test(error.message || '')) throw error;
  }
  throw new Error('Gagal membuat kode referral.');
}
const MAKS_KLAIM_WINDOW = 5;

// Skema klaim referral baru memakai tabel klaim_referal
// (id, kode, pemilik_id, oleh_id, created_at, unique(kode, oleh_id)).
// Bila tabel belum dibuat (42P01), fallback ke perilaku lama single-claim.
// Hasil pengecekan di-cache; negatif di-cek ulang tiap 60 detik agar proses
// yang sudah jalan otomatis memakai tabel baru setelah SQL dijalankan.
let klaimTabelAda = null, klaimTabelCekAt = 0;
async function adaTabelKlaim() {
  const kini = Date.now();
  if (klaimTabelAda === true) return true;
  if (klaimTabelAda === false && kini - klaimTabelCekAt < 60000) return false;
  klaimTabelCekAt = kini;
  try {
    const { error } = await sb.from('klaim_referal').select('id', { head: true }).limit(1);
    klaimTabelAda = !error || String(error.code || '') !== '42P01';
  } catch (e) {
    klaimTabelAda = !String(e?.code || '').includes('42P01');
  }
  return klaimTabelAda;
}

// Jumlah klaim milik pemilik dalam periode mingguan berjalan (reset Minggu 15:00 WIB,
// selaras dengan kuota mingguan).
async function hitungKlaimWindow(pemilikId) {
  const r = await sb.from('klaim_referal')
    .select('id', { head: true, count: 'exact' })
    .eq('pemilik_id', pemilikId).gte('created_at', windowStart() + 'T15:00:00+07:00');
  if (r.error) throw r.error;
  return r.count ?? 0;
}

// Klaim skema baru, diserialkan agar cek-duplikat + cek-batas + insert atomik.
let antriReferal = Promise.resolve();
function klaimReferalBaru(kode, pemilikId, olehId) {
  const giliran = antriReferal.then(() => klaimReferalBaruInner(kode, pemilikId, olehId));
  antriReferal = giliran.catch(() => {}); // rantai tetap hidup walau satu klaim gagal
  return giliran;
}
async function klaimReferalBaruInner(kode, pemilikId, olehId) {
  const { data: dupe } = await sb.from('klaim_referal')
    .select('id').eq('kode', kode).eq('oleh_id', olehId).limit(1);
  if (dupe?.length)
    return { ok: false, status: 409, code: 'sudah_dipakai', error: 'Kode ini sudah kamu pakai.' };
  const jumlah = await hitungKlaimWindow(pemilikId);
  if (jumlah >= MAKS_KLAIM_WINDOW)
    return { ok: false, status: 429, code: 'batas_klaim', error: 'Batas klaim periode ini tercapai.' };
  const { error } = await sb.from('klaim_referal')
    .insert({ kode, pemilik_id: pemilikId, oleh_id: olehId });
  if (error) {
    if (String(error.code) === '23505') // balapan insert: unique(kode, oleh_id)
      return { ok: false, status: 409, code: 'sudah_dipakai', error: 'Kode ini sudah kamu pakai.' };
    throw error;
  }
  await tambahBonus(pemilikId, 3);
  await tambahBonus(olehId, 3); // yang memakai kode juga dapat +3
  return { ok: true };
}

app.get('/api/referal', requireAuth(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const uid = req.user.id;
    let kode = null;
    try {
      const { data } = await sb.from('referal').select('kode').eq('pemilik_id', uid).limit(1);
      kode = data?.[0]?.kode || null;
      if (!kode) kode = await buatKodeReferal(uid);
    } catch {
      return res.status(503).json({ ok: false, error: 'Fitur referral belum dikonfigurasi di database.' });
    }
    const ws = windowStart();
    let klaimPeriodeIni = 0, bonusPeriodeIni = 0;
    try {
      if (await adaTabelKlaim()) {
        klaimPeriodeIni = await hitungKlaimWindow(uid);
      } else {
        // Fallback skema lama: satu kode satu klaim selamanya
        const { data: k } = await sb.from('referal')
          .select('id').eq('pemilik_id', uid).not('dipakai_oleh_id', 'is', null);
        klaimPeriodeIni = k?.length || 0;
      }
      const { data: b } = await sb.from('bonus_kuota')
        .select('bonus').eq('user_id', uid).eq('window_start', ws).single();
      bonusPeriodeIni = b?.bonus || 0;
    } catch { /* abaikan */ }
    res.json({
      ok: true, kode,
      link: 'https://modulajar.alfaruqasri.my.id/?ref=' + kode,
      bonusPeriodeIni, klaimPeriodeIni, maksKlaim: MAKS_KLAIM_WINDOW,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

app.post('/api/referal/klaim', requireAuth(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const uid = req.user.id;
    const kode = String(req.body?.kode || '').trim().toUpperCase();
    if (!kode) return res.status(400).json({ ok: false, error: 'Kode referral wajib diisi.' });
    let baris;
    try {
      const r2 = await sb.from('referal').select('id, pemilik_id, dipakai_oleh_id').eq('kode', kode).single();
      baris = r2.data;
    } catch {
      return res.status(503).json({ ok: false, error: 'Fitur referral belum dikonfigurasi di database.' });
    }
    if (!baris)
      return res.status(404).json({ ok: false, code: 'kode_tidak_dikenal', error: 'Kode referral tidak dikenal.' });
    if (baris.pemilik_id === uid)
      return res.status(400).json({ ok: false, code: 'kode_sendiri', error: 'Tidak bisa memakai kode referral milik sendiri.' });
    if (await adaTabelKlaim()) {
      // Skema baru: tiap teman bisa klaim; maks 5 klaim per minggu per pemilik kode
      const hasil = await klaimReferalBaru(kode, baris.pemilik_id, uid);
      if (!hasil.ok) return res.status(hasil.status).json({ ok: false, code: hasil.code, error: hasil.error });
      return res.json({ ok: true, bonusDitambah: 3 });
    }
    // Fallback skema lama (tabel klaim_referal belum ada): satu kode hanya
    // bisa diklaim satu orang, dan tiap user hanya bisa klaim sekali, selamanya.
    const r1 = await sb.from('referal').select('id').eq('dipakai_oleh_id', uid).limit(1);
    if (r1.data?.length)
      return res.status(400).json({ ok: false, code: 'sudah_pernah', error: 'Kamu sudah pernah memakai kode referral.' });
    if (baris.dipakai_oleh_id)
      return res.status(400).json({ ok: false, code: 'kode_terpakai', error: 'Kode ini sudah dipakai.' });
    // Tandai dipakai (kondisional: hanya bila masih kosong) lalu verifikasi pemenangnya
    await sb.from('referal').update({ dipakai_oleh_id: uid }).eq('id', baris.id).is('dipakai_oleh_id', null);
    const { data: cek } = await sb.from('referal').select('dipakai_oleh_id').eq('id', baris.id).single();
    if (cek?.dipakai_oleh_id !== uid)
      return res.status(409).json({ ok: false, code: 'kode_terpakai', error: 'Kode ini sudah dipakai.' });
    await tambahBonus(baris.pemilik_id, 3);
    await tambahBonus(uid, 3); // yang memakai kode juga dapat +3
    res.json({ ok: true, bonusDitambah: 3 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

// ============ MASUKAN (saran user login & pesan kontak pengunjung) ============
// Rate-limit sederhana di memori: maks 5 kiriman per hari per user/IP
const batasMasukan = new Map(); // kunci -> { hari, hitung }
function bolehKirimMasukan(kunci) {
  const hari = new Date().toISOString().slice(0, 10);
  if (batasMasukan.size > 5000) {
    for (const [k, v] of batasMasukan) if (v.hari !== hari) batasMasukan.delete(k);
  }
  const s = batasMasukan.get(kunci);
  if (!s || s.hari !== hari) { batasMasukan.set(kunci, { hari, hitung: 1 }); return true; }
  if (s.hitung >= 5) return false;
  s.hitung += 1;
  return true;
}

// ---------- Verifikasi Cloudflare Turnstile (captcha login) ----------
// Frontend mengirim token dari widget; server memverifikasi ke Cloudflare.
// Butuh TURNSTILE_SECRET di .env. Tanpa itu endpoint menolak (captcha nonaktif).
app.post('/api/verifikasi-captcha', async (req, res) => {
  try {
    const secret = process.env.TURNSTILE_SECRET || '';
    if (!secret) return res.status(503).json({ ok: false, error: 'Captcha belum dikonfigurasi di server.' });
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ ok: false, error: 'Token captcha kosong.' });
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      // remoteip membantu Cloudflare menilai risiko token (opsional tapi dianjurkan)
      body: new URLSearchParams({ secret, response: token, remoteip: req.socket?.remoteAddress || '' }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json().catch(() => ({}));
    if (data.success) return res.json({ ok: true });
    return res.status(403).json({ ok: false, error: 'Verifikasi captcha gagal. Coba lagi.' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Tidak bisa memverifikasi captcha saat ini.' });
  }
});

app.post('/api/masukan', async (req, res) => {
  try {
    const { jenis, nama = '', email = '', pesan = '' } = req.body || {};
    if (!['saran', 'kontak'].includes(jenis)) {
      return res.status(400).json({ ok: false, error: 'Jenis masukan tidak dikenal.' });
    }
    let userId = null;
    let namaAkhir = String(nama).slice(0, 100).trim();
    let emailAkhir = String(email).trim().slice(0, 120);
    if (jenis === 'saran') {
      const user = await authUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Perlu login untuk mengirim saran.' });
      userId = user.id;
      if (!namaAkhir) namaAkhir = String(user.user_metadata?.full_name || '').slice(0, 100);
      if (!emailAkhir) emailAkhir = user.email || '';
    }
    const teks = String(pesan).trim();
    if (teks.length < 10) return res.status(400).json({ ok: false, error: 'Pesan minimal 10 karakter.' });
    if (teks.length > 2000) return res.status(400).json({ ok: false, error: 'Pesan maksimal 2000 karakter.' });
    if (emailAkhir && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAkhir)) {
      return res.status(400).json({ ok: false, error: 'Alamat email tidak valid.' });
    }
    // Kunci rate-limit: gabungan XFF-pertama + remoteAddress socket. XFF saja
    // tidak bisa dipercaya buta (mudah dipalsukan); remoteAddress saja bisa
    // berubah di balik proxy. Gabungan keduanya paling stabil untuk setup ini.
    const xffPertama = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const remoteAddr = req.socket?.remoteAddress || '';
    const ip = [xffPertama, remoteAddr].filter(Boolean).join('|') || 'anon';
    const kunci = userId ? 'u:' + userId : 'ip:' + ip;
    if (!bolehKirimMasukan(kunci)) {
      return res.status(429).json({ ok: false, error: 'Terlalu sering mengirim. Coba lagi besok.', code: 'rate_limited' });
    }
    if (!sb) return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
    const { error } = await sb.from('masukan').insert({
      user_id: userId, jenis,
      nama: namaAkhir || null, email: emailAkhir || null, pesan: teks,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// ============ ADMIN ============
function requireAdmin(handler) {
  return requireAuth(async (req, res) => {
    if (!isAdmin(req.user)) return res.status(403).json({ ok: false, error: 'Akses ditolak.' });
    return handler(req, res);
  });
}

// Helper paginasi: ?page=1&per_page=20 -> { page, perPage, offset }
function paginasi(req, defPer, maxPer) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = Math.min(maxPer || 100, Math.max(1, parseInt(req.query.per_page, 10) || defPer || 20));
  return { page, perPage, offset: (page - 1) * perPage };
}

// ============ ADMIN: Pengaturan AI global ============
// GET: baca konfigurasi (key dimask, kecuali 4 karakter terakhir)
app.get('/api/admin/pengaturan-ai', requireAdmin(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const cfg = await getPengaturanAI();
    res.json({
      ok: true,
      bawaanAktif: cfg.bawaanAktif,
      umum: { baseUrl: cfg.umum.baseUrl, model: cfg.umum.model, keyMasked: cfg.umum.apiKey ? maskKey(cfg.umum.apiKey) : '' },
      admin: { baseUrl: cfg.admin.baseUrl, model: cfg.admin.model, keyMasked: cfg.admin.apiKey ? maskKey(cfg.admin.apiKey) : '' },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

// POST: simpan konfigurasi. Hanya field yang dikirim yang diubah;
// kirim apiKey kosong = tidak mengubah key yang sudah tersimpan.
app.post('/api/admin/pengaturan-ai', requireAdmin(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const b = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (typeof b.bawaanAktif === 'boolean') patch.bawaan_aktif = b.bawaanAktif;
    const str = (v) => String(v || '').trim();
    if (b.umum) {
      if (b.umum.baseUrl !== undefined) {
        const errUrl = validasiBaseUrl(b.umum.baseUrl);
        if (errUrl) return res.status(400).json({ ok: false, error: 'Base URL umum: ' + errUrl });
        patch.umum_base_url = str(b.umum.baseUrl).replace(/\/+$/, '');
      }
      if (str(b.umum.apiKey)) patch.umum_api_key = str(b.umum.apiKey);
      if (b.umum.model !== undefined) patch.umum_model = str(b.umum.model) || 'agnes-3-0-flash:free';
    }
    if (b.admin) {
      if (b.admin.baseUrl !== undefined) {
        const errUrl = validasiBaseUrl(b.admin.baseUrl);
        if (errUrl) return res.status(400).json({ ok: false, error: 'Base URL admin: ' + errUrl });
        patch.admin_base_url = str(b.admin.baseUrl).replace(/\/+$/, '');
      }
      if (str(b.admin.apiKey)) patch.admin_api_key = str(b.admin.apiKey);
      if (b.admin.model !== undefined) patch.admin_model = str(b.admin.model) || 'agnes-3-0-flash:free';
    }
    const { error } = await sb.from('pengaturan_ai').upsert({ id: 1, ...patch }, { onConflict: 'id' });
    if (error) {
      const tabelHilang = /pengaturan_ai/i.test(error.message || '');
      return res.status(tabelHilang ? 503 : 500).json({
        ok: false,
        error: tabelHilang ? 'Tabel pengaturan_ai belum ada. Jalankan supabase-bundle.sql terbaru di Supabase Dashboard.' : error.message,
      });
    }
    resetCachePengaturanAI();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

// ============ ADMIN: Uji koneksi & daftar model provider ============
// Uji koneksi: kirim prompt mini ke provider dengan kredensial dari form (belum harus tersimpan).
app.post('/api/admin/ai-uji', requireAdmin(async (req, res) => {
  try {
    const baseUrl = String(req.body?.baseUrl || '').trim().replace(/\/+$/, '');
    const apiKey = String(req.body?.apiKey || '').trim();
    const model = String(req.body?.model || '').trim() || MODEL;
    const errUrlUji = validasiBaseUrl(baseUrl);
    if (errUrlUji) return res.status(400).json({ ok: false, error: errUrlUji });
    if (apiKey.length < 8) return res.status(400).json({ ok: false, error: 'API key terlalu pendek.' });
    const t0 = Date.now();
    const r = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model, max_tokens: 5, temperature: 0,
        messages: [{ role: 'user', content: 'Balas hanya dengan kata: OK' }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return res.status(200).json({ ok: false, error: `Provider menolak (HTTP ${r.status}). ${txt.slice(0, 160)}` });
    }
    const d = await r.json().catch(() => ({}));
    const balasan = d?.choices?.[0]?.message?.content?.trim() || '';
    const modelAsli = d?.model || '';
    res.json({ ok: true, latencyMs: ms, balasan: balasan.slice(0, 60), modelAsli });
  } catch (e) {
    res.status(200).json({ ok: false, error: 'Tidak bisa menghubungi provider: ' + (e.message || e) });
  }
}));

// Muat daftar model dari provider (GET /v1/models gaya OpenAI).
app.post('/api/admin/ai-model', requireAdmin(async (req, res) => {
  try {
    const baseUrl = String(req.body?.baseUrl || '').trim().replace(/\/+$/, '');
    const apiKey = String(req.body?.apiKey || '').trim();
    const errUrlModel = validasiBaseUrl(baseUrl);
    if (errUrlModel) return res.status(400).json({ ok: false, error: errUrlModel });
    if (apiKey.length < 8) return res.status(400).json({ ok: false, error: 'API key terlalu pendek.' });
    const r = await fetch(baseUrl + '/models', {
      headers: { 'Authorization': 'Bearer ' + apiKey },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: `Provider menolak (HTTP ${r.status}).` });
    const d = await r.json().catch(() => ({}));
    const arr = Array.isArray(d?.data) ? d.data : [];
    const models = arr.map((m) => String(m?.id || '')).filter(Boolean).sort();
    res.json({ ok: true, models });
  } catch (e) {
    res.status(200).json({ ok: false, error: 'Tidak bisa menghubungi provider: ' + (e.message || e) });
  }
}));

// Uji koneksi / muat model memakai key yang sudah tersimpan di pengaturan_ai.
// Menerima override opsional { model, baseUrl } agar yang diuji = pilihan form saat ini,
// bukan nilai tersimpan yang lama.
app.post('/api/admin/ai-uji-tersimpan', requireAdmin(async (req, res) => {
  try {
    const kolom = req.body?.kolom === 'admin' ? 'admin' : 'umum';
    const cfg = await getPengaturanAI();
    const k = cfg[kolom];
    if (!k?.apiKey) return res.status(200).json({ ok: false, error: 'Belum ada API key tersimpan untuk ' + kolom + '.' });
    const baseUrl = String(req.body?.baseUrl || '').trim().replace(/\/+$/, '') || k.baseUrl;
    const model = String(req.body?.model || '').trim() || k.model || MODEL;
    const errUrlUji = validasiBaseUrl(baseUrl);
    if (errUrlUji) return res.status(400).json({ ok: false, error: errUrlUji });
    const t0 = Date.now();
    const r = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + k.apiKey },
      body: JSON.stringify({ model, max_tokens: 5, temperature: 0, messages: [{ role: 'user', content: 'Balas hanya dengan kata: OK' }] }),
      signal: AbortSignal.timeout(60000),
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return res.status(200).json({ ok: false, error: `Provider menolak (HTTP ${r.status}). ${txt.slice(0, 160)}` });
    }
    const d = await r.json().catch(() => ({}));
    res.json({ ok: true, latencyMs: ms, balasan: String(d?.choices?.[0]?.message?.content || '').trim().slice(0, 60), modelAsli: d?.model || '' });
  } catch (e) {
    res.status(200).json({ ok: false, error: 'Tidak bisa menghubungi provider: ' + (e.message || e) });
  }
}));

app.post('/api/admin/ai-model-tersimpan', requireAdmin(async (req, res) => {
  try {
    const kolom = req.body?.kolom === 'admin' ? 'admin' : 'umum';
    const cfg = await getPengaturanAI();
    const k = cfg[kolom];
    if (!k?.apiKey) return res.status(200).json({ ok: false, error: 'Belum ada API key tersimpan untuk ' + kolom + '.' });
    const baseUrl = String(req.body?.baseUrl || '').trim().replace(/\/+$/, '') || k.baseUrl;
    const r = await fetch(baseUrl + '/models', {
      headers: { 'Authorization': 'Bearer ' + k.apiKey },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: `Provider menolak (HTTP ${r.status}).` });
    const d = await r.json().catch(() => ({}));
    const models = (Array.isArray(d?.data) ? d.data : []).map((m) => String(m?.id || '')).filter(Boolean).sort();
    res.json({ ok: true, models });
  } catch (e) {
    res.status(200).json({ ok: false, error: 'Tidak bisa menghubungi provider: ' + (e.message || e) });
  }
}));

// ============ ADMIN: Daftar AI tersimpan (preset) ============
app.get('/api/admin/daftar-ai', requireAdmin(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const { data, error } = await sb.from('daftar_ai').select('id, nama, base_url, model, untuk, aktif, updated_at, api_key').order('updated_at', { ascending: false });
    if (error) {
      const tabelHilang = /daftar_ai/i.test(error.message || '');
      return res.status(tabelHilang ? 503 : 500).json({ ok: false, error: tabelHilang ? 'Tabel daftar_ai belum ada. Jalankan supabase-bundle.sql terbaru.' : error.message });
    }
    res.json({
      ok: true,
      // api_key utuh disertakan: endpoint ini khusus admin (requireAdmin) dan
      // admin memang butuh reveal/edit key dari dashboard.
      data: (data || []).map((x) => ({ ...x, keyMasked: maskKey(x.api_key) })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

app.post('/api/admin/daftar-ai', requireAdmin(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const nama = String(req.body?.nama || '').trim().slice(0, 60);
    const baseUrl = String(req.body?.baseUrl || '').trim().replace(/\/+$/, '');
    const apiKey = String(req.body?.apiKey || '').trim();
    const model = String(req.body?.model || '').trim();
    const untuk = req.body?.untuk === 'admin' ? 'admin' : 'umum';
    if (!nama) return res.status(400).json({ ok: false, error: 'Nama AI wajib diisi.' });
    const errUrlDaftar = validasiBaseUrl(baseUrl);
    if (errUrlDaftar) return res.status(400).json({ ok: false, error: errUrlDaftar });
    if (apiKey.length < 8) return res.status(400).json({ ok: false, error: 'API key terlalu pendek.' });
    const { data, error } = await sb.from('daftar_ai').insert({
      nama, base_url: baseUrl, api_key: apiKey, model, untuk, aktif: false,
    }).select('id').single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, id: data?.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

app.delete('/api/admin/daftar-ai/:id', requireAdmin(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const { error } = await sb.from('daftar_ai').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

// Ubah preset AI tersimpan (nama, base URL, key, model, untuk).
// apiKey kosong = tidak diubah. Bila preset sedang aktif, kunci aktif ikut disinkronkan.
app.patch('/api/admin/daftar-ai/:id', requireAdmin(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const { data: lama, error: e0 } = await sb.from('daftar_ai').select('*').eq('id', req.params.id).single();
    if (e0 || !lama) return res.status(404).json({ ok: false, error: 'AI tidak ditemukan.' });
    const b = req.body || {};
    const nama = b.nama !== undefined ? String(b.nama).trim().slice(0, 60) : lama.nama;
    const baseUrl = b.baseUrl !== undefined ? String(b.baseUrl).trim().replace(/\/+$/, '') : lama.base_url;
    const keyBaru = b.apiKey !== undefined ? String(b.apiKey).trim() : '';
    const apiKey = keyBaru ? keyBaru : lama.api_key;
    const model = b.model !== undefined ? String(b.model).trim().slice(0, 120) : (lama.model || '');
    const untuk = b.untuk === 'admin' ? 'admin' : (b.untuk === 'umum' ? 'umum' : lama.untuk);
    if (!nama) return res.status(400).json({ ok: false, error: 'Nama AI wajib diisi.' });
    const errUrl = validasiBaseUrl(baseUrl);
    if (errUrl) return res.status(400).json({ ok: false, error: errUrl });
    if (!apiKey || apiKey.length < 8) return res.status(400).json({ ok: false, error: 'API key terlalu pendek.' });
    const { error } = await sb.from('daftar_ai').update({
      nama, base_url: baseUrl, api_key: apiKey, model, untuk, updated_at: new Date().toISOString(),
    }).eq('id', lama.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    // Sinkronkan kunci aktif bila preset ini sedang aktif.
    if (lama.aktif) {
      const kolomLama = lama.untuk === 'admin' ? 'admin' : 'umum';
      const kolomBaru = untuk === 'admin' ? 'admin' : 'umum';
      if (kolomLama !== kolomBaru) {
        await sb.from('pengaturan_ai').upsert({ id: 1, [`${kolomLama}_base_url`]: '', [`${kolomLama}_api_key`]: '', [`${kolomLama}_model`]: '', updated_at: new Date().toISOString() }, { onConflict: 'id' });
        await sb.from('daftar_ai').update({ aktif: false }).eq('untuk', kolomBaru);
      }
      await sb.from('pengaturan_ai').upsert({
        id: 1,
        [`${kolomBaru}_base_url`]: baseUrl, [`${kolomBaru}_api_key`]: apiKey,
        [`${kolomBaru}_model`]: model || MODEL, updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      resetCachePengaturanAI();
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

// Toggle aktif preset: aktif=true -> salin ke pengaturan_ai (kolom umum/admin) + tandai aktif;
// aktif=false -> nonaktifkan + kosongkan kunci aktif kolom tersebut.
app.post('/api/admin/daftar-ai/:id/aktif', requireAdmin(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const aktif = req.body?.aktif !== false;
    const { data: p, error: e1 } = await sb.from('daftar_ai').select('*').eq('id', req.params.id).single();
    if (e1 || !p) return res.status(404).json({ ok: false, error: 'AI tidak ditemukan.' });
    const kolom = p.untuk === 'admin' ? 'admin' : 'umum';
    if (aktif) {
      const patch = {
        id: 1,
        [`${kolom}_base_url`]: p.base_url,
        [`${kolom}_api_key`]: p.api_key,
        [`${kolom}_model`]: p.model || MODEL,
        updated_at: new Date().toISOString(),
      };
      const { error: e2 } = await sb.from('pengaturan_ai').upsert(patch, { onConflict: 'id' });
      if (e2) return res.status(500).json({ ok: false, error: e2.message });
      await sb.from('daftar_ai').update({ aktif: false }).eq('untuk', p.untuk);
      await sb.from('daftar_ai').update({ aktif: true }).eq('id', p.id);
    } else {
      await sb.from('daftar_ai').update({ aktif: false }).eq('id', p.id);
      const patch = {
        id: 1,
        [`${kolom}_base_url`]: '', [`${kolom}_api_key`]: '', [`${kolom}_model`]: '',
        updated_at: new Date().toISOString(),
      };
      const { error: e2 } = await sb.from('pengaturan_ai').upsert(patch, { onConflict: 'id' });
      if (e2) return res.status(500).json({ ok: false, error: e2.message });
    }
    resetCachePengaturanAI();
    res.json({ ok: true, aktif });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

// Aktifkan preset: salin ke pengaturan_ai (umum/admin) + tandai aktif.
// (Dipertahankan untuk kompatibilitas; UI baru memakai /aktif.)
app.post('/api/admin/daftar-ai/:id/pakai', requireAdmin(async (req, res) => {
  try {
    if (!butuhSb(req, res)) return;
    const { data: p, error: e1 } = await sb.from('daftar_ai').select('*').eq('id', req.params.id).single();
    if (e1 || !p) return res.status(404).json({ ok: false, error: 'AI tidak ditemukan.' });
    const kolom = p.untuk === 'admin' ? 'admin' : 'umum';
    const patch = {
      id: 1,
      [`${kolom}_base_url`]: p.base_url,
      [`${kolom}_api_key`]: p.api_key,
      [`${kolom}_model`]: p.model || MODEL,
      updated_at: new Date().toISOString(),
    };
    const { error: e2 } = await sb.from('pengaturan_ai').upsert(patch, { onConflict: 'id' });
    if (e2) return res.status(500).json({ ok: false, error: e2.message });
    await sb.from('daftar_ai').update({ aktif: false }).eq('untuk', p.untuk);
    await sb.from('daftar_ai').update({ aktif: true }).eq('id', p.id);
    resetCachePengaturanAI();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

// Status antrean AI global (admin): pantau beban saat banyak guru generate bersamaan
app.get('/api/admin/antrean-ai', requireAdmin(async (req, res) => {
  res.json({ ok: true, ...statusAntreanAI() });
}));

app.get('/api/admin/ringkasan', requireAdmin(async (req, res) => {
  try {
    if (!sb) return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
    // 6 query independen: jalan paralel, bukan berurutan (jauh lebih cepat).
    const wibTengahMalam = new Date(Date.now() + 7 * 3600 * 1000);
    wibTengahMalam.setUTCHours(0, 0, 0, 0);
    const awalHari = new Date(wibTengahMalam.getTime() - 7 * 3600 * 1000).toISOString();
    const hariIni = periodeKuota();
    const [totalUser, dokumenTotal, dokumenHariIni, kreditTerpakaiMingguIni, jobAktif, referralDiklaim] = await Promise.all([
      (async () => { try { const { data } = await sb.auth.admin.listUsers({ perPage: 1 }); return data?.total || (data?.users ? data.users.length : 0); } catch { return 0; } })(),
      (async () => { try { const { count } = await sb.from('dokumen').select('id', { count: 'exact', head: true }); return count || 0; } catch { return 0; } })(),
      (async () => { try { const { count } = await sb.from('dokumen').select('id', { count: 'exact', head: true }).gte('created_at', awalHari); return count || 0; } catch { return 0; } })(),
      // Nilai ini periode MINGGUAN (periodeKuota = Minggu 15:00 WIB); nama key
      // JSON dipertahankan (kreditTerpakaiHariIni) agar kontrak frontend tidak pecah.
      (async () => { try { const { data } = await sb.from('kuota_harian').select('dipakai').eq('tanggal', hariIni); return (data || []).reduce((a, b) => a + (b.dipakai || 0), 0); } catch { return 0; } })(),
      (async () => { try { const { count } = await sb.from('jobs').select('id', { count: 'exact', head: true }).in('status', ['antri', 'berjalan']); return count || 0; } catch { return 0; } })(),
      // Klaim referral aktual: tabel baru bila ada, else dipakai_oleh_id terisi
      (async () => {
        try {
          if (await adaTabelKlaim()) {
            const { count } = await sb.from('klaim_referal').select('id', { count: 'exact', head: true });
            return count || 0;
          }
          const { count } = await sb.from('referal').select('id', { count: 'exact', head: true }).not('dipakai_oleh_id', 'is', null);
          return count || 0;
        } catch { return 0; }
      })(),
    ]);
    res.json({ ok: true, totalUser, dokumenTotal, dokumenHariIni, kreditTerpakaiHariIni: kreditTerpakaiMingguIni, jobAktif, referralDiklaim });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

app.get('/api/admin/pengguna', requireAdmin(async (req, res) => {
  try {
    if (!sb) return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
    const { page, perPage } = paginasi(req, 20);
    const { data, error } = await sb.auth.admin.listUsers({ perPage, page });
    if (error) throw error;
    const users = data?.users || [];
    let byokSet = new Set();
    try {
      const k = await sb.from('kunci_ai').select('user_id');
      byokSet = new Set((k.data || []).map((x) => x.user_id));
    } catch { /* abaikan: tabel BYOK mungkin belum ada */ }
    // Hitung dokumen per user dalam SATU query (hindari N+1 per baris)
    let hitungDok = {};
    try {
      const ids = users.map((u) => u.id);
      if (ids.length) {
        const { data: dd } = await sb.from('dokumen').select('user_id').in('user_id', ids);
        for (const d of (dd || [])) hitungDok[d.user_id] = (hitungDok[d.user_id] || 0) + 1;
      }
    } catch { /* abaikan */ }
    const daftar = users.map((u) => ({
      id: u.id, email: u.email, dibuat: u.created_at,
      byok: byokSet.has(u.id), jmlDokumen: hitungDok[u.id] || 0,
    }));
    res.json({ ok: true, data: daftar, total: data?.total ?? daftar.length, page, perPage });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

app.get('/api/admin/masukan', requireAdmin(async (req, res) => {
  try {
    if (!sb) return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
    let daftar = [];
    const { page, perPage, offset } = paginasi(req, 20);
    let total = 0;
    let belumDibaca = 0;
    try {
      const { data, error, count } = await sb.from('masukan')
        .select('id, jenis, nama, email, pesan, dibaca, created_at', { count: 'exact' })
        .order('created_at', { ascending: false }).range(offset, offset + perPage - 1);
      if (error) throw error;
      total = count || 0;
      daftar = (data || []).map((m) => ({
        id: m.id, jenis: m.jenis, nama: m.nama, email: m.email,
        pesan: m.pesan, dibaca: m.dibaca, dibuat: m.created_at,
      }));
    } catch { /* abaikan: tabel masukan mungkin belum ada */ }
    try {
      const { count } = await sb.from('masukan').select('id', { count: 'exact', head: true }).eq('dibaca', false);
      belumDibaca = count || 0;
    } catch { /* abaikan */ }
    res.json({ ok: true, data: daftar, total, page, perPage, belumDibaca });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

app.post('/api/admin/masukan/:id/baca', requireAdmin(async (req, res) => {
  try {
    if (!sb) return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
    const { error } = await sb.from('masukan').update({ dibaca: true }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

app.delete('/api/admin/masukan/:id', requireAdmin(async (req, res) => {
  try {
    if (!sb) return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
    const { error } = await sb.from('masukan').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

// ============ ADMIN: Transaksi (fondasi payment gateway) ============
// Daftar transaksi pembayaran: ?page=&per_page= ; opsional ?status=pending
app.get('/api/admin/transaksi', requireAdmin(async (req, res) => {
  try {
    if (!sb) return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
    const { page, perPage, offset } = paginasi(req, 20);
    let q = sb.from('transaksi')
      .select('id, user_id, email, paket, jumlah, metode, status, referensi, kredit, created_at', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (req.query.status) q = q.eq('status', String(req.query.status));
    const { data, error, count } = await q.range(offset, offset + perPage - 1);
    if (error) throw error;
    res.json({ ok: true, data: data || [], total: count || 0, page, perPage });
  } catch (e) {
    // Tabel belum ada -> kembalikan daftar kosong, bukan 500, agar UI tetap jalan.
    if (/relation .* does not exist|Could not find the table/i.test(e.message || '')) {
      return res.json({ ok: true, data: [], total: 0, page: 1, perPage: 20, belumAda: true });
    }
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

app.get('/api/admin/jobs', requireAdmin(async (req, res) => {
  try {
    if (!sb) return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
    const { page, perPage, offset } = paginasi(req, 20);
    const { data, error, count } = await sb.from('jobs')
      .select('id, mode, status, user_id, created_at', { count: 'exact' })
      .order('created_at', { ascending: false }).range(offset, offset + perPage - 1);
    if (error) throw error;
    const emailMap = {};
    try {
      // Hanya user yang muncul di halaman ini; ambil halaman listUsers
      // sampai semua ketemu (maks 10 halaman) — bukan 100 pertama saja.
      const tersisa = new Set((data || []).map((j) => j.user_id).filter(Boolean));
      let pageU = 1;
      while (tersisa.size && pageU <= 10) {
        const { data: ud } = await sb.auth.admin.listUsers({ perPage: 100, page: pageU });
        const daftar = ud?.users || [];
        for (const u of daftar) { emailMap[u.id] = u.email; tersisa.delete(u.id); }
        if (!daftar.length) break;
        pageU++;
      }
    } catch { /* abaikan */ }
    res.json({
      ok: true,
      data: (data || []).map((j) => ({
        id: j.id, mode: j.mode, status: j.status,
        dibuat: j.created_at, userEmail: emailMap[j.user_id] || null,
      })),
      total: count || 0, page, perPage,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}));

// Regenerate satu blok ala Gutenberg
app.post('/api/regen-block', requireAuth(async (req, res) => {
  try {
    if (!cekRateLimit(req.user.id, 'regen-block', 60))
      return kirimGagal(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
    const kunciUser = await resolveKunciEfektif(req.user.id, req.user);
    const { docType = 'modul', blockType = 'p', blockText = '', docTitle = '', topic = '', instruksi = '' } = req.body || {};
    if (!String(blockText).trim()) return kirimGagal(res, 400, 'Blok kosong.');
    const errPanjang = validasiPanjang(blockText, 20000, 'Blok');
    if (errPanjang) return kirimGagal(res, 400, errPanjang);
    const errInstruksi = validasiPanjang(instruksi, 500, 'Perintah');
    if (errInstruksi) return kirimGagal(res, 400, errInstruksi);
    const perintah = String(instruksi || '').trim();
    const system = `Kamu membantu guru menyunting dokumen Kurikulum Merdeka (jenis dokumen ada pada pesan pengguna). Tulis ulang BLOK berikut agar lebih baik: lebih jelas, lebih rinci, tetap sesuai Kurikulum Merdeka, dan tetap dalam Bahasa Indonesia formal. PERTAHANKAN format markdown blok ini (heading tetap heading, list tetap list, tabel tetap tabel). Jika blok berisi alokasi waktu per langkah (mis. "(2 menit)"), PERTAHANKAN alokasi tersebut dan pastikan totalnya tetap konsisten.${perintah ? `\n\nPERINTAH KHUSUS GURU UNTUK BLOK INI (wajib dipatuhi): ${perintah}` : ''}\nKembalikan HANYA isi blok yang sudah ditulis ulang, tanpa pembuka/penutup/pembahasan tambahan.`;
    const text = await aiKeyCtx.run(kunciUser, () =>
      ai(system, `Jenis dokumen: ${docType}\nKonteks dokumen: "${docTitle}" - Topik: ${topic}\n\nBLOK (${blockType}):\n${blockText}`, 3000, 0.8));
    res.json({ ok: true, text: text.trim() });
  } catch (e) {
    kirimGagal(res, 500, 'Kesalahan server: ' + (e.message || e));
  }
}));

// Buat gambar dengan AI: kembalikan URL gambar (Pollinations, tanpa API key).
// Frontend menyimpan URL ke daftar images dokumen seperti gambar biasa.
app.post('/api/gambar-ai', requireAuth(async (req, res) => {
  try {
    if (!cekRateLimit(req.user.id, 'gambar-ai', 10))
      return kirimGagal(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
    const prompt = String(req.body?.prompt || '').trim().slice(0, 300);
    if (prompt.length < 5) return kirimGagal(res, 400, 'Deskripsi gambar minimal 5 karakter.');
    const seed = Math.floor(Math.random() * 1000000);
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt)
      + '?width=1024&height=768&nologo=true&seed=' + seed;
    res.json({ ok: true, url });
  } catch (e) {
    kirimGagal(res, 500, 'Kesalahan server: ' + (e.message || e));
  }
}));

// Rekomendasi AI di awal wizard
app.post('/api/rekomendasi', requireAuth(async (req, res) => {
  try {
    if (!cekRateLimit(req.user.id, 'rekomendasi', 30))
      return kirimGagal(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
    const kunciUser = await resolveKunciEfektif(req.user.id, req.user);
    const rekomendasi = await aiKeyCtx.run(kunciUser, () => rekomendasiAIInternal(req.body || {}));
    res.json({ ok: true, rekomendasi });
  } catch (e) {
    kirimGagal(res, 500, 'Kesalahan server: ' + (e.message || e));
  }
}));

// Pertanyaan persona guru yang disesuaikan AI berdasarkan konteks mengajar.
// Mengembalikan array pertanyaan pilihan ganda + isian untuk sesi wawancara.
app.post('/api/persona/pertanyaan', requireAuth(async (req, res) => {
  try {
    if (!cekRateLimit(req.user.id, 'persona-tanya', 20))
      return kirimGagal(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
    const { jenjang = '', fase = '', kelas = '', mapel = '' } = req.body || {};
    const kunciUser = await resolveKunciEfektif(req.user.id, req.user);
    const daftar = await aiKeyCtx.run(kunciUser, async () => {
      const system = `Kamu membantu mengenali gaya mengajar guru Indonesia untuk menyusun perangkat ajar Kurikulum Merdeka yang sesuai.
Susun 5 pertanyaan untuk menggali persona guru. Format: kembalikan HANYA JSON valid (tanpa markdown, tanpa penjelasan) dengan struktur:
{"pertanyaan":[{"key":"gaya","tanya":"...","tipe":"radio","opsi":["...","...","...","..."]}, ...]}
Aturan:
- tipe "radio" = pilih satu; "cek" = boleh pilih lebih dari satu; "teks" = isian bebas (tanpa opsi).
- Pertanyaan 1-2: gaya mengajar & karakteristik siswa. Pertanyaan 3: fasilitas kelas. Pertanyaan 4: preferensi bentuk modul. Pertanyaan 5: tipe "teks" — metode mengajar favorit / hal khusus yang perlu AI tahu.
- Sesuaikan opsi dengan konteks: jenjang, fase, dan mata pelajaran di bawah. Bahasa santai tapi sopan (sapaan Bapak/Ibu).
- key harus unik: gaya, siswa, fasilitas, preferensi, catatan.`;
      const user = `Jenjang: ${jenjang}\nFase: ${fase}\nKelas: ${kelas}\nMata pelajaran: ${mapel}\n\nSusun 5 pertanyaan persona guru untuk konteks di atas.`;
      const teks = await ai(system, user, 2000, 0.7);
      const m = String(teks).match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Format pertanyaan tidak valid.');
      const j = JSON.parse(m[0]);
      if (!Array.isArray(j.pertanyaan) || !j.pertanyaan.length) throw new Error('Daftar pertanyaan kosong.');
      return j.pertanyaan.slice(0, 6).map((p, i) => ({
        key: String(p.key || 'q' + i),
        tanya: String(p.tanya || ''),
        tipe: ['radio', 'cek', 'teks'].includes(p.tipe) ? p.tipe : 'radio',
        opsi: Array.isArray(p.opsi) ? p.opsi.slice(0, 5).map(String) : [],
      }));
    });
    res.json({ ok: true, pertanyaan: daftar });
  } catch (e) {
    kirimGagal(res, 500, 'Kesalahan server: ' + (e.message || e));
  }
}));

// Draf AI untuk kolom opsional Generator Paket: susun draf ATP/Prosem (acuan)
// atau ringkasan materi dari info dasar. Dipakai tombol "Susun dengan AI"
// dan otomatis oleh worker bila kolom dikosongkan.
function promptDrafPaket(jenis, { jenjang = '', fase = '', kelas = '', semester = '', mapel = '' }, topiks = []) {
  if (jenis === 'materi') {
    return {
      system: `Kamu membantu guru menyusun ringkasan materi sumber untuk Modul Ajar Kurikulum Merdeka. Tulis dalam Bahasa Indonesia formal dengan format markdown (heading dan list). Materi harus benar dan kredibel, jangan mengarang fakta. Kembalikan HANYA isi materi, tanpa pembuka/penutup.`,
      user: `Jenjang: ${jenjang}\nFase: ${fase}\nKelas: ${kelas}\nMata pelajaran: ${mapel}\nTopik:\n${topiks.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nSusun ringkasan materi per topik di atas: konsep kunci, definisi penting, dan contoh yang relevan dengan kehidupan peserta didik Indonesia.`,
      maxTokens: 4000,
    };
  }
  return {
    system: `Kamu membantu guru menyusun draf ATP (Alur Tujuan Pembelajaran) dan Prosem (Program Semester) Kurikulum Merdeka. Tulis dalam Bahasa Indonesia formal dengan format markdown. Jangan mengarang: tujuan pembelajaran harus realistis sesuai fase/kelas. Kembalikan HANYA isi dokumen, tanpa pembuka/penutup.`,
    user: `Jenjang: ${jenjang}\nFase: ${fase}\nKelas: ${kelas}\nSemester: ${semester}\nMata Pelajaran: ${mapel}\nTopik: ${topiks.join('; ')}\n\nSusun draf ATP (tujuan pembelajaran per elemen, runtut) dan draf Prosem (alokasi per minggu untuk semester ${semester}) sebagai acuan penyusunan Modul Ajar.`,
    maxTokens: 4000,
  };
}
app.post('/api/paket/draf', requireAuth(async (req, res) => {
  try {
    if (!cekRateLimit(req.user.id, 'paket-draf', 20))
      return kirimGagal(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
    const kunciUser = await resolveKunciEfektif(req.user.id, req.user);
    const { jenis = 'acuan', info = {}, topiks = [] } = req.body || {};
    if (!String(info.mapel || '').trim()) return kirimGagal(res, 400, 'Isi mata pelajaran dulu sebelum menyusun draf.');
    const { daftar: daftarTopik, galat: galatTopik } = validasiTopiks(topiks);
    if (galatTopik) return kirimGagal(res, 400, galatTopik);
    const { system, user, maxTokens } = promptDrafPaket(jenis === 'materi' ? 'materi' : 'acuan', info, daftarTopik);
    const text = await aiKeyCtx.run(kunciUser, () => ai(system, user, maxTokens, 0.7));
    res.json({ ok: true, text: text.trim() });
  } catch (e) {
    kirimGagal(res, 500, 'Kesalahan server: ' + (e.message || e));
  }
}));

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

app.use(express.static(path.join(__dirname, 'public'), {
  // index.html tidak boleh di-cache: selalu ambil versi terbaru agar
  // pengguna tidak terjebak di bundle lama.
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
  },
}));
// API yang tidak dikenal -> 404 JSON (jangan jatuh ke index.html)
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'API tidak ditemukan.' }));
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3102;
app.listen(PORT, () => console.log('[modulajar] listening on :' + PORT));
