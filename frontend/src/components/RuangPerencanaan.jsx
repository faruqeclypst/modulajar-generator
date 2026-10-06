import { useEffect, useRef, useState } from 'react';
import { DOC_TYPES, ALUR_PERENCANAAN } from '../lib/docs';
import { generateDocStream, extractTitle, getProfile } from '../lib/api';
import { buatTugas, tugasTahap, tugasTulisan, tugasSelesai, tugasGagal, tutupTugas, cariTugas, langgananTugas, tugasBerjalan } from '../lib/tugasLatar';
import { saveModul, updateModul, getModul, savePaket, updatePaket, getPaket, paketProgress, listProjects, getProject, saveProject, updateProject } from '../lib/db';
import DocEditor from './DocEditor';
import FormulirDasar from './FormulirDasar';
import ProsesLive from './ProsesLive';
import Paywall from './Paywall';
import { SkelKartu } from './Kerangka';

// Urutan prasyarat: tiap langkah butuh langkah sebelumnya
const BUTUH = { cp: null, atp: 'cp', minggu_efektif: 'atp', prota: 'minggu_efektif', prosem: 'prota' };

export default function RuangPerencanaan({ onBack, onOpenDoc, onCatatAsal, onBuatModul, preselectProjectId, waLink, onKuotaChanged, bukaStep, tugasId }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(preselectProjectId || null);
  const [project, setProject] = useState(null);
  const [paket, setPaket] = useState(null); // baris paket legacy tertaut: penyimpanan docs + pemilih acuan
  const [showBaru, setShowBaru] = useState(false);
  const [baru, setBaru] = useState({ namaProyek: '', jenjang: 'SMA/MA', fase: 'F (Kelas 11-12)', kelas: '', semester: 'Ganjil', mapel: '', tahunAjaran: '' });
  const [stepKey, setStepKey] = useState(null);
  const [errBaru, setErrBaru] = useState('');
  const [memuatAwal, setMemuatAwal] = useState(true); // loading daftar proyek saat pertama dibuka
  // Buka langkah tertentu otomatis (dari kartu floating tugas latar).
  useEffect(() => {
    if (bukaStep) setStepKey(bukaStep);
  }, [bukaStep]);

  // Pastikan setiap proyek punya baris paket tertaut (dipakai StepWorkspace
  // dan pemilih "Paket Perencanaan" di Wizard; tidak terlihat di UI).
  async function pastikanPaket(proj) {
    if (proj.paketId) {
      const p = await getPaket(proj.paketId).catch(() => null);
      if (p) return p;
    }
    const pid = await savePaket({
      mapel: proj.mapel, jenjang: proj.jenjang, fase: proj.fase, kelas: proj.kelas,
      semester: proj.semester, tahunAjaran: proj.tahunAjaran, docs: {},
    });
    await updateProject(proj.id, { paketId: pid });
    return getPaket(pid);
  }

  async function refresh(pid) {
    const list = await listProjects();
    setProjects(list);
    const id = pid || projectId;
    if (id) {
      const proj = list.find((p) => String(p.id) === String(id)) || await getProject(id).catch(() => null);
      if (proj) {
        setProject(proj);
        setProjectId(proj.id);
        setPaket(await pastikanPaket(proj));
        return;
      }
    }
    setProject(null);
    setPaket(null);
  }
  useEffect(() => { refresh().then(() => setMemuatAwal(false)); }, []);
  useEffect(() => {
    const p = getProfile();
    setBaru((b) => ({ ...b, tahunAjaran: b.tahunAjaran || p.tahunAjaran || '' }));
  }, []);

  async function buatProyek() {
    if (!baru.mapel) { setErrBaru('Pilih mata pelajaran dulu.'); return; }
    setErrBaru('');
    const { namaProyek, ...rest } = baru;
    const id = await saveProject({ ...rest, nama: (namaProyek || '').trim() });
    setShowBaru(false);
    setProjectId(id);
    setStepKey(null);
    refresh(id);
  }

  function bukaProyek(id) { setProjectId(id); setStepKey(null); refresh(id); }
  function tutupProyek() { setProjectId(null); setProject(null); setPaket(null); refresh(); }

  if (!project || !paket) {
    return (
      <div className="wrap">
        <span className="kicker">Ruang Perencanaan</span>
        <h1 className="page">Alur Perangkat Ajar</h1>
        <p className="lead">
          Pilih <strong>proyek</strong> dulu, lalu susun perangkat <strong>berurutan</strong>: CP, ATP, Prota, Prosem, baru Modul Ajar.
          Tiap dokumen menjadi <strong>acuan resmi</strong> dokumen berikutnya, bukan karangan AI.
        </p>
        <div className="btn-row" style={{ marginBottom: 20 }}>
          <button className="btn" onClick={onBack}>Kembali</button>
          <button className="btn btn-primary" onClick={() => setShowBaru(!showBaru)}>+ Proyek Baru</button>
        </div>

        {showBaru && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>Proyek Baru</h3>
            <div className="grid2">
              <FormulirDasar
                nilai={baru}
                onUbah={(patch) => { setBaru((b) => ({ ...b, ...patch })); setErrBaru(''); }}
                fields={['namaProyek', 'jenjang', 'fase', 'kelas', 'semester', 'mapel', 'tahunAjaran']}
                wajib={['mapel']}
                galat={errBaru ? { mapel: errBaru } : {}}
                prefix="rp"
              />
            </div>
            <div className="btn-row">
              <button className="btn" onClick={() => setShowBaru(false)}>Batal</button>
              <button className="btn btn-primary" onClick={buatProyek}>Buat Proyek</button>
            </div>
          </div>
        )}

        {memuatAwal ? (
          <SkelKartu jumlah={3} />
        ) : projects.length === 0 ? (
          <div className="empty">
            <h3>Belum ada proyek</h3>
            <p>Buat satu proyek per mata pelajaran + kelas + semester.</p>
          </div>
        ) : (
          <div className="modul-grid">
            {projects.map((p) => (
              <div className="card modul-card" key={p.id}>
                <h3>{p.nama || [p.mapel, p.kelas].filter(Boolean).join(' ')}</h3>
                <div className="meta">
                  <span className="chip fill">{p.jenjang}</span>
                  {p.fase && <span className="chip">{p.fase}</span>}
                  <span className="chip">Semester {p.semester}</span>
                  {p.tahunAjaran && <span className="chip">{p.tahunAjaran}</span>}
                </div>
                <div className="actions">
                  <button className="btn btn-sm btn-ink" onClick={() => bukaProyek(p.id)}>Buka</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const docs = paket.docs || {};
  const prog = paketProgress(paket);

  return (
    <div className="wrap">
      <span className="kicker">Ruang Perencanaan</span>
      <h1 className="page">{project.nama || [project.mapel, project.kelas].filter(Boolean).join(' ')}</h1>
      <p className="lead">{project.jenjang} · {project.fase} · {project.kelas} · Semester {project.semester} · {project.tahunAjaran}</p>

      <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 220 }}><strong>Kemajuan{' '}{prog}/5.</strong> Selesaikan berurutan. Tiap dokumen menjadi acuan dokumen berikutnya.</span>
        <div className="progress" style={{ flex: 1, minWidth: 140 }}><div className="progress-fill" style={{ width: (prog / 5 * 100) + '%' }} /></div>
      </div>

      {!stepKey && (
        <>
          <div className="ruang-steps">
          {ALUR_PERENCANAAN.map((s) => {
            const need = BUTUH[s.key];
            const locked = need && !docs[need];
            const done = !!docs[s.key];
            const needName = need ? DOC_TYPES[need].nama : '';
            return (
              <div className={'card step-card' + (done ? ' done' : '')} key={s.key}>
                <div className="step-row">
                  <div className="step-num" aria-hidden="true">{s.langkah}</div>
                  <div className="step-body">
                    <h3>{s.nama}</h3>
                    <p>{s.desc}</p>
                    {locked && <div className="hint" style={{ color: 'var(--red-dark)' }}>Selesaikan <strong>{needName}</strong> dulu. {s.nama} diturunkan darinya.</div>}
                    {done && <div className="hint" style={{ color: 'var(--ok)', fontWeight: 700 }}>Sudah disusun ✓</div>}
                  </div>
                  <div className="btn-row" style={{ margin: 0 }}>
                    {done && (
                      <a
                        className="btn btn-sm" href={'/dokumen/' + docs[s.key]}
                        onClick={(e) => {
                          e.preventDefault(); // navigasi SPA tanpa reload; href tetap mendukung klik kanan > tab baru
                          if (onCatatAsal) onCatatAsal({ view: 'ruang', ruangProjectId: projectId });
                          if (onOpenDoc) onOpenDoc(docs[s.key], { view: 'ruang', ruangProjectId: projectId });
                        }}
                      >
                        Lihat
                      </a>
                    )}
                    <button className="btn btn-sm btn-primary" disabled={!!locked} onClick={() => setStepKey(s.key)}>
                      {done ? 'Susun Ulang' : locked ? 'Terkunci' : 'Susun'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
          <div className="btn-row">
            <button className="btn" onClick={tutupProyek}>Semua Proyek</button>
            {docs.atp && (
              <button className="btn btn-primary" onClick={() => onBuatModul && onBuatModul(paket.id, project.id)}>
                Buat Modul Ajar dari Proyek Ini
              </button>
            )}
          </div>
          {docs.atp && (
            <div className="hint" style={{ marginTop: 8 }}>
              Modul Ajar akan disusun dengan merujuk CP, ATP, Prota, dan Prosem proyek ini. TP dan materi mengikuti acuan, bukan karangan AI.
            </div>
          )}
        </>
      )}

      {stepKey && (
        <StepWorkspace
          paket={paket}
          project={project}
          stepKey={stepKey}
          waLink={waLink}
          onKuotaChanged={onKuotaChanged}
          onClose={() => { setStepKey(null); refresh(); }}
          onOpenDoc={onOpenDoc}
          tugasId={tugasId}
        />
      )}
    </div>
  );
}

function StepWorkspace({ paket, project, stepKey, waLink, onKuotaChanged, onClose, onOpenDoc, tugasId }) {
  const dt = DOC_TYPES[stepKey];
  const need = BUTUH[stepKey];
  // Mode terlampir: kembali dari kartu floating saat generate berjalan di latar.
  // Juga otomatis menempel bila langkah ini sudah ada tugas berjalan (cegah generate dobel).
  const [tugasIdEfektif] = useState(() => {
    if (tugasId) return tugasId;
    const jalan = tugasBerjalan('ruang').find((t) => t.meta?.stepKey === stepKey);
    return jalan ? jalan.id : null;
  });
  const [tugas, setTugas] = useState(() => (tugasIdEfektif ? cariTugas(tugasIdEfektif) : null));
  const terhidrasi = useRef(false);
  useEffect(() => {
    if (!tugasIdEfektif) return;
    return langgananTugas((daftar) => {
      const t = daftar.find((x) => x.id === tugasIdEfektif);
      setTugas(t || null);
    });
  }, [tugasIdEfektif]);
  const [teks, setTeks] = useState('');       // CP resmi (tempel) / materi tambahan
  const [sumber, setSumber] = useState('');     // markdown dokumen acuan
  const [sumberJudul, setSumberJudul] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [busy, setBusy] = useState(false);
  const [tahapLive, setTahapLive] = useState([]);   // tahapan asli dari server
  const [statusLive, setStatusLive] = useState({});
  const [tulisan, setTulisan] = useState([]);       // teks AI realtime per tahap (efek mengetik)
  const labelMap = useRef({});
  const tugasIdRef = useRef(null); // id tugas latar (tetap hidup saat pindah halaman)
  const [paywall, setPaywall] = useState(null);
  const [error, setError] = useState('');
  const [finalMd, setFinalMd] = useState('');
  // Bila tugas terlampir selesai saat ditonton, hidrasikan dari hasilnya.
  useEffect(() => {
    if (!tugasIdEfektif || terhidrasi.current) return;
    if (tugas?.state === 'selesai' && tugas.hasil?.markdown) {
      terhidrasi.current = true;
      try {
        setMarkdown(tugas.hasil.markdown);
        setFinalMd(tugas.hasil.markdown);
      } catch { /* abaikan */ }
    }
  }, [tugasId, tugas?.state]);

  useEffect(() => {
    (async () => {
      if (need && paket.docs[need]) {
        let d = null;
        try { d = await getModul(paket.docs[need]); } catch { d = null; }
        if (d) { setSumber(d.markdown || ''); setSumberJudul(d.judul || DOC_TYPES[need].nama); }
      }
    })();
  }, [paket, need, stepKey]);

  const profile = getProfile();
  const info = {
    nama: profile.nama, nip: profile.nip, sekolah: profile.sekolah, tahunAjaran: paket.tahunAjaran || profile.tahunAjaran,
    jenjang: paket.jenjang, fase: paket.fase, kelas: paket.kelas, semester: paket.semester, mapel: paket.mapel,
    kepalaSekolah: profile.kepalaSekolah, nipKepalaSekolah: profile.nipKepalaSekolah,
  };

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

  // Tambahkan delta teks ke segmen tahap yang sesuai (efek mengetik ala ChatGPT)
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

  async function handleGenerate() {
    setError(''); setPaywall(null); setBusy(true);
    setTahapLive([]); setStatusLive({}); setTulisan([]); labelMap.current = {};
    // Daftarkan ke tugas latar agar progress tetap tampil (floating) saat pindah halaman.
    const tid = buatTugas({
      judul: 'Menyusun ' + (dt?.nama || 'dokumen'),
      konteks: 'ruang', aksi: { kembali: 'Lihat proses' },
      meta: { stepKey, projectId: project?.id || null },
    });
    tugasIdRef.current = tid;
    try {
      // CP: teks tempelan resmi jadi materi utama. Lainnya: sumber = dokumen acuan sebelumnya.
      let md = '';
      await generateDocStream(stepKey, info, teks, stepKey === 'cp' ? '' : sumber, null, (ev) => {
        if (ev.tipe === 'tahap') tandaiTahap(ev.key, ev.label);
        else if (ev.tipe === 'teks') tambahTulisan(ev.key, ev.delta || '');
        else if (ev.tipe === 'selesai') {
          md = ev.markdown || '';
          setStatusLive((prev) => {
            const next = { ...prev };
            for (const k of Object.keys(next)) next[k] = 'ok';
            return next;
          });
        } else if (ev.tipe === 'gagal') throw new Error(ev.error || 'Generate gagal.');
      });
      if (!md.trim()) throw new Error('AI mengembalikan dokumen kosong.');
      // Simpan hasil ke tugas latar: bila pengguna pindah halaman lalu kembali
      // via kartu floating, hasilnya bisa dipulihkan dari sini.
      tugasSelesai(tid, { markdown: md, stepKey });
      setMarkdown(md); setFinalMd(md);
      onKuotaChanged && onKuotaChanged();
    } catch (e) {
      if (tugasIdRef.current) tugasGagal(tugasIdRef.current, e.code === 'kuota_habis' ? 'Kredit habis.' : (e.message || 'Generate gagal.'));
      if (e.code === 'kuota_habis') setPaywall({ mode: 'kuota_habis', detail: e.detail });
      else setError(e.message);
    } finally { setBusy(false); }
  }

  async function handleSave() {
    const judul = extractTitle(finalMd);
    const payload = {
      docType: stepKey, judul,
      jenjang: paket.jenjang, fase: paket.fase, kelas: paket.kelas, semester: paket.semester,
      mapel: paket.mapel, topik: '', nama: profile.nama, sekolah: profile.sekolah,
      tahunAjaran: paket.tahunAjaran || profile.tahunAjaran,
      markdown: finalMd, images: [], paketId: paket.id,
      projectId: project?.id || undefined,
    };
    let docId = paket.docs[stepKey];
    if (docId) { await updateModul(docId, payload); }
    else { docId = await saveModul(payload); }
    await updatePaket(paket.id, { docs: { ...(paket.docs || {}), [stepKey]: docId } });
    if (tugasIdRef.current) tutupTugas(tugasIdRef.current);
    if (tugasIdEfektif) tutupTugas(tugasIdEfektif);
    onClose();
  }

  const isCp = stepKey === 'cp';

  // Mode terlampir: kembali dari kartu floating saat generate masih berjalan
  if (tugasIdEfektif && tugas?.state === 'jalan') {
    return (
      <div className="card">
        <span className="kicker">Langkah {ALUR_PERENCANAAN.find((s) => s.key === stepKey).langkah}</span>
        <h2 style={{ margin: '4px 0 8px' }}>{dt.nama}</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Kamu kembali ke proses yang berjalan di latar. Pindah halaman lagi pun progress tetap tampil di kartu mengambang.
        </p>
        <ProsesLive judul={tugas.judul} tahap={tugas.tahap} status={tugas.status} tulisan={tugas.tulisan} />
        <div className="btn-row">
          <button type="button" className="btn" onClick={onClose}>Tutup</button>
        </div>
      </div>
    );
  }
  if (tugasIdEfektif && !tugas) {
    return (
      <div className="card">
        <span className="kicker">Proses tidak ditemukan</span>
        <p>Proses generate yang kamu tuju sudah selesai atau ditutup.</p>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={onClose}>Tutup</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <span className="kicker">Langkah {ALUR_PERENCANAAN.find((s) => s.key === stepKey).langkah}</span>
      <h2 style={{ margin: '4px 0 8px' }}>{dt.nama}</h2>

      {!markdown && !busy && (
        <>
          {isCp ? (
            <>
              <div className="alert alert-info">
                <strong>Sumber kredibel dulu.</strong> Tempel teks CP resmi (dari dokumen Kemendikdasmen / buku guru) di bawah.
                AI akan menyusunnya menjadi draf rapi <em>tanpa menambah kompetensi baru</em> di luar teks tersebut.
              </div>
              <div className="field">
                <label>Teks CP Resmi (tempel di sini)</label>
                <textarea rows={8} placeholder="Tempel teks Capaian Pembelajaran resmi untuk fase & mapel ini…" value={teks} onChange={(e) => setTeks(e.target.value)} />
                <div className="hint">{teks.length} karakter {teks.length === 0 && '(boleh kosong. AI akan menyusun draf dari kerangka nasional, tetap perlu diverifikasi guru)'}</div>
              </div>
            </>
          ) : (
            <>
              <div className="alert alert-info">
                <strong>Acuan:</strong> {sumberJudul || DOC_TYPES[need].nama}.{' '}{dt.nama}{' '}akan <strong>diturunkan langsung</strong> dari acuan ini. AI dilarang mengarang di luar acuan.
              </div>
              {sumber && (
                <details style={{ marginBottom: 14 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Lihat isi acuan</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, maxHeight: 220, overflow: 'auto', background: '#f4f2ec', padding: 12, border: '2px solid #1a1a1a' }}>{sumber.slice(0, 4000)}{sumber.length > 4000 ? '\n…' : ''}</pre>
                </details>
              )}
              <div className="field">
                <label>Catatan tambahan (opsional)</label>
                <textarea rows={3} placeholder="cth: fokus pada materi X, alokasi khusus…" value={teks} onChange={(e) => setTeks(e.target.value)} />
              </div>
            </>
          )}
          {error && <div className="alert alert-error">{error}</div>}
          <div className="btn-row">
            <button className="btn" onClick={onClose}>Kembali</button>
            <button className="btn btn-primary" onClick={handleGenerate}>Susun {dt.nama} dengan AI</button>
          </div>
        </>
      )}

      {busy && (
        <ProsesLive judul={'Menyusun ' + dt.nama} tahap={tahapLive} status={statusLive} tulisan={tulisan} />
      )}

      {markdown && !busy && (
        <>
          <div className="toolbar no-print">
            <span className="kicker" style={{ margin: 0 }}>Editor Blok</span>
            <span className="draft-note">Periksa hasil AI. Edit langsung bila perlu</span>
          </div>
          <DocEditor
            initialMarkdown={markdown}
            images={[]}
            docType={dt.nama}
            docTitle={extractTitle(markdown)}
            topic={paket.mapel}
            onChange={(md) => setFinalMd(md)}
          />
          {error && <div className="alert alert-error">{error}</div>}
          <div className="btn-row no-print">
            <button className="btn" onClick={() => { setMarkdown(''); setFinalMd(''); }}>Generate Ulang</button>
            <button className="btn btn-primary" onClick={handleSave}>Simpan ke Proyek</button>
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
