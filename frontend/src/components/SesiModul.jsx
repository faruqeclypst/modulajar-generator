import { useEffect, useRef, useState } from 'react';
import { MODEL } from '../lib/referensi';
import { generateDocStream, getProfile, saveProfile, extractTitle } from '../lib/api';
import { getProject, getModul, saveModul, updateModul, getPaket } from '../lib/db';
import { parseMatriksProsem } from '../lib/prosem';
import { buatTugas, tugasTahap, tugasTulisan, tugasSelesai, tugasGagal, tutupTugas } from '../lib/tugasLatar';
import { kunciAkun } from '../lib/akunLokal';
import ProsesLive from './ProsesLive';
import DocEditor from './DocEditor';
import WawancaraGuru, { kompilasiPersona, ringkasanPersona } from './WawancaraGuru';
import Konfirmasi from './Konfirmasi';

// Sesi Modul Batch: generate banyak modul 1-klik berdasarkan dokumen perencanaan
// (CP, ATP, Prota, Prosem). Setiap modul dikonfirmasi user sebelum lanjut ke berikut:
// bisa Revisi (edit/regenerate) atau Lanjut. Nama guru/mapel bisa di-rename massal.
export default function SesiModul({ projectId, onBack, onOpenDoc, kuota, onKuotaChanged }) {
  const [project, setProject] = useState(null);
  const [docs, setDocs] = useState({}); // {cp, atp, prota, prosem} -> markdown
  const [topiks, setTopiks] = useState([]); // [{topik, alokasi}]
  const [topikBaru, setTopikBaru] = useState('');
  const [materiProsem, setMateriProsem] = useState([]); // [{materi, jp, ket}]
  const [pilihProsem, setPilihProsem] = useState([]); // index terpilih
  const [model, setModel] = useState('auto');
  const [namaGuru, setNamaGuru] = useState('');
  const [mapel, setMapel] = useState('');
  const [persona, setPersona] = useState(''); // teks profil guru dari wawancara
  const [personaRingkasan, setPersonaRingkasan] = useState(''); // versi ramah pengguna
  const [tahap, setTahap] = useState('wawancara'); // wawancara | setup | jalan | konfirmasi | selesai
  const [idx, setIdx] = useState(0);
  const [hasil, setHasil] = useState([]); // [{topik, docId, markdown}]
  const [skrg, setSkrg] = useState(null); // {topik, markdown, images} modul sedang dikonfirmasi
  const [busy, setBusy] = useState(false);
  const [tahapLive, setTahapLive] = useState([]);
  const [statusLive, setStatusLive] = useState({});
  const [tulisan, setTulisan] = useState([]);
  const [error, setError] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [sesiTerhenti, setSesiTerhenti] = useState(false); // draft punya progres -> tawarkan lanjutkan
  const [konf, setKonf] = useState(null);
  const labelMap = useRef({});
  const tugasIdRef = useRef(null);

  // Draft sesi: tahan refresh (topik, pengaturan, persona, progres)
  function kunciDraft() { return kunciAkun('ma-sesi-modul-' + projectId); }
  function simpanDraft() {
    try {
      localStorage.setItem(kunciDraft(), JSON.stringify({
        topiks, model, namaGuru, mapel, persona, personaRingkasan, idx, hasil,
      }));
    } catch { /* abaikan */ }
  }
  useEffect(() => {
    if (!project) return;
    simpanDraft();
  }, [topiks, model, namaGuru, mapel, persona, personaRingkasan, idx, hasil]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      const p = await getProject(projectId).catch(() => null);
      if (!p) { setError('Proyek tidak ditemukan.'); return; }
      setProject(p);
      const prof = getProfile();
      setNamaGuru(prof.nama || '');
      setMapel(p.mapel || '');
      // Pulihkan draft bila ada
      try {
        const raw = localStorage.getItem(kunciAkun('ma-sesi-modul-' + projectId));
        if (raw) {
          const d = JSON.parse(raw);
          if (Array.isArray(d.topiks) && d.topiks.length) setTopiks(d.topiks);
          if (d.model) setModel(d.model);
          if (d.namaGuru) setNamaGuru(d.namaGuru);
          if (d.mapel) setMapel(d.mapel);
          if (d.persona) { setPersona(d.persona); setTahap('setup'); }
          if (d.personaRingkasan) setPersonaRingkasan(d.personaRingkasan);
          if (Array.isArray(d.hasil) && d.hasil.length) {
            setHasil(d.hasil);
            setIdx(typeof d.idx === 'number' ? d.idx : d.hasil.length);
            setSesiTerhenti(true);
            setTahap('setup');
          }
        }
      } catch { /* abaikan */ }
      // Muat dokumen perencanaan sebagai acuan
      const d = {};
      try {
        const paket = p.paketId ? await getPaket(p.paketId).catch(() => null) : null;
        const docsMap = paket?.docs || {};
        for (const k of ['cp', 'atp', 'distribusi_jp', 'prota', 'prosem']) {
          if (docsMap[k]) {
            const md = await getModul(docsMap[k]).catch(() => null);
            if (md) d[k] = md.markdown || '';
          }
        }
      } catch { /* abaikan */ }
      setDocs(d);
      // Parse materi dari matriks prosem untuk picker
      if (d.prosem) {
        try { setMateriProsem(parseMatriksProsem(d.prosem)); } catch { /* abaikan */ }
      }
    })();
  }, [projectId]);

  function tambahTopik() {
    const t = topikBaru.trim();
    if (!t) return;
    setTopiks((prev) => [...prev, { topik: t, alokasi: '2 x 45 menit' }]);
    setTopikBaru('');
  }
  function hapusTopik(i) {
    setTopiks((prev) => prev.filter((_, ix) => ix !== i));
  }
  function semuaJadiModul() {
    if (!materiProsem.length) return;
    const menit = (getProfile().menitPerJP || 45);
    const baru = materiProsem.map((m) => ({
      topik: m.materi,
      alokasi: `${m.jp} JP (${m.jp * menit} menit)`,
      dariProsem: [m.materi],
    }));
    setTopiks((prev) => [...prev, ...baru]);
  }
  function gabungDariProsem() {
    if (!pilihProsem.length) return;
    const terpilih = pilihProsem.map((ix) => materiProsem[ix]).filter(Boolean);
    if (!terpilih.length) return;
    const gabungTopik = terpilih.map((m) => m.materi).join('; ');
    const totalJP = terpilih.reduce((a, m) => a + m.jp, 0);
    const menit = (getProfile().menitPerJP || 45);
    setTopiks((prev) => [...prev, {
      topik: gabungTopik,
      alokasi: `${totalJP} JP (${totalJP * menit} menit)`,
      dariProsem: terpilih.map((m) => m.materi),
    }]);
    setPilihProsem([]);
  }

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

  async function generateUntuk(topikObj, ix) {
    setBusy(true);
    setTahapLive([]); setStatusLive({}); setTulisan([]); labelMap.current = {};
    setError('');
    const tid = buatTugas({
      judul: `Menyusun Modul ${ix + 1}/${topiks.length}: ${topikObj.topik.slice(0, 40)}`,
      konteks: 'sesi-modul', aksi: { kembali: 'Lihat sesi modul' },
      meta: { projectId, idx: ix },
    });
    tugasIdRef.current = tid;
    try {
      const prof = getProfile();
      const info = {
        ...prof,
        nama: namaGuru || prof.nama,
        mapel: mapel || project.mapel,
        jenjang: project.jenjang, fase: project.fase, kelas: project.kelas,
        semester: project.semester, tahunAjaran: project.tahunAjaran,
        topik: topikObj.topik, alokasi: topikObj.alokasi,
        model: model, // 'auto' atau nama model spesifik
        docType: 'modul',
        personaGuru: persona, // profil guru dari wawancara (opsional)
        menitPerJP: getProfile().menitPerJP || 45,
      };
      // Gabungkan dokumen perencanaan sebagai sumber acuan
      const sumberParts = [];
      if (docs.cp) sumberParts.push('===== CP =====\n' + docs.cp.slice(0, 4000));
      if (docs.atp) sumberParts.push('===== ATP =====\n' + docs.atp.slice(0, 4000));
      if (docs.distribusi_jp) sumberParts.push('===== DISTRIBUSI JP =====\n' + docs.distribusi_jp.slice(0, 2000));
      if (docs.prota) sumberParts.push('===== PROTA =====\n' + docs.prota.slice(0, 3000));
      if (docs.prosem) sumberParts.push('===== PROSEM =====\n' + docs.prosem.slice(0, 3000));
      const sumber = sumberParts.join('\n\n');
      let md = '';
      let imgs = [];
      await generateDocStream('modul', info, topikObj.topik, sumber, null, (ev) => {
        if (ev.tipe === 'tahap') tandaiTahap(ev.key, ev.label);
        else if (ev.tipe === 'teks') tambahTulisan(ev.key, ev.delta || '');
        else if (ev.tipe === 'selesai') {
          md = ev.markdown || '';
          imgs = ev.images || [];
          setStatusLive((prev) => {
            const next = { ...prev };
            for (const k of Object.keys(next)) next[k] = 'ok';
            return next;
          });
        } else if (ev.tipe === 'gagal') throw new Error(ev.error || 'Generate gagal.');
      });
      if (!md.trim()) throw new Error('AI mengembalikan dokumen kosong.');
      tugasSelesai(tid, { idx: ix });
      setSkrg({ topik: topikObj.topik, alokasi: topikObj.alokasi, markdown: md, images: imgs });
      setTahap('konfirmasi');
      onKuotaChanged && onKuotaChanged();
    } catch (e) {
      if (tugasIdRef.current) tugasGagal(tugasIdRef.current, e.message || 'Generate gagal.');
      setError(e.message || 'Generate gagal.');
      setTahap('setup');
    } finally {
      setBusy(false);
    }
  }

  function mulaiSesi(dariIdx) {
    if (!topiks.length) { setError('Tambahkan minimal satu topik.'); return; }
    const mulai = typeof dariIdx === 'number' ? dariIdx : 0;
    if (mulai === 0) setHasil([]);
    setSesiTerhenti(false);
    setIdx(mulai);
    setTahap('jalan');
    generateUntuk(topiks[mulai], mulai);
  }

  // Paket lengkap: generate SEMUA modul sekaligus tanpa konfirmasi per modul
  async function paketLengkap() {
    if (!topiks.length) { setError('Tambahkan minimal satu topik (atau ambil dari Prosem).'); return; }
    if (busy) return;
    setError('');
    setHasil([]);
    setSesiTerhenti(false);
    setTahap('jalan');
    setBusy(true);
    const tid = buatTugas({ judul: `Paket Lengkap: ${topiks.length} Modul`, konteks: 'sesi-modul', aksi: { kembali: 'Lihat proses' } });
    tugasIdRef.current = tid;
    try {
      for (let ix = 0; ix < topiks.length; ix++) {
        setIdx(ix);
        const topikObj = topiks[ix];
        tugasTahap(tid, `modul-${ix}`, `Modul ${ix + 1}/${topiks.length}: ${topikObj.topik.slice(0, 40)}`);
        const info = {
          ...getProfile(),
          topik: topikObj.topik, alokasi: topikObj.alokasi,
          docType: 'modul',
          personaGuru: persona,
          menitPerJP: getProfile().menitPerJP || 45,
          // Rantai: kirim semua dokumen perencanaan agar modul selaras
          _rantai: ['cp', 'atp', 'minggu_efektif', 'distribusi_jp', 'prota', 'prosem'],
        };
        const sumberParts = [];
        if (docs.cp) sumberParts.push('===== CP =====\n' + docs.cp.slice(0, 6000));
        if (docs.atp) sumberParts.push('===== ATP =====\n' + docs.atp.slice(0, 4000));
        if (docs.minggu_efektif) sumberParts.push('===== MINGGU EFEKTIF =====\n' + docs.minggu_efektif.slice(0, 2000));
        if (docs.distribusi_jp) sumberParts.push('===== DISTRIBUSI JP =====\n' + docs.distribusi_jp.slice(0, 2000));
        if (docs.prota) sumberParts.push('===== PROTA =====\n' + docs.prota.slice(0, 3000));
        if (docs.prosem) sumberParts.push('===== PROSEM =====\n' + docs.prosem.slice(0, 3000));
        const sumber = sumberParts.join('\n\n');
        let md = '', imgs = [];
        await generateDocStream('modul', info, topikObj.topik, sumber, null, (ev) => {
          if (ev.tipe === 'selesai') { md = ev.markdown || ''; imgs = ev.images || []; }
        });
        if (!md) throw new Error(`Gagal generate modul ${ix + 1}.`);
        const judul = extractTitle(md) || `Modul: ${topikObj.topik}`;
        const prof = getProfile();
        const docId = await saveModul({
          docType: 'modul', judul,
          jenjang: project.jenjang, fase: project.fase, kelas: project.kelas,
          semester: project.semester, mapel: mapel || project.mapel, topik: topikObj.topik,
          alokasi: topikObj.alokasi, model: model === 'auto' ? '' : model,
          nama: namaGuru || prof.nama, sekolah: prof.sekolah, tahunAjaran: project.tahunAjaran || prof.tahunAjaran,
          markdown: md, images: imgs, projectId: project.id,
        });
        setHasil((prev) => [...prev, { topik: topikObj.topik, docId, markdown: md }]);
      }
      tugasSelesai(tid, {});
      setTahap('selesai');
      onKuotaChanged && onKuotaChanged();
    } catch (e) {
      tugasGagal(tid, e.message || 'Paket gagal.');
      setError(e.message || 'Paket gagal.');
      setTahap('setup');
    } finally {
      setBusy(false);
      tugasIdRef.current = null;
    }
  }

  function mulaiUlang() {
    setHasil([]);
    setSesiTerhenti(false);
    mulaiSesi(0);
  }

  async function simpanSkrg() {
    if (!skrg) return;
    const judul = extractTitle(skrg.markdown) || `Modul: ${skrg.topik}`;
    const prof = getProfile();
    const docId = await saveModul({
      docType: 'modul', judul,
      jenjang: project.jenjang, fase: project.fase, kelas: project.kelas,
      semester: project.semester, mapel: mapel || project.mapel, topik: skrg.topik,
      alokasi: skrg.alokasi, model: model === 'auto' ? '' : model,
      nama: namaGuru || prof.nama, sekolah: prof.sekolah, tahunAjaran: project.tahunAjaran || prof.tahunAjaran,
      markdown: skrg.markdown, images: skrg.images,
      projectId: project.id,
    });
    return docId;
  }

  async function konfirmasiLanjut() {
    if (busy) return;
    setBusy(true);
    try {
      const docId = await simpanSkrg();
      const baru = [...hasil, { topik: skrg.topik, docId, markdown: skrg.markdown }];
      setHasil(baru);
      setSkrg(null);
      if (tugasIdRef.current) tutupTugas(tugasIdRef.current);
      if (idx + 1 < topiks.length) {
        setIdx(idx + 1);
        setTahap('jalan');
        generateUntuk(topiks[idx + 1], idx + 1);
      } else {
        try { localStorage.removeItem(kunciDraft()); } catch { /* abaikan */ }
        setTahap('selesai');
      }
    } finally {
      setBusy(false);
    }
  }

  async function konfirmasiSelesai() {
    if (busy) return;
    setBusy(true);
    try {
      const docId = await simpanSkrg();
      setHasil([...hasil, { topik: skrg.topik, docId, markdown: skrg.markdown }]);
      setSkrg(null);
      if (tugasIdRef.current) tutupTugas(tugasIdRef.current);
      try { localStorage.removeItem(kunciDraft()); } catch { /* abaikan */ }
      setTahap('selesai');
    } finally {
      setBusy(false);
    }
  }

  function konfirmasiRevisi() {
    // Generate ulang memotong 1 kredit lagi — minta persetujuan dulu.
    setKonf({
      judul: `Generate ulang Modul ${idx + 1}?`,
      pesan: `"${topiks[idx]?.topik}" akan disusun ulang dari awal dan memakai 1 kredit lagi. Edit manualmu di atas akan hilang.`,
      teksYa: 'Ya, generate ulang', berbahaya: true,
      aksi: () => { setTahap('jalan'); generateUntuk(topiks[idx], idx); },
    });
  }
  async function jalankanKonf() {
    if (!konf || !konf.aksi) return;
    const aksi = konf.aksi;
    setKonf(null);
    await aksi();
  }

  // Rename massal: ubah nama guru / mapel untuk semua modul dalam sesi ini
  async function terapkanRename() {
    if (!hasil.length) return;
    setBusy(true);
    try {
      for (const h of hasil) {
        const d = await getModul(h.docId).catch(() => null);
        if (!d) continue;
        // Ganti nama guru & mapel di markdown (pola umum identitas)
        let md = d.markdown || '';
        if (namaGuru) {
          md = md.replace(/(\*\*Nama Penyusun\*\*:\s*)(.+)/gi, `$1${namaGuru}`);
          md = md.replace(/(Nama Penyusun\s*:\s*)(.+)/gi, `$1${namaGuru}`);
        }
        await updateModul(h.docId, {
          nama: namaGuru || d.nama,
          mapel: mapel || d.mapel,
          markdown: md,
        });
      }
      setRenameOpen(false);
    } catch (e) {
      setError('Rename gagal: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (!project) {
    return (
      <div className="wrap">
        <p>{error || 'Memuat proyek…'}</p>
        <button className="btn" onClick={onBack}>Kembali</button>
      </div>
    );
  }

  return (
    <div className="wrap">
      <span className="kicker">Sesi Modul</span>
      <h1 className="page">Buat Banyak Modul Sekaligus</h1>
      <p className="lead">
        {project.nama || project.mapel} · {project.kelas} · {project.semester}.
        AI menyusun modul per topik berdasarkan CP, Analisis CP, TP, ATP, dan Prosem.
        Setiap modul dikonfirmasi sebelum lanjut.
      </p>

      {tahap === 'wawancara' && (
        <WawancaraGuru
          konteks={{ jenjang: project?.jenjang, fase: project?.fase, kelas: project?.kelas, mapel: project?.mapel }}
          onSelesai={({ jawaban, catatan, daftarTanya }) => {
            const p = kompilasiPersona(jawaban, catatan, daftarTanya);
            const r = ringkasanPersona(jawaban, catatan);
            setPersona(p);
            setPersonaRingkasan(r);
            try { saveProfile({ persona: p, personaRingkasan: r }); } catch { /* abaikan */ }
            setTahap('setup');
          }}
          onLewati={() => { setPersona(''); setPersonaRingkasan(''); setTahap('setup'); }}
        />
      )}

      {tahap === 'setup' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>1. Topik Modul</h2>
          <p className="hint">Satu topik = satu modul (bisa mencakup beberapa pertemuan). Urutan sesuai daftar.</p>
          {materiProsem.length > 0 && (
            <details style={{ marginBottom: 16, border: '2px solid #1a1a1a', padding: 12, background: '#faf8f3' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Ambil dari Prosem ({materiProsem.length} materi)</summary>
              <p className="hint">Centang satu atau beberapa materi untuk digabung menjadi satu modul.</p>
              <div style={{ maxHeight: 260, overflow: 'auto', marginTop: 8 }}>
                {materiProsem.map((m, ix) => (
                  <label key={ix} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #e5e0d5', cursor: 'pointer' }}>
                    <input type="checkbox" checked={pilihProsem.includes(ix)} onChange={(e) => {
                      setPilihProsem((prev) => e.target.checked ? [...prev, ix] : prev.filter((x) => x !== ix));
                    }} style={{ marginTop: 4 }} />
                    <span style={{ flex: 1 }}>{m.materi} <span className="hint">({m.jp} JP{m.ket ? ` · ${m.ket}` : ''})</span></span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm" onClick={gabungDariProsem} disabled={!pilihProsem.length}>
                  + Jadikan 1 Modul ({pilihProsem.length} dipilih)
                </button>
                <button type="button" className="btn btn-sm" onClick={semuaJadiModul}>
                  + Semua ({materiProsem.length}) Jadi Modul
                </button>
              </div>
            </details>
          )}
          {topiks.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span className="nblk-total">{i + 1}</span>
              <input value={t.topik} onChange={(e) => {
                const v = e.target.value;
                setTopiks((prev) => prev.map((x, ix) => (ix === i ? { ...x, topik: v } : x)));
              }} style={{ flex: 1 }} aria-label={'Topik ' + (i + 1)} />
              <input value={t.alokasi} onChange={(e) => {
                const v = e.target.value;
                setTopiks((prev) => prev.map((x, ix) => (ix === i ? { ...x, alokasi: v } : x)));
              }} style={{ width: 130 }} aria-label="Alokasi" />
              <button type="button" className="btn btn-sm" onClick={() => hapusTopik(i)}>Hapus</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              value={topikBaru} onChange={(e) => setTopikBaru(e.target.value)}
              placeholder="Tambah topik baru…"
              style={{ flex: 1 }}
              onKeyDown={(e) => { if (e.key === 'Enter') tambahTopik(); }}
            />
            <button type="button" className="btn btn-sm" onClick={tambahTopik}>+ Tambah</button>
          </div>

          <h2 style={{ marginTop: 24 }}>2. Pengaturan</h2>
          <div className="grid2">
            <div className="field">
              <label>Model Pembelajaran</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="auto">Otomatis (AI pilihkan yang cocok per topik)</option>
                {MODEL.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <p className="hint" style={{ margin: '6px 0 0' }}>
                Mode otomatis: AI menganalisis tiap topik lalu memilih model yang paling sesuai.
              </p>
            </div>
            <div className="field">
              <label>Nama Guru</label>
              <input value={namaGuru} onChange={(e) => setNamaGuru(e.target.value)} placeholder="Nama guru" />
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Mata Pelajaran</label>
              <input value={mapel} onChange={(e) => setMapel(e.target.value)} placeholder="Mata pelajaran" />
            </div>
          </div>
          <p className="hint">
            Dokumen acuan tersedia: {[docs.cp && 'CP', docs.atp && 'ATP', docs.minggu_efektif && 'Minggu Efektif', docs.distribusi_jp && 'Distribusi JP', docs.prota && 'Prota', docs.prosem && 'Prosem'].filter(Boolean).join(', ') || 'belum ada'}.
            {!docs.atp && ' Buat dulu di Ruang Perencanaan agar modul selaras.'}
          </p>
          {personaRingkasan && (
            <div className="card" style={{ marginTop: 16, background: '#fbf9f4' }}>
              <h3 style={{ margin: '0 0 6px' }}>3. Persona Guru</h3>
              <pre className="hint" style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px', fontFamily: 'inherit' }}>{personaRingkasan}</pre>
              <button type="button" className="btn btn-sm" onClick={() => { setTahap('wawancara'); }}>
                Ubah jawaban wawancara
              </button>
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}
          {sesiTerhenti && hasil.length > 0 && (
            <div className="alert alert-info" role="status">
              <b>Sesi terhenti di Modul {idx + 1} dari {topiks.length}.</b> {hasil.length} modul sudah tersimpan aman.
              <div className="btn-row" style={{ marginTop: 10, marginBottom: 0 }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => mulaiSesi(idx)} disabled={busy}>
                  Lanjutkan dari Modul {idx + 1}
                </button>
                <button type="button" className="btn btn-sm" onClick={mulaiUlang} disabled={busy}>
                  Mulai ulang dari awal
                </button>
              </div>
            </div>
          )}
          <div className="btn-row">
            <button type="button" className="btn" onClick={onBack}>Kembali</button>
            <button type="button" className="btn btn-primary" onClick={paketLengkap} disabled={busy || !topiks.length} title="Generate semua modul sekaligus">
              Generate Paket ({topiks.length} modul)
            </button>
          </div>
          {topiks.length > 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              {topiks.length} modul × 1 kredit = {topiks.length} kredit.
              {kuota && !kuota.admin && ` Sisa kreditmu minggu ini: ${kuota.sisa} dari ${kuota.batas}.`}
              {kuota && kuota.admin && ' Kamu admin: tanpa batas kredit.'}
            </p>
          )}
        </div>
      )}

      {tahap === 'jalan' && (
        <div className="card">
          <span className="kicker">Modul {idx + 1} dari {topiks.length}</span>
          <h2 style={{ margin: '4px 0 8px' }}>{topiks[idx]?.topik}</h2>
          {busy ? (
            <ProsesLive judul={'Menyusun Modul ' + (idx + 1)} tahap={tahapLive} status={statusLive} tulisan={tulisan} />
          ) : (
            <p>Menyiapkan…</p>
          )}
          {error && <div className="alert alert-error">{error}</div>}
        </div>
      )}

      {tahap === 'konfirmasi' && skrg && (
        <div className="card">
          <span className="kicker">Konfirmasi Modul {idx + 1} dari {topiks.length}</span>
          <h2 style={{ margin: '4px 0 8px' }}>{skrg.topik}</h2>
          <p className="hint">Periksa hasil di bawah. Edit manualmu ikut tersimpan saat menekan tombol — beda dengan "Generate ulang" yang menyusun ulang dari awal (memakai 1 kredit lagi).</p>
          <DocEditor
            initialMarkdown={skrg.markdown}
            images={skrg.images || []}
            docType="Modul Ajar"
            docTitle={skrg.topik}
            topic={skrg.topik}
            onChange={(md, imgs) => setSkrg((s) => s ? { ...s, markdown: md, images: imgs } : s)}
          />
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn" onClick={konfirmasiRevisi} disabled={busy}>
              Revisi (generate ulang)
            </button>
            {idx + 1 < topiks.length ? (
              <button type="button" className="btn btn-primary" onClick={konfirmasiLanjut} disabled={busy}>
                Simpan & Lanjut ke Modul {idx + 2}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={konfirmasiLanjut} disabled={busy}>
                Simpan & Selesaikan
              </button>
            )}
            <button type="button" className="btn" onClick={konfirmasiSelesai} disabled={busy}>
              Selesai di sini
            </button>
          </div>
        </div>
      )}
      {konf && (
        <Konfirmasi
          judul={konf.judul} pesan={konf.pesan} daftar={konf.daftar}
          teksYa={konf.teksYa} berbahaya={konf.berbahaya}
          sibuk={busy} onYa={jalankanKonf} onBatal={() => !busy && setKonf(null)}
        />
      )}

      {tahap === 'selesai' && (
        <div className="card">
          <span className="kicker">Sesi selesai</span>
          <h2 style={{ margin: '4px 0 8px' }}>{hasil.length} modul dibuat</h2>
          {hasil.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span className="nblk-total">{i + 1}</span>
              <span style={{ flex: 1 }}>{h.topik}</span>
              <button type="button" className="btn btn-sm" onClick={() => onOpenDoc(h.docId)}>Buka</button>
            </div>
          ))}
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn" onClick={() => setRenameOpen(true)}>
              Ubah nama guru / mapel sekaligus
            </button>
            <button type="button" className="btn btn-primary" onClick={onBack}>Kembali</button>
          </div>
          {renameOpen && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>Ubah Nama Guru / Mapel Sekaligus</h3>
              <p className="hint">Ubah sekali, berlaku untuk semua {hasil.length} modul dalam sesi ini.</p>
              <div className="grid2">
                <div className="field">
                  <label>Nama Guru</label>
                  <input value={namaGuru} onChange={(e) => setNamaGuru(e.target.value)} />
                </div>
                <div className="field">
                  <label>Mata Pelajaran</label>
                  <input value={mapel} onChange={(e) => setMapel(e.target.value)} />
                </div>
              </div>
              <div className="btn-row">
                <button type="button" className="btn" onClick={() => setRenameOpen(false)}>Batal</button>
                <button type="button" className="btn btn-primary" onClick={terapkanRename} disabled={busy}>
                  {busy ? 'Menerapkan…' : 'Terapkan ke semua'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
