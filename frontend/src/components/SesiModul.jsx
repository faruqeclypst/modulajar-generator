import { useEffect, useRef, useState } from 'react';
import { MODEL } from '../lib/referensi';
import { generateDocStream, getProfile, extractTitle } from '../lib/api';
import { getProject, getModul, saveModul, updateModul, getPaket } from '../lib/db';
import { buatTugas, tugasTahap, tugasTulisan, tugasSelesai, tugasGagal, tutupTugas } from '../lib/tugasLatar';
import { kunciAkun } from '../lib/akunLokal';
import ProsesLive from './ProsesLive';
import DocEditor from './DocEditor';
import WawancaraGuru, { kompilasiPersona } from './WawancaraGuru';

// Sesi Modul Batch: generate banyak modul 1-klik berdasarkan dokumen perencanaan
// (CP, ATP, Prota, Prosem). Setiap modul dikonfirmasi user sebelum lanjut ke berikut:
// bisa Revisi (edit/regenerate) atau Lanjut. Nama guru/mapel bisa di-rename massal.
export default function SesiModul({ projectId, onBack, onOpenDoc, onKuotaChanged }) {
  const [project, setProject] = useState(null);
  const [docs, setDocs] = useState({}); // {cp, atp, prota, prosem} -> markdown
  const [topiks, setTopiks] = useState([]); // [{topik, alokasi}]
  const [topikBaru, setTopikBaru] = useState('');
  const [model, setModel] = useState('auto');
  const [namaGuru, setNamaGuru] = useState('');
  const [mapel, setMapel] = useState('');
  const [persona, setPersona] = useState(''); // teks profil guru dari wawancara
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
  const labelMap = useRef({});
  const tugasIdRef = useRef(null);

  // Draft sesi: tahan refresh (topik, pengaturan, persona)
  function kunciDraft() { return kunciAkun('ma-sesi-modul-' + projectId); }
  function simpanDraft() {
    try {
      localStorage.setItem(kunciDraft(), JSON.stringify({
        topiks, model, namaGuru, mapel, persona,
      }));
    } catch { /* abaikan */ }
  }
  useEffect(() => {
    if (!project) return;
    simpanDraft();
  }, [topiks, model, namaGuru, mapel, persona]); // eslint-disable-line react-hooks/exhaustive-deps

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
        }
      } catch { /* abaikan */ }
      // Muat dokumen perencanaan sebagai acuan
      const d = {};
      try {
        const paket = p.paketId ? await getPaket(p.paketId).catch(() => null) : null;
        const docsMap = paket?.docs || {};
        for (const k of ['cp', 'atp', 'prota', 'prosem']) {
          if (docsMap[k]) {
            const md = await getModul(docsMap[k]).catch(() => null);
            if (md) d[k] = md.markdown || '';
          }
        }
      } catch { /* abaikan */ }
      setDocs(d);
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
      };
      // Gabungkan dokumen perencanaan sebagai sumber acuan
      const sumberParts = [];
      if (docs.cp) sumberParts.push('===== CP =====\n' + docs.cp.slice(0, 6000));
      if (docs.atp) sumberParts.push('===== ATP =====\n' + docs.atp.slice(0, 6000));
      if (docs.prota) sumberParts.push('===== PROTA =====\n' + docs.prota.slice(0, 4000));
      if (docs.prosem) sumberParts.push('===== PROSEM =====\n' + docs.prosem.slice(0, 4000));
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

  function mulaiSesi() {
    if (!topiks.length) { setError('Tambahkan minimal satu topik.'); return; }
    setHasil([]);
    setIdx(0);
    setTahap('jalan');
    generateUntuk(topiks[0], 0);
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
  }

  async function konfirmasiSelesai() {
    const docId = await simpanSkrg();
    setHasil([...hasil, { topik: skrg.topik, docId, markdown: skrg.markdown }]);
    setSkrg(null);
    if (tugasIdRef.current) tutupTugas(tugasIdRef.current);
    try { localStorage.removeItem(kunciDraft()); } catch { /* abaikan */ }
    setTahap('selesai');
  }

  function konfirmasiRevisi() {
    // Kembali ke mode jalan tapi biarkan user edit via DocEditor di layar konfirmasi
    // (tombol "Generate ulang" memicu generate ulang topik yang sama)
    setTahap('jalan');
    generateUntuk(topiks[idx], idx);
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
      <span className="kicker">Sesi Modul Batch</span>
      <h1 className="page">Buat Modul 1-Klik</h1>
      <p className="lead">
        {project.nama || project.mapel} · {project.kelas} · {project.semester}.
        AI menyusun modul per topik berdasarkan CP, ATP, Prota, Prosem.
        Setiap modul dikonfirmasi sebelum lanjut.
      </p>

      {tahap === 'wawancara' && (
        <WawancaraGuru
          onSelesai={({ jawaban, catatan }) => {
            setPersona(kompilasiPersona(jawaban, catatan));
            setTahap('setup');
          }}
          onLewati={() => { setPersona(''); setTahap('setup'); }}
        />
      )}

      {tahap === 'setup' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>1. Topik Modul</h2>
          <p className="hint">Satu topik = satu modul. Urutan sesuai daftar.</p>
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
            Dokumen acuan tersedia: {[docs.cp && 'CP', docs.atp && 'ATP', docs.prota && 'Prota', docs.prosem && 'Prosem'].filter(Boolean).join(', ') || 'belum ada'}.
            {!docs.atp && ' Buat dulu di Ruang Perencanaan agar modul selaras.'}
          </p>

          {error && <div className="alert alert-error">{error}</div>}
          <div className="btn-row">
            <button type="button" className="btn" onClick={onBack}>Kembali</button>
            <button type="button" className="btn btn-primary" onClick={mulaiSesi} disabled={busy || !topiks.length}>
              Mulai Sesi ({topiks.length} modul)
            </button>
          </div>
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
          <p className="hint">Periksa hasil. Lanjut ke modul berikut, revisi (generate ulang), atau selesai.</p>
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
              Rename massal (nama guru / mapel)
            </button>
            <button type="button" className="btn btn-primary" onClick={onBack}>Kembali</button>
          </div>
          {renameOpen && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>Rename Massal</h3>
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
