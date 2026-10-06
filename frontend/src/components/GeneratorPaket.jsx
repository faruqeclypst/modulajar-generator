import { useEffect, useRef, useState } from 'react';
import { FASE, MODEL } from '../lib/referensi';
import { DOC_TYPES } from '../lib/docs';
import { getProfile, saveProfile } from '../lib/api';
import { getToken } from '../lib/supabase';
import { listProjects, saveProject } from '../lib/db';
import FormulirDasar from './FormulirDasar';
import UnggahDokumen from './UnggahDokumen';
import Paywall from './Paywall';
import TulisanAI from './TulisanAI';
import StempelSelesai from './StempelSelesai';

// Generator Paket via job backend: browser boleh ditutup, job tetap jalan di server.
const RANTAI_LABEL = {
  lengkap: ['CP', 'ATP', 'Minggu Efektif', 'Prota', 'Prosem', 'KKTP', 'Modul 1..N', 'LKPD 1..N', 'Paket Soal'],
  perencanaan: ['CP', 'ATP', 'Minggu Efektif', 'Prota', 'Prosem', 'KKTP'],
  pelaksanaan: ['Modul 1..N', 'LKPD 1..N', 'Paket Soal'],
};
const MODE_INFO = {  lengkap: { nama: 'Paket Lengkap', meta: 'Perencanaan + N modul + N LKPD + soal', desc: 'Dari CP sampai KKTP, lalu Modul dan LKPD per topik, terus sampai Paket Soal. Satu klik, tanpa jeda.' },
  perencanaan: { nama: 'Paket Perencanaan', meta: '6 dokumen', desc: 'CP, ATP, Minggu Efektif, Prota, Prosem, KKTP. Pas untuk awal semester.' },
  pelaksanaan: { nama: 'Paket Pelaksanaan', meta: 'N modul + N LKPD + soal', desc: 'Modul Ajar, LKPD, dan Paket Soal per topik, dengan ATP/Prosem sebagai acuan (tempel sendiri atau biarkan AI menyusun).' },
};

// Label status job dalam Bahasa Indonesia
const STATUS_JOB = {
  antri: 'Menunggu', berjalan: 'Berjalan', menunggu_review: 'Menunggu review',
  selesai: 'Selesai', gagal: 'Gagal', dibatalkan: 'Dibatalkan',
};
const statusJob = (s) => STATUS_JOB[s] || String(s || '').replace('_', ' ');

// Label status tiap langkah job
const STATUS_LANGKAH = { ok: 'Selesai', jalan: 'Menyusun', antri: 'Menunggu', gagal: 'Gagal' };

const emptyForm = {
  nama: '', nip: '', sekolah: '', tahunAjaran: '',
  jenjang: 'SMP/MTs', fase: '', kelas: '', semester: 'Ganjil',
  mapel: '', topiks: '', alokasi: '', model: 'auto', jpPerMinggu: '',
  jmlPG: '10', jmlUraian: '3', materi: '', acuan: '', cpResmi: '', mingguEfektif: '',
};

async function apiJob(path, method, body) {
  const t = await getToken().catch(() => '');
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) {
    const err = new Error(d.error || 'Server tidak merespons.');
    err.code = d.code;
    err.detail = d;
    throw err;
  }
  return d;
}

export default function GeneratorPaket({ onBack, onOpenDoc, onChanged, waLink, kuota, onKuotaChanged }) {
  const [mode, setMode] = useState('lengkap');
  const [reviewJeda, setReviewJeda] = useState(false); // jeda review setelah perencanaan: default MATI (paket satu klik)
  const [form, setForm] = useState(() => ({ ...emptyForm, ...getProfile() }));
  const [tahap, setTahap] = useState('form'); // form | jalan | selesai
  const [job, setJob] = useState(null);
  const [errForm, setErrForm] = useState({});
  const [errJalan, setErrJalan] = useState('');
  const [menghubungkan, setMenghubungkan] = useState(false);
  const [memulai, setMemulai] = useState(false); // guard double-submit tombol Buat
  const gagalPoll = useRef(0);
  const ambilRef = useRef(null);
  const [detik, setDetik] = useState(0);
  const [jobAktif, setJobAktif] = useState([]);
  const [paywall, setPaywall] = useState(null); // {mode, detail}
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [proyekBaru, setProyekBaru] = useState('');
  const [drafAI, setDrafAI] = useState({}); // loading tombol "Susun dengan AI" per kolom
  const [infoDraf, setInfoDraf] = useState(''); // catatan hasil susun AI / simpan draft
  const [draftAda, setDraftAda] = useState(null); // draft tersimpan di perangkat ini
  const DRAFT_KEY = 'ma-paket-draft';
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const faseOpts = FASE[form.jenjang] || [];
  useEffect(() => { listProjects().then(setProjects).catch(() => {}); }, []);
  useEffect(() => {
    if (!faseOpts.includes(form.fase)) setForm((f) => ({ ...f, fase: faseOpts[0] || '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.jenjang]);
  useEffect(() => () => { hentikanPoll(); }, []);
  useEffect(() => { cekJobAktif(); }, []);
  // Tawarkan draft yang tersimpan di perangkat ini (tidak otomatis menimpa isian)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setDraftAda(JSON.parse(raw));
    } catch { /* abaikan */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function gabung(k, teks, nama) {
    setForm((f) => {
      const lama = (f[k] || '').trim();
      return { ...f, [k]: lama ? lama + '\n\n[Sumber: ' + nama + ']\n' + teks : teks };
    });
  }

  function daftarTopik() {
    return form.topiks.split('\n').map((t) => t.trim()).filter(Boolean);
  }

  function validasi() {
    const e = {};
    if (!form.nama.trim()) e.nama = 'Wajib diisi.';
    if (!form.sekolah.trim()) e.sekolah = 'Wajib diisi.';
    if (!form.mapel.trim()) e.mapel = 'Wajib diisi.';
    if (mode !== 'perencanaan' && !daftarTopik().length) e.topiks = 'Isi minimal satu topik (satu baris satu topik).';
    // Kolom acuan & materi opsional: bila dikosongkan, AI menyusun drafnya otomatis saat job berjalan.
    setErrForm(e);
    return Object.keys(e).length === 0;
  }

  // Susun draf kolom (acuan ATP/Prosem atau materi) dengan AI, lalu isi ke textarea.
  async function susunDraf(jenis) {
    const key = jenis === 'materi' ? 'materi' : 'acuan';
    if (!form.mapel.trim()) { setInfoDraf('Isi mata pelajaran dulu sebelum menyusun draf dengan AI.'); return; }
    if ((form[key] || '').trim() && !window.confirm('Kolom ini sudah terisi. Ganti dengan draf dari AI?')) return;
    setDrafAI((d) => ({ ...d, [key]: true }));
    setInfoDraf('');
    try {
      const t = await getToken().catch(() => '');
      const r = await fetch('/api/paket/draf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
        body: JSON.stringify({
          jenis,
          info: { jenjang: form.jenjang, fase: form.fase, kelas: form.kelas, semester: form.semester, mapel: form.mapel },
          topiks: daftarTopik(),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d.ok) throw new Error(d.error || 'Server tidak merespons.');
      set(key, d.text);
      setInfoDraf('Draf ' + (jenis === 'materi' ? 'materi' : 'acuan ATP/Prosem') + ' selesai disusun AI. Periksa dan sesuaikan sebelum dipakai.');
    } catch (e) {
      setInfoDraf('Gagal menyusun draf: ' + (e.message || 'coba lagi.'));
    } finally {
      setDrafAI((d) => ({ ...d, [key]: false }));
    }
  }

  function simpanDraft() {
    // Jangan simpan form kosong; minta konfirmasi bila menimpa draft lama
    const kosong = !form.nama.trim() && !form.mapel.trim() && !(form.topiks || '').trim();
    if (kosong) { setInfoDraf('Isi dulu sebelum menyimpan draft.'); return; }
    try {
      if (localStorage.getItem(DRAFT_KEY) && !window.confirm('Timpa draft yang sudah tersimpan?')) return;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        mode, reviewJeda, form, projectId, proyekBaru, waktu: Date.now(),
      }));
      setInfoDraf('Draft tersimpan di perangkat ini. Buka lagi halaman ini untuk memuatnya.');
    } catch {
      setInfoDraf('Gagal menyimpan draft di perangkat ini.');
    }
  }
  function muatDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!d) return;
      setErrForm({}); // bersihkan error validasi lama
      setInfoDraf('');
      setMode(d.mode || 'lengkap');
      setReviewJeda(!!d.reviewJeda);
      // Field profil (nama, nip, sekolah, tahunAjaran, jenjang) pakai data
      // terbaru di perangkat; hanya field non-profil yang dipulihkan dari draft.
      const prof = getProfile();
      const dForm = d.form || {};
      setForm({
        ...emptyForm,
        ...dForm,
        nama: prof.nama || '',
        nip: prof.nip || '',
        sekolah: prof.sekolah || '',
        tahunAjaran: prof.tahunAjaran || '',
        jenjang: prof.jenjang || dForm.jenjang || emptyForm.jenjang,
      });
      setProjectId(d.projectId || '');
      setProyekBaru(d.proyekBaru || '');
      setDraftAda(null);
      setInfoDraf('Draft dimuat kembali.');
      window.scrollTo(0, 0);
    } catch { /* abaikan */ }
  }
  function hapusDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* abaikan */ }
    setDraftAda(null);
  }

  async function cekJobAktif() {
    try {
      const d = await apiJob('/api/paket', 'GET');
      setJobAktif((d.jobs || []).filter((j) => ['antri', 'berjalan', 'menunggu_review'].includes(j.status)));
    } catch { /* abaikan */ }
  }

  function hentikanPoll() {
    clearInterval(pollRef.current);
    clearInterval(timerRef.current);
  }

  async function pantau(jobId) {
    hentikanPoll();
    setTahap('jalan');
    setErrJalan('');
    setMenghubungkan(false);
    gagalPoll.current = 0;
    const t0 = Date.now();
    timerRef.current = setInterval(() => setDetik(Math.floor((Date.now() - t0) / 1000)), 1000);
    const ambil = async () => {
      try {
        const d = await apiJob('/api/paket/' + jobId, 'GET');
        gagalPoll.current = 0;
        setMenghubungkan(false);
        setErrJalan('');
        setJob(d.job);
        if (['selesai', 'gagal', 'dibatalkan'].includes(d.job.status)) {
          hentikanPoll();
          if (d.job.status === 'selesai') { setTahap('selesai'); onChanged && onChanged(); onKuotaChanged && onKuotaChanged(); }
        }
        cekJobAktif();
      } catch (e) {
        // Job tetap berjalan di server; gangguan sesaat jangan ditampilkan sebagai error besar
        gagalPoll.current += 1;
        if (gagalPoll.current >= 3) {
          setMenghubungkan(false);
          setErrJalan('Koneksi ke server terputus. Tenang, paket tetap disusun di server.');
        } else {
          setMenghubungkan(true);
        }
      }
    };
    ambilRef.current = ambil;
    await ambil();
    pollRef.current = setInterval(ambil, 3000);
    window.scrollTo(0, 0);
  }

  async function mulai() {
    if (memulai) return; // cegah double-submit
    if (!validasi()) return;
    setMemulai(true);
    setErrJalan('');
    setPaywall(null);
    try {
      saveProfile({ nama: form.nama, nip: form.nip, sekolah: form.sekolah, tahunAjaran: form.tahunAjaran, jenjang: form.jenjang });
      // Proyek: pilih yang ada atau buat baru. projectId ikut di info job
      // sehingga setiap dokumen hasil job tersimpan dengan projectId tersebut.
      let pid = (projectId && projectId !== '__baru') ? projectId : null;
      if (projectId === '__baru') {
        pid = await saveProject({
          nama: proyekBaru.trim() || [form.mapel, form.kelas].filter(Boolean).join(' '),
          mapel: form.mapel, jenjang: form.jenjang, fase: form.fase, kelas: form.kelas,
          semester: form.semester, tahunAjaran: form.tahunAjaran,
        });
        setProjects(await listProjects());
        setProjectId(pid);
      }
      const prof = getProfile();
      const d = await apiJob('/api/paket', 'POST', {
        mode,
        reviewJeda: mode === 'lengkap' && reviewJeda,
        info: {
          nama: form.nama, nip: form.nip || undefined, sekolah: form.sekolah, tahunAjaran: form.tahunAjaran,
          jenjang: form.jenjang, fase: form.fase, kelas: form.kelas, semester: form.semester,
          mapel: form.mapel, alokasi: form.alokasi, model: form.model, jpPerMinggu: form.jpPerMinggu,
          jmlPG: form.jmlPG, jmlUraian: form.jmlUraian,
          kepalaSekolah: prof.kepalaSekolah || undefined,
          nipKepalaSekolah: prof.nipKepalaSekolah || undefined,
          projectId: pid || undefined,
        },
        materi: form.materi,
        topiks: daftarTopik(),
        uploads: { cpResmi: form.cpResmi, mingguEfektif: form.mingguEfektif, acuan: form.acuan },
      });
      pantau(d.jobId);
      // Job berhasil dibuat: draft tidak lagi dibutuhkan
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* abaikan */ }
      setDraftAda(null);
    } catch (e) {
      // Kuota tidak cukup → buka Paywall dengan rincian butuh/sisa
      if (e.code === 'kuota_habis') setPaywall({ mode: 'kuota_habis', detail: e.detail });
      else setErrJalan(e.message || 'Gagal memulai job.');
      setMemulai(false);
    }
  }

  async function lanjutkan() {
    if (!job) return;
    try {
      await apiJob('/api/paket/' + job.id + '/lanjutkan', 'POST');
      pantau(job.id);
    } catch (e) {
      setErrJalan(e.message || 'Gagal melanjutkan.');
    }
  }

  async function batalkan() {
    if (!job) { setTahap('form'); return; }
    try { await apiJob('/api/paket/' + job.id + '/batalkan', 'POST'); } catch { /* abaikan */ }
    hentikanPoll();
    setTahap('form');
    setJob(null);
    cekJobAktif();
  }

  const fmtWaktu = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  const langkah = job?.progress?.langkah || [];
  const hasil = job?.hasil || [];
  const live = job?.progress?.live || null; // tulisan AI realtime dari worker backend
  const selesaiCount = langkah.filter((s) => s.status === 'ok').length;

  return (
    <div className="wrap">
      <span className="kicker">Generator Paket</span>
      <h1 className="page">Paket Semester, Satu Klik</h1>
      <p className="lead">
        CP, ATP, Minggu Efektif, Prota, Prosem, KKTP, lalu Modul Ajar dan LKPD
        untuk tiap topik. Dikerjakan server: browser boleh ditutup, paket tetap jalan.
      </p>

      {tahap === 'form' && draftAda && (
        <div className="alert alert-info">
          <b>Ada draft tersimpan</b> ({new Date(draftAda.waktu).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}).
          <div className="btn-row">
            <button className="btn btn-sm btn-primary" onClick={muatDraft}>Muat draft</button>
            <button className="btn btn-sm" onClick={hapusDraft}>Hapus</button>
          </div>
        </div>
      )}

      {tahap === 'form' && jobAktif.length > 0 && (
        <div className="alert alert-info">
          <b>Ada paket yang sedang berjalan</b> ({jobAktif.length}).
          <div className="btn-row">
            {jobAktif.map((j) => (
              <button key={j.id} className="btn btn-sm btn-primary" onClick={() => pantau(j.id)}>
                Pantau ({MODE_INFO[j.mode]?.nama || j.mode} · {statusJob(j.status)})
              </button>
            ))}
          </div>
        </div>
      )}

      {tahap === 'form' && (
        <>
          <h2 style={{ marginTop: 28 }}>Pilih paket</h2>
          <div className="mode-grid" role="radiogroup" aria-label="Pilih paket dokumen">
            {Object.entries(MODE_INFO).map(([k, m]) => (
              <button
                key={k} type="button" role="radio" aria-checked={mode === k}
                className={'card mode-card' + (mode === k ? ' selected' : '')}
                onClick={() => setMode(k)}
              >
                <b>{m.nama}</b>
                <span className="chip red">{m.meta}</span>
                <p>{m.desc}</p>
              </button>
            ))}
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <b style={{ fontSize: 13 }}>Alur acuan otomatis</b>
            <p className="hint" style={{ margin: '6px 0 0' }}>{RANTAI_LABEL[mode].join(' → ')}</p>
          </div>

          {mode === 'lengkap' && (
            <label className="check-row">
              <input type="checkbox" checked={reviewJeda} onChange={(e) => setReviewJeda(e.target.checked)} />
              <span>
                <b>Jeda untuk review setelah perencanaan</b>
                <span className="hint">Paket berhenti setelah CP sampai KKTP selesai, agar kamu bisa meninjau dulu sebelum modul dibuat. Tanpa centang, paket jalan terus sampai selesai dalam satu klik.</span>
              </span>
            </label>
          )}

          {mode !== 'pelaksanaan' ? (
            <div className="alert alert-info" style={{ marginTop: 14 }}>
              <b>Belum punya CP / ATP / Prota / Prosem? Tidak masalah.</b> Server
              menyusunnya berurutan. Kamu cukup isi data dasar di bawah. Teks CP resmi
              boleh ditempel bila ada; bila tidak, AI menyusun drafnya dari info jenjang, fase, dan mapel.
            </div>
          ) : (
            <div className="alert alert-info" style={{ marginTop: 14 }}>
              <b>Acuan ATP/Prosem opsional.</b> Tempel yang sudah ada pada kolom
              Dokumen Acuan agar Modul Ajar selaras dengan perencanaanmu — atau
              kosongkan saja, AI akan menyusun draf acuannya otomatis saat paket
              berjalan. Kamu juga bisa menekan <b>Susun dengan AI</b> untuk melihat
              drafnya dulu sebelum paket dibuat.
            </div>
          )}

          <h2 style={{ marginTop: 28 }}>Data pembelajaran</h2>
          <div className="grid2">
            <FormulirDasar
              nilai={form}
              onUbah={(patch) => setForm((f) => ({ ...f, ...patch }))}
              wajib={['nama', 'sekolah', 'mapel']}
              galat={errForm}
              prefix="gp"
            />
          </div>

          <h2 style={{ marginTop: 28 }}>Proyek</h2>
          <div className="card" style={{ marginTop: 10 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Simpan hasil ke proyek</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Tanpa proyek</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.mapel, p.kelas].filter(Boolean).join(' ') || p.nama}
                  </option>
                ))}
                <option value="__baru">+ Buat proyek baru</option>
              </select>
              <p className="hint">Semua dokumen paket ini tersimpan di proyek yang dipilih.</p>
            </div>
            {projectId === '__baru' && (
              <div className="field" style={{ margin: '12px 0 0' }}>
                <label>Nama proyek baru</label>
                <input
                  value={proyekBaru}
                  onChange={(e) => setProyekBaru(e.target.value)}
                  placeholder={[form.mapel, form.kelas].filter(Boolean).join(' ') || 'cth: IPA 7'}
                />
              </div>
            )}
          </div>

          {mode !== 'perencanaan' && (
            <div className="field"><label>Daftar Topik <span className="hint">(satu baris satu topik. Tiap topik jadi satu Modul + satu LKPD)</span></label>
              <textarea value={form.topiks} onChange={(e) => set('topiks', e.target.value)}
                placeholder={"cth:\nSistem pernapasan manusia\nSistem peredaran darah"} rows={4} />
              {errForm.topiks && <p className="hint" style={{ color: 'var(--red)' }}>{errForm.topiks}</p>}</div>
          )}

          <div className="grid2">
            <div className="field"><label>Model Pembelajaran</label>
              <select value={form.model} onChange={(e) => set('model', e.target.value)}>
                <option value="auto">Rekomendasi AI (otomatis)</option>
                {MODEL.map((m) => <option key={m}>{m}</option>)}
              </select></div>
            <div className="field"><label>Alokasi Waktu per Modul</label>
              <input value={form.alokasi} onChange={(e) => set('alokasi', e.target.value)} placeholder="cth: 2 x 45 menit" /></div>
            <div className="field"><label>JP per Minggu <span className="hint">(opsional)</span></label>
              <input value={form.jpPerMinggu} onChange={(e) => set('jpPerMinggu', e.target.value)} placeholder="cth: 3" /></div>
            <div className="field"><label>Jumlah Soal PG</label>
              <input type="number" min="0" value={form.jmlPG} onChange={(e) => set('jmlPG', e.target.value === '' ? '' : String(Math.max(0, Number(e.target.value) || 0)))} /></div>
            <div className="field"><label>Jumlah Soal Uraian</label>
              <input type="number" min="0" value={form.jmlUraian} onChange={(e) => set('jmlUraian', e.target.value === '' ? '' : String(Math.max(0, Number(e.target.value) || 0)))} /></div>
          </div>

          <div className="field"><label>Materi Sumber <span className="hint">(opsional — kosongkan untuk disusun AI otomatis)</span></label>
            <textarea value={form.materi} onChange={(e) => set('materi', e.target.value)}
              placeholder="Tempel ringkasan materi dari buku atau sumber tepercaya" rows={3} />
            <div className="btn-row" style={{ marginTop: 8, marginBottom: 0 }}>
              <button type="button" className="btn btn-sm" onClick={() => susunDraf('materi')} disabled={!!drafAI.materi}>
                {drafAI.materi ? 'Menyusun…' : '✨ Susun dengan AI'}
              </button>
            </div>
            <UnggahDokumen onTeks={(t, n) => gabung('materi', t, n)} /></div>

          {mode === 'pelaksanaan' && (
            <div className="field"><label>Dokumen Acuan (ATP/Prosem) <span className="hint">(opsional — kosongkan untuk disusun AI otomatis)</span></label>
              <textarea value={form.acuan} onChange={(e) => set('acuan', e.target.value)}
                placeholder="Tempel ATP atau Prosem yang sudah ada" rows={4} />
              <div className="btn-row" style={{ marginTop: 8, marginBottom: 0 }}>
                <button type="button" className="btn btn-sm" onClick={() => susunDraf('acuan')} disabled={!!drafAI.acuan}>
                  {drafAI.acuan ? 'Menyusun…' : '✨ Susun dengan AI'}
                </button>
              </div>
              <UnggahDokumen onTeks={(t, n) => gabung('acuan', t, n)} /></div>
          )}

          {mode !== 'pelaksanaan' && (
            <>
              <div className="field"><label>Teks CP Resmi <span className="hint">(opsional)</span></label>
                <textarea value={form.cpResmi} onChange={(e) => set('cpResmi', e.target.value)}
                  placeholder="Tempel CP resmi Kemendikdasmen bila ada" rows={3} />
                <UnggahDokumen onTeks={(t, n) => gabung('cpResmi', t, n)} /></div>
              <div className="field"><label>Dokumen Minggu Efektif <span className="hint">(opsional. Unggah bila sekolah sudah punya)</span></label>
                <textarea value={form.mingguEfektif} onChange={(e) => set('mingguEfektif', e.target.value)}
                  placeholder="Tempel dokumen minggu efektif sekolah, atau unggah file-nya" rows={3} />
                <UnggahDokumen onTeks={(t, n) => gabung('mingguEfektif', t, n)} /></div>
            </>
          )}

          {errJalan && <div className="alert" style={{ marginTop: 14 }}>{errJalan}</div>}

          {kuota && !kuota.admin && (
            <p className="hint" style={{ margin: '0 0 4px' }}>Sisa kredit minggu ini: <b>{kuota.sisa}</b> dari {kuota.batas}.</p>
          )}
          {kuota && kuota.admin && (
            <p className="hint" style={{ margin: '0 0 4px' }}>Kredit: tanpa batas (Admin).</p>
          )}
          <div className="btn-row">
            <button className="btn btn-primary" onClick={mulai} disabled={memulai}>{memulai ? 'Membuat…' : `Buat ${MODE_INFO[mode].nama}`}</button>
            <button className="btn" onClick={simpanDraft}>Simpan Draft</button>
            <button className="btn" onClick={onBack}>Kembali</button>
          </div>
          {infoDraf && <p className="hint" role="status" style={{ marginTop: 8 }}>{infoDraf}</p>}
          <p className="hint">Dikerjakan server. Halaman ini boleh ditutup, pantau lagi nanti dari sini.</p>
        </>
      )}

      {tahap === 'jalan' && job && (
        <>
          <div className="card job-head">
            <div>
              <span className="kicker" style={{ marginBottom: 10 }}>Paket berjalan</span>
              <h2>Menyusun {MODE_INFO[job.mode]?.nama || 'paket'}</h2>
              <span className="chip red">{statusJob(job.status)}</span>
            </div>
            <span className="job-timer" aria-label="Waktu berjalan">{fmtWaktu(detik)}</span>
          </div>
          {menghubungkan && !errJalan && job.status === 'berjalan' && (
            <p className="hint" role="status">Menghubungkan ulang ke server…</p>
          )}
          {errJalan && (
            <div className="alert alert-error">
              {errJalan}
              <div className="btn-row">
                <button className="btn btn-sm btn-ink" onClick={() => ambilRef.current && ambilRef.current()}>Muat ulang status</button>
              </div>
            </div>
          )}
          {live && live.teks && job.status === 'berjalan' && (
            <div className="card">
              <span className="kicker">Sedang ditulis AI</span>
              <h3 style={{ margin: '0 0 4px' }}>{live.label}</h3>
              {live.subfase && <p className="hint" style={{ marginTop: 0 }}>{live.subfase}</p>}
              <TulisanAI segmen={[{ key: live.key, label: '', teks: live.teks }]} live={job.status === 'berjalan'} />
            </div>
          )}
          {job.status === 'menunggu_review' && (
            <div className="alert alert-info">
              <b>Dokumen perencanaan selesai.</b> Tinjau dulu (buka dan edit bila perlu),
              lalu lanjutkan ke pembuatan modul.
              <div className="btn-row">
                <button className="btn btn-primary" onClick={lanjutkan}>Lanjutkan ke pembuatan modul</button>
              </div>
            </div>
          )}
          {langkah.length > 0 && (
            <>
              <div className="progress" role="progressbar" aria-valuenow={selesaiCount} aria-valuemin={0} aria-valuemax={langkah.length} aria-label="Kemajuan paket">
                <div className="progress-fill" style={{ width: (langkah.length ? (selesaiCount / langkah.length) * 100 : 0) + '%' }} />
              </div>
              <p className="progress-label">Langkah {selesaiCount} dari {langkah.length}</p>
              <ol className="job-steps">
                {langkah.map((s, i) => (
                  <li key={s.key + i} className={'job-step is-' + s.status}>
                    <span className="job-dot" aria-hidden="true">
                      {s.status === 'ok' ? '✓' : s.status === 'gagal' ? '!' : i + 1}
                    </span>
                    <div className="job-step-body">
                      <b>{s.label}</b>
                      <span className="job-status">{STATUS_LANGKAH[s.status] || s.status}</span>
                    </div>
                    {s.dokumenId && (
                      <button className="btn btn-sm" onClick={() => onOpenDoc(s.dokumenId, { view: 'paket' })}>Buka</button>
                    )}
                    {s.status === 'gagal' && job.status === 'gagal' && (
                      <button className="btn btn-sm btn-primary" onClick={lanjutkan}>Ulangi langkah ini</button>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
          {job.status === 'gagal' && (
            <div className="alert" style={{ marginTop: 16 }}>
              <b>Paket terhenti:</b> {job.error || 'Terjadi kendala.'}
              {langkah.some((s) => s.status === 'gagal') && (
                <p style={{ margin: '8px 0 0' }}>
                  Langkah yang gagal: {langkah.filter((s) => s.status === 'gagal').map((s) => s.label).join(', ')}.
                  Langkah yang sudah selesai tidak diulang.
                </p>
              )}
              <div className="btn-row">
                <button className="btn btn-primary" onClick={lanjutkan}>Lanjutkan dari yang gagal</button>
                <button className="btn" onClick={batalkan}>Batalkan</button>
              </div>
            </div>
          )}
          {!['gagal', 'menunggu_review'].includes(job.status) && (
            <div className="btn-row">
              <button className="btn" onClick={batalkan}>Batalkan</button>
            </div>
          )}
          <p className="hint">Aman menutup halaman ini. Pantau lagi dari Generator Paket.</p>
        </>
      )}

      {tahap === 'selesai' && job && (
        <>
          <StempelSelesai
            teks="Paket selesai disusun"
            subteks="Semua dokumen tersimpan. Klik untuk membuka dan mengeditnya."
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {hasil.map((h) => (
              <div key={h.dokumenId} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                <div>
                  <span className="chip red">{DOC_TYPES[h.docType]?.nama || h.docType}</span>
                  <b style={{ display: 'block', marginTop: 6 }}>{h.judul}</b>
                  {h.topik && <span className="hint">{h.topik}</span>}
                </div>
                <button className="btn btn-sm btn-ink" onClick={() => onOpenDoc(h.dokumenId, { view: 'paket' })}>Buka</button>
              </div>
            ))}
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => { setTahap('form'); setJob(null); cekJobAktif(); window.scrollTo(0, 0); }}>Buat paket baru</button>
            <button className="btn" onClick={onBack}>Kembali ke Beranda</button>
          </div>
        </>
      )}

      {paywall && (
        <Paywall
          mode={paywall.mode}
          detail={paywall.detail}
          waLink={waLink}
          onClose={() => setPaywall(null)}
        />
      )}
    </div>
  );
}
