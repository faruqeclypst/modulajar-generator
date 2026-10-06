import { useEffect, useRef, useState } from 'react';
import { FASE, MODEL } from '../lib/referensi';
import { DOC_TYPES, FIELD_LABEL, SEMESTER } from '../lib/docs';
import { generateDocStream, rekomendasiAI, extractTitle, buangJudulGanda, rapikanIdentitas, getProfile, saveProfile } from '../lib/api';
import { parseProsemWeeks } from '../lib/prosem';
import { saveDraft, getDraft, clearDraft, saveModul, listPakets, getPaket, getModul, listModuls, listProjects, getProject } from '../lib/db';
import FormulirDasar from './FormulirDasar';
import DocEditor from './DocEditor';
import ProsesLive from './ProsesLive';
import Paywall from './Paywall';
import { buatTugas, tugasTahap, tugasTulisan, tugasTulisanReset, tugasSelesai, tugasGagal, tutupTugas, cariTugas, langgananTugas } from '../lib/tugasLatar';

// Jenis dokumen yang wajib/sangat disarankan memakai acuan perencanaan
const ACUAN_TYPES = ['modul', 'lkpd', 'soal', 'kktp'];

const STEPS = ['Dokumen', 'Informasi', 'Materi', 'Generate', 'Editor'];

const emptyForm = {
  docType: 'modul', jenjang: 'SMA/MA', fase: '', kelas: '', semester: 'Ganjil',
  mapel: '', topik: '', alokasi: '', model: MODEL[0], materi: '',
  jmlPG: '10', jmlUraian: '5',
  jmlPertemuan: '1', // best practice: 1 modul = 1 bab = N pertemuan (mode manual tanpa Prosem)
  nama: '', nip: '', sekolah: '', tahunAjaran: '',
};

function formAwal(preselectDocType, initial) {
  return { ...emptyForm, docType: preselectDocType || 'modul', ...getProfile(), ...(initial?.form || {}) };
}

export default function Wizard({ onDone, onCancel, initial, preselectPaketId, preselectProjectId, preselectDocType, preselectModulId, waLink, kuota, onKuotaChanged, tugasId }) {
  // Mode terlampir: pengguna kembali dari kartu floating saat generate berjalan di latar.
  const [tugas, setTugas] = useState(() => (tugasId ? cariTugas(tugasId) : null));
  const terhidrasi = useRef(false);
  useEffect(() => {
    if (!tugasId) return;
    return langgananTugas((daftar) => {
      const t = daftar.find((x) => x.id === tugasId);
      setTugas(t || null);
    });
  }, [tugasId]);
  // Bila tugas terlampir selesai saat ditonton, hidrasikan editor dari hasilnya.
  useEffect(() => {
    if (!tugasId || terhidrasi.current) return;
    if (tugas?.state === 'selesai' && tugas.hasil?.markdown) {
      terhidrasi.current = true;
      const h = tugas.hasil;
      try {
        setForm((f) => ({ ...f, ...(h.form || {}) }));
        setImages(h.images || []);
        if (h.projectId) setProjectId(h.projectId);
        if (h.paketId) setPaketId(String(h.paketId));
        if (h.modulAcuanId) setModulAcuanId(String(h.modulAcuanId));
        setMarkdown(h.markdown);
        setStep(6);
      } catch { /* abaikan */ }
    }
  }, [tugasId, tugas?.state]);
  // Langkah awal: preselect (tombol turunan) -> 2; draft tersimpan -> step draft; default 1.
  // Hanya langkah yang punya tampilan (1,2,3,4,6) yang dipulihkan.
  const [step, setStep] = useState(() => {
    if (preselectPaketId || preselectProjectId || preselectModulId) return 2;
    const s = Number(initial?.step);
    return [1, 2, 3, 4, 6].includes(s) ? s : 1;
  });
  const [form, setForm] = useState(() => formAwal(preselectDocType, initial));
  const [loading, setLoading] = useState(false);
  const [tahapLive, setTahapLive] = useState([]);   // [{key,label}] tahapan asli dari server
  const [statusLive, setStatusLive] = useState({}); // {key: 'tunggu'|'jalan'|'ok'}
  const [tulisan, setTulisan] = useState([]);       // [{key,label,teks}] tulisan AI realtime per tahap
  const labelMap = useRef({});                     // key tahap -> label (untuk segmen tulisan)
  const tugasIdRef = useRef(null);               // id tugas latar (tetap hidup saat pindah halaman)
  const [paywall, setPaywall] = useState(null);    // {mode, detail}
  const [error, setError] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [images, setImages] = useState([]);
  const [rekom, setRekom] = useState(null);
  const [rekomLoading, setRekomLoading] = useState(false);
  const [draftNote, setDraftNote] = useState('');
  const [pakets, setPakets] = useState([]);
  const [paketId, setPaketId] = useState('');
  const [paketDocs, setPaketDocs] = useState({});
  const [paketLabel, setPaketLabel] = useState('');
  const [prosemWeeks, setProsemWeeks] = useState([]);
  const [weekIxs, setWeekIxs] = useState([]); // multi-pilih minggu (modul = 1 bab)
  const [weekIx, setWeekIx] = useState('');
  const [modulLabel, setModulLabel] = useState('');
  const [modulList, setModulList] = useState([]);
  const [modulAcuanId, setModulAcuanId] = useState('');
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(preselectProjectId || '');
  const [project, setProject] = useState(null);
  const [semuaDocs, setSemuaDocs] = useState([]);
  const [dokAcuanIds, setDokAcuanIds] = useState([]);

  const dt = DOC_TYPES[form.docType];
  const butuhAcuan = ACUAN_TYPES.includes(form.docType);

  // muat paket perencanaan + daftar dokumen tersimpan untuk acuan
  useEffect(() => {
    if (!butuhAcuan) return;
    (async () => {
      setPakets(await listPakets());
      const all = await listModuls();
      for (const m of all) if (!m.docType) m.docType = 'modul'; // normalisasi dokumen lama
      setSemuaDocs(all);
      setModulList(all.filter((m) => m.docType === 'modul'));
    })();
  }, [butuhAcuan, step]);

  // Prefill dari paket (tombol "Buat Modul Ajar dari Paket Ini")
  useEffect(() => {
    if (!preselectPaketId) return;
    setPaketId(String(preselectPaketId));
    (async () => {
      const p = await getPaket(preselectPaketId);
      if (p) {
        setPaketLabel(`${p.mapel} · ${p.kelas || p.fase} · Sem ${p.semester} · ${p.tahunAjaran}`);
        let cpDoc = null;
        try { if (p.docs?.cp) cpDoc = await getModul(p.docs.cp); } catch { /* abaikan */ }
        setForm((f) => ({
        ...f,
        nama: f.nama || cpDoc?.nama || '',
        sekolah: f.sekolah || cpDoc?.sekolah || '',
        jenjang: p.jenjang || f.jenjang,
        fase: p.fase || f.fase,
        kelas: p.kelas || f.kelas,
        semester: p.semester || f.semester,
        mapel: p.mapel || f.mapel,
        tahunAjaran: p.tahunAjaran || f.tahunAjaran,
      }));
      }
    })();
  }, [preselectPaketId]);

  // Daftar proyek untuk pemilih di langkah Informasi
  useEffect(() => {
    listProjects().then(setProjects).catch(() => {});
  }, []);

  // Pilih proyek: prefill info + acuan otomatis dari perencanaan proyek itu.
  // Pemilih acuan manual (paket/modul/dokumen) tetap bisa diubah setelahnya.
  useEffect(() => {
    if (!projectId) { setProject(null); return; }
    (async () => {
      const p = await getProject(projectId).catch(() => null);
      if (!p) { setProject(null); return; }
      setProject(p);
      setForm((f) => ({
        ...f,
        jenjang: p.jenjang || f.jenjang,
        fase: p.fase || f.fase,
        kelas: p.kelas || f.kelas,
        semester: p.semester || f.semester,
        mapel: p.mapel || f.mapel,
        tahunAjaran: p.tahunAjaran || f.tahunAjaran,
      }));
      if (p.paketId) setPaketId(String(p.paketId));
    })();
  }, [projectId]);

  // Prefill dari modul (tombol "Buat LKPD / Bank Soal / KKTP" di halaman modul)
  useEffect(() => {
    if (!preselectModulId) return;
    (async () => {
      let m = null;
      try { m = await getModul(Number(preselectModulId)); } catch { /* jaringan bermasalah: abaikan prefill */ }
      if (!m) return;
      setModulAcuanId(String(m.id));
      setModulLabel(m.judul || 'Modul Ajar');
      if (m.paketId) setPaketId(String(m.paketId));
      setForm((f) => ({
        ...f,
        jenjang: m.jenjang || f.jenjang,
        fase: m.fase || f.fase,
        kelas: m.kelas || f.kelas,
        semester: m.semester || f.semester,
        mapel: m.mapel || f.mapel,
        topik: m.topik || f.topik,
        alokasi: m.alokasi || f.alokasi,
        model: m.model || f.model,
        nama: f.nama || m.nama || '',
        sekolah: f.sekolah || m.sekolah || '',
        tahunAjaran: f.tahunAjaran || m.tahunAjaran || '',
      }));
    })();
  }, [preselectModulId]);

  useEffect(() => {
    if (!paketId) {
      setPaketDocs({}); setProsemWeeks([]); setWeekIx(''); setWeekIxs([]);
      setForm((f) => ({ ...f, pertemuanList: null })); // jangan biarkan daftar pertemuan basi
      return;
    }
    (async () => {
      const p = await getPaket(paketId);
      const docs = (p && p.docs) || {};
      setPaketDocs(docs);
      if (docs.prosem) {
        let d = null;
        try { d = await getModul(docs.prosem); } catch { /* jaringan bermasalah: abaikan */ }
        setProsemWeeks(parseProsemWeeks(d?.markdown));
      } else {
        setProsemWeeks([]);
      }
      setWeekIx(''); setWeekIxs([]);
    })();
  }, [paketId]);

  // Dokumen yang sudah tercakup paket / modul acuan tidak boleh dipilih lagi sebagai acuan tambahan
  useEffect(() => {
    const terpakai = new Set([...Object.values(paketDocs).map(String), ...(modulAcuanId ? [String(modulAcuanId)] : [])]);
    setDokAcuanIds((prev) => prev.filter((id) => !terpakai.has(String(id))));
  }, [paketDocs, modulAcuanId]);

  function toggleDokAcuan(id) {
    setDokAcuanIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Opsi dokumen tersimpan untuk acuan tambahan, dikelompokkan per jenis dokumen
  const idTerpakaiAcuan = new Set([...Object.values(paketDocs).map(String), ...(modulAcuanId ? [String(modulAcuanId)] : [])]);
  const dokAcuanOptions = semuaDocs.filter((d) => !idTerpakaiAcuan.has(String(d.id)));
  const grupDokAcuan = {};
  for (const d of dokAcuanOptions) {
    const t = d.docType || 'modul';
    (grupDokAcuan[t] = grupDokAcuan[t] || []).push(d);
  }
  const urutanGrupDok = Object.keys(grupDokAcuan).sort((a, b) =>
    ((DOC_TYPES[a] || {}).nama || a).localeCompare(((DOC_TYPES[b] || {}).nama || b), 'id'));

  function pilihMinggu(ix) {
    setWeekIx(ix);
    if (ix === '') return;
    const w = prosemWeeks[Number(ix)];
    if (w) setForm((f) => ({ ...f, topik: w.materi, alokasi: w.alokasi, pertemuanList: null }));
  }

  function terapkanPilihanMinggu(ixs) {
    // Pilihan minggu Prosem untuk modul: satu modul = satu bab = beberapa pertemuan.
    const sorted = [...new Set(ixs)].sort((a, b) => a - b);
    setWeekIxs(sorted);
    setWeekIx('');
    const daftar = sorted.map((x) => prosemWeeks[x]).filter(Boolean);
    setForm((f) => ({
      ...f,
      topik: daftar.map((w) => w.materi).join('; '),
      alokasi: daftar.length > 1 ? `${daftar.length} pertemuan` : (daftar[0]?.alokasi || f.alokasi),
      pertemuanList: daftar.length > 1 ? daftar.map((w) => ({ materi: w.materi, alokasi: w.alokasi })) : null,
    }));
  }

  function toggleMinggu(ix) {
    terapkanPilihanMinggu(weekIxs.includes(ix) ? weekIxs.filter((x) => x !== ix) : [...weekIxs, ix]);
  }

  // Best practice: 1 modul = 1 bab = N pertemuan.
  // - Dari Prosem: pertemuanList dibangun oleh terapkanPilihanMinggu (checkbox minggu).
  // - Manual (tanpa Prosem): dibangun dari jumlah pertemuan yang diisi guru;
  //   AI membagi materi bab secara runtut per pertemuan.
  function daftarPertemuanManual() {
    const n = Math.min(12, Math.max(1, parseInt(form.jmlPertemuan, 10) || 1));
    if (form.docType !== 'modul' || form.pertemuanList || prosemWeeks.length > 0 || n < 2 || !form.topik.trim()) return null;
    return Array.from({ length: n }, () => ({
      materi: form.topik.trim(),
      alokasi: (form.alokasi || '').trim() || '2 x 45 menit',
    }));
  }

  useEffect(() => {
    if (markdown) return;
    const t = setTimeout(async () => {
      await saveDraft({ form, step });
      setDraftNote('Draft tersimpan otomatis ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    }, 1200);
    return () => clearTimeout(t);
  }, [form, step, markdown]);

  useEffect(() => {
    if (form.jenjang && !FASE[form.jenjang].includes(form.fase)) {
      setForm((f) => ({ ...f, fase: FASE[f.jenjang][0], mapel: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.jenjang]);

  // simpan profil otomatis
  useEffect(() => {
    saveProfile({ nama: form.nama, nip: form.nip, sekolah: form.sekolah, tahunAjaran: form.tahunAjaran });
  }, [form.nama, form.nip, form.sekolah, form.tahunAjaran]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const has = (f) => dt.fields.includes(f);
  const canNext2 = form.mapel && (has('topik') ? form.topik.trim() : true);

  async function mintaRekomendasi() {
    setRekomLoading(true);
    setError('');
    try {
      // Dari paket: kirim daftar minggu Prosem agar rekomendasi selaras perencanaan paket.
      const r = await rekomendasiAI({
        jenjang: form.jenjang, fase: form.fase, mapel: form.mapel, topik: form.topik,
        prosem: prosemWeeks.length > 0
          ? prosemWeeks.slice(0, 30).map((w) => ({ minggu: w.minggu, materi: w.materi, alokasi: w.alokasi, tp: (w.tp || '').slice(0, 400) }))
          : undefined,
      });
      setRekom(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setRekomLoading(false);
    }
  }

  function pakaiRekomendasi() {
    if (!rekom) return;
    const ixs = (Array.isArray(rekom.mingguIxs) ? rekom.mingguIxs : (Number.isInteger(rekom.mingguIx) ? [rekom.mingguIx] : []))
      .filter((x) => Number.isInteger(x) && x >= 0 && x < prosemWeeks.length);
    if (ixs.length > 0 && form.docType === 'modul') {
      // Rekomendasi berbasis Prosem: centang kelompok minggu (satu bab = beberapa pertemuan)
      terapkanPilihanMinggu(ixs);
      setForm((f) => ({ ...f, model: rekom.model || f.model }));
    } else if (ixs.length === 1) {
      // Rekomendasi berbasis Prosem (dokumen non-modul): pilih minggunya
      pilihMinggu(String(ixs[0]));
      setForm((f) => ({ ...f, model: rekom.model || f.model }));
    } else {
      setForm((f) => ({
        ...f,
        topik: f.topik || rekom.judul,
        model: rekom.model || f.model,
        alokasi: rekom.alokasi || f.alokasi,
      }));
    }
    setRekom(null);
  }

  async function buildSumber() {
    // Ambil satu dokumen acuan; gagal jaringan -> lewati (jangan gagalkan generate)
    const ambilAman = async (id) => {
      try { return await getModul(id); } catch { return null; }
    };
    const parts = [];
    for (const key of ['cp', 'analisis_cp', 'tp', 'atp', 'distribusi_jp', 'prota', 'prosem']) {
      const id = paketDocs[key];
      if (!id) continue;
      const d = await ambilAman(id);
      if (d?.markdown) parts.push(`===== ${DOC_TYPES[key].nama.toUpperCase()} =====\n${d.markdown}`);
    }
    if (modulAcuanId) {
      const d = await ambilAman(Number(modulAcuanId));
      if (d?.markdown) parts.push(`===== MODUL AJAR ACUAN: ${d.judul} =====\n${d.markdown}`);
    }
    // Dokumen tersimpan tambahan yang dicentang (maks 8000 karakter per dokumen)
    const terpakaiSumber = new Set([...Object.values(paketDocs).map(String), ...(modulAcuanId ? [String(modulAcuanId)] : [])]);
    for (const id of dokAcuanIds) {
      if (terpakaiSumber.has(String(id))) continue;
      const d = await ambilAman(Number(id));
      if (!d?.markdown) continue;
      const jenis = ((DOC_TYPES[d.docType] || {}).nama || 'Dokumen').toUpperCase();
      let isi = d.markdown;
      if (isi.length > 8000) isi = isi.slice(0, 8000) + '\n…(dipotong)';
      parts.push(`===== ${jenis}: ${d.judul} =====\n${isi}`);
    }
    return parts.join('\n\n');
  }

  // Tandai satu tahap sebagai berjalan; tahap sebelumnya yang masih 'jalan' jadi 'ok'
  function tandaiTahap(key, label) {
    labelMap.current[key] = label;
    setTahapLive((prev) => (prev.some((p) => p.key === key) ? prev : [...prev, { key, label }]));
    setStatusLive((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (next[k] === 'jalan') next[k] = 'ok';
      next[key] = 'jalan';
      return next;
    });
    if (tugasIdRef.current) tugasTahap(tugasIdRef.current, key, label);
  }

  // Tambahkan delta teks ke segmen tahap yang sesuai (buat segmen bila belum ada)
  function tambahTulisan(key, delta) {
    const label = labelMap.current[key] || key;
    setTulisan((prev) => {
      const ix = prev.findIndex((s) => s.key === key);
      if (ix === -1) return [...prev, { key, label, teks: delta }];
      const next = [...prev];
      next[ix] = { ...next[ix], teks: next[ix].teks + delta };
      return next;
    });
    if (tugasIdRef.current) tugasTulisan(tugasIdRef.current, key, delta, label);
  }

  // Reset segmen tahap (dipakai saat server mengulang stream tahap yang dikoreksi)
  function resetTulisan(key) {
    setTulisan((prev) => {
      const ix = prev.findIndex((s) => s.key === key);
      if (ix === -1) return prev;
      const next = [...prev];
      next[ix] = { ...next[ix], teks: '' };
      return next;
    });
    if (tugasIdRef.current) tugasTulisanReset(tugasIdRef.current, key);
  }

  async function handleGenerate() {
    if (loading) return; // cegah double-submit
    setError('');
    setPaywall(null);
    setLoading(true);
    setTahapLive([]);
    setStatusLive({});
    setTulisan([]);
    labelMap.current = {};
    // Daftarkan ke tugas latar agar progress tetap tampil (floating) saat pindah halaman.
    const tid = buatTugas({ judul: 'Menyusun ' + (DOC_TYPES.find((d) => d.key === form.docType)?.nama || 'dokumen'), konteks: 'wizard', aksi: { kembali: 'Lihat proses' } });
    tugasIdRef.current = tid;
    try {
      const sumber = butuhAcuan ? await buildSumber() : '';
      let md = '';
      let imgs = [];
      // info: profil (nip, kepala sekolah, ...) sebagai dasar, form menimpa.
      // Best practice 1 modul = 1 bab = N pertemuan: daftar manual disuntik
      // bila guru mengisi jumlah pertemuan tanpa Prosem.
      const manual = daftarPertemuanManual();
      const infoKirim = { ...getProfile(), ...form, ...(manual ? { pertemuanList: manual } : {}) };
      await generateDocStream(form.docType, infoKirim, form.materi, sumber, null, (ev) => {
        if (ev.tipe === 'tahap') tandaiTahap(ev.key, ev.label);
        else if (ev.tipe === 'teks') tambahTulisan(ev.key, ev.delta || '');
        else if (ev.tipe === 'teks-reset') resetTulisan(ev.key);
        else if (ev.tipe === 'selesai') {
          md = ev.markdown || '';
          imgs = ev.images || [];
          setImages(imgs); // gambar sudah disisipkan server ke naskah
          setStatusLive((prev) => {
            const next = { ...prev };
            for (const k of Object.keys(next)) next[k] = 'ok';
            return next;
          });
        } else if (ev.tipe === 'gagal') throw new Error(ev.error || 'Generate gagal.');
      });
      if (!md.trim()) throw new Error('AI mengembalikan dokumen kosong.');
      // Simpan hasil ke tugas latar: bila pengguna pindah halaman lalu kembali
      // via kartu floating, editor bisa dipulihkan dari sini.
      tugasSelesai(tid, {
        markdown: md, images: imgs,
        form: { ...form }, projectId: projectId || null,
        paketId: paketId ? Number(paketId) : null,
        modulAcuanId: modulAcuanId ? Number(modulAcuanId) : null,
      });
      setMarkdown(md);
      setStep(6);
      await clearDraft();
      onKuotaChanged && onKuotaChanged();
    } catch (e) {
      // Kuota habis → buka Paywall, jangan tampilkan error mentah
      if (tugasIdRef.current) tugasGagal(tugasIdRef.current, e.code === 'kuota_habis' ? 'Kredit habis.' : (e.message || 'Generate gagal.'));
      if (e.code === 'kuota_habis') setPaywall({ mode: 'kuota_habis', detail: e.detail });
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(finalMd, finalImgs) {
    const judul = extractTitle(finalMd);
    const cleanMd = buangJudulGanda(rapikanIdentitas(finalMd), judul);
    const id = await saveModul({
      docType: form.docType, judul,
      jenjang: form.jenjang, fase: form.fase, kelas: form.kelas, semester: form.semester,
      mapel: form.mapel, topik: form.topik, alokasi: form.alokasi, model: form.model,
      nama: form.nama, sekolah: form.sekolah, tahunAjaran: form.tahunAjaran,
      markdown: cleanMd, images: finalImgs,
      projectId: projectId || undefined,
      paketId: paketId ? Number(paketId) : undefined,
      modulAcuanId: modulAcuanId ? Number(modulAcuanId) : undefined,
    });
    if (tugasIdRef.current) tutupTugas(tugasIdRef.current);
    if (tugasId) tutupTugas(tugasId);
    onDone(id);
  }

  const showMateri = dt.materi;

  return (
    <div className="wrap wizard">
      {/* Mode terlampir: kembali dari kartu floating saat generate masih berjalan */}
      {tugasId && tugas?.state === 'jalan' && (
        <div className="card">
          <span className="kicker">Kembali ke proses</span>
          <p className="hint" style={{ marginTop: 0 }}>
            Kamu kembali ke proses yang berjalan di latar. Biarkan halaman ini terbuka atau pindah lagi — progress tetap tampil di kartu mengambang.
          </p>
          <ProsesLive judul={tugas.judul} tahap={tugas.tahap} status={tugas.status} tulisan={tugas.tulisan} />
          <div className="btn-row">
            <button type="button" className="btn" onClick={onCancel}>Ke dashboard</button>
          </div>
        </div>
      )}
      {tugasId && !tugas && (
        <div className="card">
          <span className="kicker">Proses tidak ditemukan</span>
          <p>Proses generate yang kamu tuju sudah selesai atau ditutup.</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={onCancel}>Ke dashboard</button>
          </div>
        </div>
      )}
      {(!tugasId || tugas?.state !== 'jalan' || !tugas) && (
      <>
      <div className="steps">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const hidden = (n === 3 && !showMateri) || (n === 5 && !dt.gambar);
          if (hidden) return null;
          return (
            <div key={s} className={'step' + (step === n ? ' active' : '') + (step > n ? ' done' : '')}>
              <span className="n">{String(n).padStart(2, '0')}</span>{s}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div className="card">
          <span className="kicker">Langkah 01</span>
          <h1 className="page">Pilih Dokumen</h1>
          <p className="lead">Perangkat ajar apa yang ingin disusun hari ini?</p>
          <div className="doc-grid" role="radiogroup" aria-label="Pilih jenis dokumen">
            {Object.entries(DOC_TYPES).map(([key, d]) => (
              <button
                key={key} type="button" role="radio" aria-checked={form.docType === key}
                className={'doc-card' + (form.docType === key ? ' selected' : '')}
                onClick={() => set('docType', key)}
              >
                <span className="chip red">{d.tag}</span>
                <h3>{d.nama}</h3>
                <p>{d.desc}</p>
              </button>
            ))}
          </div>
          <h3 style={{ marginTop: 24, fontSize: 15, textTransform: 'uppercase', letterSpacing: 1 }}>Identitas Guru</h3>
          <div className="grid2">
            <FormulirDasar
              nilai={form}
              onUbah={(patch) => setForm((f) => ({ ...f, ...patch }))}
              fields={['nama', 'nip', 'sekolah', 'tahunAjaran']}
              prefix="w1"
            />
          </div>
          <div className="btn-row">
            <button className="btn" onClick={onCancel}>Batal</button>
            <button className="btn btn-primary" onClick={() => setStep(2)}>Lanjut</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <span className="kicker">Langkah 02</span>
          <h1 className="page">{dt.nama}</h1>
          {paketLabel && !modulLabel && (
            <div className="alert alert-info" style={{ fontWeight: 700 }}>
              Membuat dari paket: {paketLabel}. TP dan materi akan merujuk dokumen perencanaan paket ini.
            </div>
          )}
          {modulLabel && (
            <div className="alert alert-info" style={{ fontWeight: 700 }}>
              Membuat {dt.nama} dari modul: {modulLabel}. Isi otomatis merujuk modul ini.
            </div>
          )}
          <p className="lead">Lengkapi informasi, atau minta AI memberi rekomendasi awal.</p>

          <div className="alert alert-info" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 200 }}>
              {prosemWeeks.length > 0
                ? (form.docType === 'modul'
                  ? 'Bingung mulai dari mana? AI akan memilihkan kelompok minggu berurutan dari Prosem paket ini untuk satu bab.'
                  : 'Bingung mulai dari mana? AI akan memilihkan minggu yang paling cocok dari Prosem paket ini.')
                : 'Bingung mulai dari mana? AI bisa merekomendasikan judul, model pembelajaran, dan alokasi waktu.'}
            </span>
            <button className="btn btn-sm btn-ink" onClick={mintaRekomendasi} disabled={rekomLoading || !form.mapel}
              title={!form.mapel ? 'Pilih mata pelajaran dulu untuk meminta rekomendasi AI.' : undefined}>
              {rekomLoading ? 'Meminta…' : 'Minta Rekomendasi AI'}
            </button>
            {!form.mapel && !rekomLoading && (
              <span className="hint" style={{ marginLeft: 8 }}>Pilih mata pelajaran dulu.</span>
            )}
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          {rekom && (
            <div className="rekom-box">
              <h4>Rekomendasi AI</h4>
              {(() => {
                const ixs = (Array.isArray(rekom.mingguIxs) ? rekom.mingguIxs : (Number.isInteger(rekom.mingguIx) ? [rekom.mingguIx] : []))
                  .filter((x) => Number.isInteger(x) && x >= 0 && x < prosemWeeks.length);
                return ixs.length > 0 && (
                  <p><strong>{ixs.length > 1 ? 'Kelompok minggu (satu bab):' : 'Minggu terpilih:'}</strong>{' '}
                    {ixs.map((x) => `Minggu ${prosemWeeks[x].minggu || (x + 1)}`).join(', ')} — {prosemWeeks[ixs[0]].materi.slice(0, 80)}{prosemWeeks[ixs[0]].materi.length > 80 ? '…' : ''}{ixs.length > 1 ? ' (+ ' + (ixs.length - 1) + ' pertemuan lain)' : ''}
                  </p>
                );
              })()}
              <p><strong>Judul:</strong> {rekom.judul}</p>
              <p><strong>Model:</strong> {rekom.model}</p>
              <p><strong>Alokasi:</strong> {rekom.alokasi}</p>
              {rekom.tp?.length > 0 && (
                <><p><strong>Usulan TP:</strong></p><ul>{rekom.tp.map((t, i) => <li key={i}>{t}</li>)}</ul></>
              )}
              {rekom.catatan && <p className="hint">{rekom.catatan}</p>}
              <div className="btn-row">
                <button className="btn btn-sm btn-primary" onClick={pakaiRekomendasi}>Pakai Rekomendasi</button>
                <button className="btn btn-sm" onClick={() => setRekom(null)}>Abaikan</button>
              </div>
            </div>
          )}

          {(preselectPaketId || preselectProjectId || preselectModulId) && (
            <>
              <h3 style={{ marginTop: 20, fontSize: 15, textTransform: 'uppercase', letterSpacing: 1 }}>Identitas Guru</h3>
              <div className="grid2">
                <FormulirDasar
                  nilai={form}
                  onUbah={(patch) => setForm((f) => ({ ...f, ...patch }))}
                  fields={['nama', 'nip', 'sekolah', 'tahunAjaran']}
                  prefix="w2a"
                />
              </div>
            </>
          )}
          <div className="field" style={{ maxWidth: 420 }}>
            <label>Proyek</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Tanpa proyek</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {[p.mapel, p.kelas].filter(Boolean).join(' ') || p.nama}
                </option>
              ))}
            </select>
            {project?.paketId
              ? <p className="hint">Info terisi otomatis. Acuan diambil dari perencanaan proyek ini.</p>
              : <p className="hint">Pilih proyek agar info terisi otomatis dan dokumen tersimpan di sana.</p>}
          </div>
          <div className="grid2">
            <FormulirDasar
              nilai={form}
              onUbah={(patch) => setForm((f) => ({ ...f, ...patch }))}
              fields={['jenjang', 'fase', 'kelas', 'semester', 'mapel'].filter(has)}
              wajib={['mapel']}
              prefix="w2b"
            />
            {has('alokasi') && (
              <div className="field"><label htmlFor="w2b-alokasi">Alokasi Waktu{form.docType === 'modul' && prosemWeeks.length === 0 && (parseInt(form.jmlPertemuan, 10) || 1) > 1 ? ' per pertemuan' : ''}</label>
                <input id="w2b-alokasi" placeholder="cth: 2 x 45 menit" value={form.alokasi} onChange={(e) => set('alokasi', e.target.value)} /></div>
            )}
          </div>
          {butuhAcuan && prosemWeeks.length > 0 && (has('topik')) && (
            <div className="card" style={{ margin: '0 0 16px', background: '#fbf9f4' }}>
              <h3 style={{ margin: '0 0 6px' }}>Pilih Materi dari Prosem</h3>
              {form.docType === 'modul' ? (
                <>
                  <p className="hint" style={{ margin: '0 0 12px' }}>
                    Satu modul mencakup <strong>satu bab</strong> yang terdiri dari beberapa pertemuan.
                    Centang minggu-minggu yang masuk dalam bab ini — kegiatan pembelajaran akan dibagi per pertemuan.
                  </p>
                  <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                    {prosemWeeks.map((w, i) => (
                      <label key={i} className="f-check" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                        <input
                          type="checkbox" checked={weekIxs.includes(i)} onChange={() => toggleMinggu(i)}
                          style={{ marginTop: 4, width: 17, height: 17, accentColor: 'var(--red)' }}
                        />
                        <span><strong>Minggu {w.minggu || (i + 1)}:</strong> {w.materi}{w.alokasi ? ` (${w.alokasi})` : ''}</span>
                      </label>
                    ))}
                  </div>
                  {weekIxs.length > 1 && (
                    <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
                      {weekIxs.length} pertemuan dipilih — modul ini akan memuat kegiatan per pertemuan.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="hint" style={{ margin: '0 0 12px' }}>
                    Tidak perlu ketik manual. Pilih minggu, materi dan alokasi waktu terisi otomatis dari Prosem paket ini.
                  </p>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Minggu / Materi</label>
                    <select value={weekIx} onChange={(e) => pilihMinggu(e.target.value)}>
                      <option value="">Pilih minggu</option>
                      {prosemWeeks.map((w, i) => (
                        <option key={i} value={i}>
                          Minggu {w.minggu || (i + 1)}: {w.materi.slice(0, 60)}{w.materi.length > 60 ? '…' : ''}{w.alokasi ? ` (${w.alokasi})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {weekIx !== '' && prosemWeeks[Number(weekIx)]?.tp && (
                    <div className="hint" style={{ marginTop: 8 }}>
                      <strong>TP minggu ini:</strong> {prosemWeeks[Number(weekIx)].tp.slice(0, 220)}
                      {prosemWeeks[Number(weekIx)].tp.length > 220 ? '…' : ''}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {form.docType === 'modul' && prosemWeeks.length === 0 && has('topik') && (
            <div className="card" style={{ margin: '0 0 16px', background: '#fbf9f4' }}>
              <h3 style={{ margin: '0 0 6px' }}>Struktur Bab</h3>
              <p className="hint" style={{ margin: '0 0 12px' }}>
                Satu modul = <strong>satu bab</strong>. Tanpa Prosem, tentukan sendiri bab ini dibagi menjadi berapa pertemuan.
              </p>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="w2b-jmlpertemuan">Jumlah pertemuan dalam bab ini</label>
                <input id="w2b-jmlpertemuan" type="number" min="1" max="12" style={{ maxWidth: 120 }}
                  value={form.jmlPertemuan || '1'} onChange={(e) => set('jmlPertemuan', e.target.value)} />
              </div>
              {daftarPertemuanManual() && (
                <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
                  {daftarPertemuanManual().length} pertemuan — AI akan membagi materi bab secara runtut,
                  masing-masing {daftarPertemuanManual()[0].alokasi}.
                </p>
              )}
            </div>
          )}
          {has('topik') && (
            <div className="field"><label>{FIELD_LABEL.topik} <span className="req">*</span></label>
              <input placeholder="cth: Sistem Jaringan Komputer dan Internet" value={form.topik} onChange={(e) => set('topik', e.target.value)} /></div>
          )}
          <div className="grid2">
            {has('model') && (
              <div className="field"><label>Model Pembelajaran</label>
                <select value={form.model} onChange={(e) => set('model', e.target.value)}>
                  <option value="auto">Otomatis (AI pilihkan yang cocok)</option>
                  {MODEL.map((m) => <option key={m}>{m}</option>)}
                </select></div>
            )}
            {has('jmlPG') && (
              <div className="field"><label>Jumlah Soal PG</label>
                <input type="number" min="1" max="50" value={form.jmlPG} onChange={(e) => set('jmlPG', e.target.value)} /></div>
            )}
            {has('jmlUraian') && (
              <div className="field"><label>Jumlah Soal Uraian</label>
                <input type="number" min="1" max="20" value={form.jmlUraian} onChange={(e) => set('jmlUraian', e.target.value)} /></div>
            )}
          </div>
          {draftNote && <div className="hint" style={{ fontSize: 12, color: '#6f6e68', fontWeight: 600 }}>{draftNote}</div>}
          <div className="btn-row">
            <button className="btn" onClick={() => setStep(1)}>Kembali</button>
            <button className="btn btn-primary" disabled={!canNext2} onClick={() => setStep(showMateri ? 3 : 4)}>Lanjut</button>
          </div>
        </div>
      )}

      {step === 3 && showMateri && (
        <div className="card">
          <span className="kicker">Langkah 03</span>
          <h1 className="page">Materi Sumber</h1>
          <p className="lead">Tempel materi sebagai acuan AI. Boleh dikosongkan.</p>
          <div className="field">
            <label>Materi (opsional)</label>
            <textarea placeholder="Tempel teks materi, ringkasan bab, atau poin penting…" value={form.materi} onChange={(e) => set('materi', e.target.value)} />
            <div className="hint">{form.materi.length} karakter</div>
          </div>
          {(form.docType === 'lkpd' || form.docType === 'modul') && (
            <div className="alert alert-info">
              Butuh inspirasi? Cari LKPD/worksheet dan materi sejenis di{' '}
              <a href="https://wayground.com/" target="_blank" rel="noreferrer"><strong>Wayground</strong></a>
              {' '}(gratis, jutaan buatan guru). Lalu tempel poin-poin pentingnya sebagai materi sumber di atas.
            </div>
          )}
          <div className="btn-row">
            <button className="btn" onClick={() => setStep(2)}>Kembali</button>
            <button className="btn btn-primary" onClick={() => setStep(4)}>Lanjut</button>
          </div>
        </div>
      )}

      {step === 4 && !loading && (
        <div className="card">
          <span className="kicker">Langkah 04</span>
          <h1 className="page">Generate AI</h1>
          <p className="lead">AI akan menyusun <strong>{dt.nama}</strong> dari data berikut:</p>
          <div className="meta" style={{ marginBottom: 16 }}>
            <span className="chip fill">{form.jenjang}</span>
            {form.fase && <span className="chip">{form.fase}</span>}
            {form.mapel && <span className="chip">{form.mapel}</span>}
            {form.docType === 'modul' && ((form.pertemuanList && form.pertemuanList.length > 1)
              ? <span className="chip">{form.pertemuanList.length} pertemuan (1 bab)</span>
              : daftarPertemuanManual()
                ? <span className="chip">{daftarPertemuanManual().length} pertemuan (1 bab)</span>
                : null)}
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          {butuhAcuan && (
            <div className="card" style={{ margin: '0 0 16px', background: '#fbf9f4' }}>
              <h3 style={{ margin: '0 0 6px' }}>Sumber Acuan</h3>
              <p className="hint" style={{ margin: '0 0 12px' }}>
                {dt.nama}{' '}yang kredibel diturunkan dari dokumen yang sudah disusun.
                Acuan bisa dari paket perencanaan, dokumen tersimpan, atau keduanya.
                Pilih yang relevan agar AI merujuk dokumen tersebut, bukan mengarang.
              </p>
              <div className="field">
                <label>Paket Perencanaan</label>
                <select value={paketId} onChange={(e) => setPaketId(e.target.value)}>
                  <option value="">Tanpa acuan</option>
                  {pakets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.mapel} · {p.kelas || p.fase} · Sem {p.semester} · {p.tahunAjaran}
                    </option>
                  ))}
                </select>
              </div>
              {paketId && (
                <div className="meta" style={{ marginBottom: 4 }}>
                  {['cp', 'analisis_cp', 'tp', 'atp', 'distribusi_jp', 'prota', 'prosem'].map((k) => (
                    <span key={k} className="chip" style={paketDocs[k] ? { background: '#1a1a1a', color: '#fff' } : { opacity: 0.45 }}>
                      {DOC_TYPES[k].nama}{paketDocs[k] ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
              )}
              {paketId && prosemWeeks.length > 0 && has('topik') && form.docType !== 'modul' && (
                <div className="field" style={{ marginTop: 10 }}>
                  <label>Pilih Materi dari Prosem (otomatis isi topik & alokasi)</label>
                  <select value={weekIx} onChange={(e) => pilihMinggu(e.target.value)}>
                    <option value="">Pilih minggu</option>
                    {prosemWeeks.map((w, i) => (
                      <option key={i} value={i}>
                        Minggu {w.minggu || (i + 1)}: {w.materi.slice(0, 60)}{w.materi.length > 60 ? '…' : ''}{w.alokasi ? ` (${w.alokasi})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {pakets.length === 0 && (
                <div className="hint">Belum ada paket perencanaan. Susun dulu lewat <strong>Ruang Perencanaan</strong> di dashboard agar alurnya benar.</div>
              )}
              {(form.docType === 'lkpd' || form.docType === 'soal' || form.docType === 'kktp') && modulList.length > 0 && (
                <div className="field" style={{ marginTop: 10 }}>
                  <label>Modul Ajar Acuan (opsional)</label>
                  {modulAcuanId && (
                    <div className="meta" style={{ margin: '0 0 8px' }}>
                      <span className="chip" style={{ background: 'var(--red)', color: '#fff' }}>
                        Modul acuan: {(modulList.find((m) => String(m.id) === String(modulAcuanId)) || {}).judul?.slice(0, 60) || 'terpilih'}
                      </span>
                    </div>
                  )}
                  <select value={modulAcuanId} onChange={(e) => setModulAcuanId(e.target.value)}>
                    <option value="">Tidak ada</option>
                    {modulList.map((m) => <option key={m.id} value={m.id}>{m.judul}</option>)}
                  </select>
                </div>
              )}
              {preselectPaketId && (
                <p className="hint" style={{ marginTop: 10 }}>
                  Acuan otomatis diambil dari paket ini (CP, ATP, Prota, Prosem di atas). Pilihan dokumen luar paket disembunyikan agar tidak tercampur.
                </p>
              )}
              {!preselectPaketId && (
              <div className="field" style={{ marginTop: 10 }}>
                <label id="lbl-dok-acuan">Dokumen lain sebagai acuan (opsional)</label>
                <p className="hint" style={{ margin: '0 0 8px' }}>
                  {dokAcuanIds.length > 0
                    ? `${dokAcuanIds.length} dokumen dipilih.`
                    : 'Centang dokumen tersimpan untuk dijadikan acuan tambahan.'}
                </p>
                {dokAcuanOptions.length > 0 ? (
                  <div className="dok-acuan-list" role="group" aria-labelledby="lbl-dok-acuan">
                    {urutanGrupDok.map((t) => (
                      <div key={t}>
                        <p className="dok-acuan-grup">{(DOC_TYPES[t] || {}).nama || t}</p>
                        <ul className="dok-acuan-ul">
                          {grupDokAcuan[t].map((d) => {
                            const cid = 'dok-acuan-' + d.id;
                            const aktif = dokAcuanIds.includes(d.id);
                            return (
                              <li key={d.id} className={aktif ? 'aktif' : ''}>
                                <input
                                  type="checkbox"
                                  id={cid}
                                  checked={aktif}
                                  onChange={() => toggleDokAcuan(d.id)}
                                />
                                <label htmlFor={cid}>{d.judul}</label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="hint" style={{ margin: 0 }}>
                    {semuaDocs.length === 0
                      ? 'Belum ada dokumen tersimpan.'
                      : 'Dokumen tersimpan sudah dipakai sebagai acuan di atas.'}
                  </p>
                )}
              </div>
              )}
            </div>
          )}
          <div className="alert alert-info">Proses generate membutuhkan ±30–60 detik. Boleh pindah halaman — progres tetap terlihat di kartu mengambang. Jangan tutup tab browser.</div>
          {error && (
            <div className="alert alert-error" role="alert" style={{ margin: '0 0 16px' }}>
              <b>Generate gagal.</b> {error}
              <br />Kredit tidak terpotong bila generate gagal.
              <div className="btn-row" style={{ marginTop: 10, marginBottom: 0 }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => { setError(''); handleGenerate(); }} disabled={loading}>
                  Coba lagi
                </button>
              </div>
            </div>
          )}
          {kuota && !kuota.admin && (
            <p className="hint" style={{ margin: '0 0 4px' }}>Sisa kredit minggu ini: <b>{kuota.sisa}</b> dari {kuota.batas}.</p>
          )}
          {kuota && kuota.admin && (
            <p className="hint" style={{ margin: '0 0 4px' }}>Kredit: tanpa batas (Admin).</p>
          )}
          <div className="btn-row">
            <button className="btn" onClick={() => setStep(showMateri ? 3 : 2)}>Kembali</button>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
              {loading ? 'Menyusun…' : 'Generate ' + dt.nama}
            </button>
          </div>
        </div>
      )}

      {step === 4 && loading && (
        <ProsesLive judul={'Menyusun ' + dt.nama} tahap={tahapLive} status={statusLive} tulisan={tulisan} />
      )}

      {step === 6 && (
        <EditorStep
          form={form} markdown={markdown} images={images}
          onBack={() => setStep(4)}
          onRegen={() => { setMarkdown(''); setStep(4); }}
          onSave={handleSave}
        />
      )}

      {paywall && (
        <Paywall
          mode={paywall.mode}
          detail={paywall.detail}
          waLink={waLink}
          onClose={() => setPaywall(null)}
        />
      )}
      </>
      )}
    </div>
  );
}

function EditorStep({ form, markdown, images, onBack, onRegen, onSave }) {
  const [md, setMd] = useState(markdown);
  const [imgs, setImgs] = useState(images);
  const [saving, setSaving] = useState(false);
  const [errSimpan, setErrSimpan] = useState('');
  const dt = DOC_TYPES[form.docType];

  async function save() {
    setSaving(true);
    setErrSimpan('');
    try { await onSave(md, imgs); }
    catch (e) { setErrSimpan(e?.message || 'Gagal menyimpan. Periksa koneksi, lalu coba lagi.'); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="toolbar no-print">
        <span className="kicker" style={{ margin: 0 }}>Editor Blok</span>
        <span className="draft-note">Klik blok untuk edit langsung · tombol AI untuk tulis ulang per blok</span>
      </div>
      <DocEditor
        initialMarkdown={md}
        images={imgs}
        docType={dt.nama}
        docTitle={extractTitle(md)}
        topic={form.topik}
        onChange={(newMd, newImgs) => { setMd(newMd); setImgs(newImgs); }}
      />
      <div className="btn-row no-print" style={{ marginBottom: 30 }}>
        <button className="btn" onClick={onBack}>Kembali</button>
        <button className="btn" onClick={onRegen}>Generate Ulang</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan ' + dt.nama}
        </button>
      </div>
      {errSimpan && <div className="alert alert-error no-print" role="alert">{errSimpan}</div>}
    </div>
  );
}

export { getDraft };
