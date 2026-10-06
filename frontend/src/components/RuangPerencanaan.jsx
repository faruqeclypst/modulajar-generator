import { useEffect, useRef, useState } from 'react';
import { DOC_TYPES, ALUR_PERENCANAAN } from '../lib/docs';
import { generateDocStream, extractTitle, getProfile } from '../lib/api';
import { buatTugas, tugasTahap, tugasTulisan, tugasSelesai, tugasGagal, tutupTugas, cariTugas, langgananTugas, tugasBerjalan } from '../lib/tugasLatar';
import { kunciAkun } from '../lib/akunLokal';
import { saveModul, updateModul, getModul, savePaket, updatePaket, getPaket, paketProgress, listProjects, getProject, saveProject, updateProject, deleteProject, arsipkanProyek } from '../lib/db';
import DocEditor from './DocEditor';
import DocPaper from './DocPaper';
import FormulirDasar from './FormulirDasar';
import ProsesLive from './ProsesLive';
import Paywall from './Paywall';
import GerbangPersona from './GerbangPersona';
import Konfirmasi from './Konfirmasi';
import UnggahDokumen from './UnggahDokumen';
import MenuTitik from './MenuTitik';
import { SkelKartu } from './Kerangka';

// Urutan prasyarat: tiap langkah butuh langkah sebelumnya
const BUTUH = { cp: null, atp: 'cp', minggu_efektif: 'atp', distribusi_jp: 'minggu_efektif', prota: 'distribusi_jp', prosem: 'prota' };
// Acuan tambahan (selain BUTUH utama) yang ikut dikirim sebagai referensi AI
const ACUAN_TAMBAHAN = { prosem: ['atp', 'minggu_efektif', 'distribusi_jp'] };

export default function RuangPerencanaan({ onBack, onOpenDoc, onCatatAsal, onBuatModul, preselectProjectId, waLink, onKuotaChanged, bukaStep, tugasId, onStepChange }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(preselectProjectId || null);
  const [project, setProject] = useState(null);
  const [paket, setPaket] = useState(null); // baris paket legacy tertaut: penyimpanan docs + pemilih acuan
  const [showBaru, setShowBaru] = useState(false);
  const [baru, setBaru] = useState({ namaProyek: '', jenjang: 'SMA/MA', fase: 'F (Kelas 11-12)', kelas: '', semester: 'Ganjil', mapel: '', tahunAjaran: '' });
  const [stepKey, setStepKey] = useState(null);
  const [alasanKunci, setAlasanKunci] = useState(null); // {untuk, butuh} saat tombol terkunci diketuk
  const [errBaru, setErrBaru] = useState('');
  const [memuatAwal, setMemuatAwal] = useState(true); // loading daftar proyek saat pertama dibuka
  // Buka langkah tertentu otomatis (dari kartu floating tugas latar / restore refresh).
  useEffect(() => {
    if (bukaStep) setStepKey(bukaStep);
  }, [bukaStep]);
  // Laporkan perubahan langkah ke parent (untuk persist posisi saat refresh).
  useEffect(() => {
    if (onStepChange) onStepChange(stepKey);
  }, [stepKey]);

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
  const [konf, setKonf] = useState(null);
  const [sibukKonf, setSibukKonf] = useState(false);
  const [pilihMode, setPilihMode] = useState(false);
  const [terpilih, setTerpilih] = useState(new Set());
  const [errAksi, setErrAksi] = useState('');
  async function jalankanKonf() {
    if (!konf || !konf.aksi) return;
    setSibukKonf(true);
    try { await konf.aksi(); setKonf(null); setPilihMode(false); setTerpilih(new Set()); refresh(); }
    catch (e) { setErrAksi('Gagal: ' + (e.message || e)); }
    finally { setSibukKonf(false); }
  }
  async function arsipkan(p) {
    try { await arsipkanProyek(p.id); refresh(); }
    catch (e) { setErrAksi('Gagal mengarsipkan: ' + (e.message || e)); }
  }
  function namaProyek(p) { return p.nama || [p.mapel, p.kelas].filter(Boolean).join(' ') || 'Proyek'; }
  async function hapusProyek(p) {
    setKonf({
      judul: 'Hapus proyek ini?',
      pesan: `Proyek "${namaProyek(p)}" akan dihapus. Dokumennya tidak ikut terhapus — pindah ke Tanpa proyek.`,
      teksYa: 'Ya, hapus', berbahaya: true,
      aksi: async () => { await deleteProject(p.id); },
    });
  }
  async function hapusBatch() {
    const daftar = projects.filter((p) => terpilih.has(String(p.id)));
    if (!daftar.length) return;
    setKonf({
      judul: `Hapus ${daftar.length} proyek?`,
      pesan: 'Proyek-proyek berikut akan dihapus. Dokumennya tidak ikut terhapus — pindah ke Tanpa proyek.',
      daftar: daftar.map(namaProyek),
      teksYa: `Ya, hapus ${daftar.length}`, berbahaya: true,
      aksi: async () => { for (const p of daftar) await deleteProject(p.id); },
    });
  }

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
          {projects.length > 0 && !showBaru && (
            <button className={'btn' + (pilihMode ? ' btn-ink' : '')} onClick={() => { setPilihMode(!pilihMode); setTerpilih(new Set()); }}>
              {pilihMode ? 'Batal pilih' : 'Pilih'}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowBaru(!showBaru)}>+ Proyek Baru</button>
        </div>

        {pilihMode && projects.length > 0 && (
          <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={terpilih.size === projects.length}
                onChange={(e) => {
                  setTerpilih(e.target.checked ? new Set(projects.map((p) => String(p.id))) : new Set());
                }}
                style={{ width: 20, height: 20, accentColor: 'var(--red)' }}
              />
              {terpilih.size > 0 ? `${terpilih.size} dipilih` : 'Pilih semua'}
            </label>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm btn-danger" onClick={hapusBatch} disabled={sibukKonf || !terpilih.size}>
              Hapus{terpilih.size ? ` (${terpilih.size})` : ''}
            </button>
          </div>
        )}

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
            <button type="button" className="btn btn-primary" onClick={() => setShowBaru(true)}>+ Buat Proyek Pertama</button>
          </div>
        ) : (
          <div className="modul-grid">
            {errAksi && <div className="alert alert-error" role="alert" style={{ gridColumn: '1 / -1' }}>{errAksi}</div>}
            {projects.map((p) => (
              <div className="card modul-card" key={p.id} style={terpilih.has(String(p.id)) ? { outline: '3px solid var(--red)' } : undefined}>
                {pilihMode && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={terpilih.has(String(p.id))}
                      onChange={(e) => {
                        setTerpilih((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(String(p.id));
                          else next.delete(String(p.id));
                          return next;
                        });
                      }}
                      style={{ width: 20, height: 20, accentColor: 'var(--red)' }}
                      aria-label={'Pilih ' + namaProyek(p)}
                    />
                    Pilih
                  </label>
                )}
                <h3>{p.nama || [p.mapel, p.kelas].filter(Boolean).join(' ')}</h3>
                <div className="meta">
                  <span className="chip fill">{p.jenjang}</span>
                  {p.fase && <span className="chip">{p.fase}</span>}
                  <span className="chip">Semester {p.semester}</span>
                  {p.tahunAjaran && <span className="chip">{p.tahunAjaran}</span>}
                </div>
                <div className="actions">
                  <button className="btn btn-sm btn-ink" onClick={() => bukaProyek(p.id)}>Buka</button>
                  <span style={{ flex: 1 }} />
                  <MenuTitik
                    label={'Aksi untuk ' + namaProyek(p)}
                    opsi={[
                      { label: 'Arsipkan', aksi: () => arsipkan(p) },
                      { label: 'Hapus', aksi: () => hapusProyek(p), bahaya: true },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {konf && (
          <Konfirmasi
            judul={konf.judul} pesan={konf.pesan} daftar={konf.daftar}
            teksYa={konf.teksYa} berbahaya={konf.berbahaya}
            sibuk={sibukKonf} onYa={jalankanKonf} onBatal={() => !sibukKonf && setKonf(null)}
          />
        )}
      </div>
    );
  }

  const docs = paket.docs || {};
  const prog = paketProgress(paket);

  const konten = (
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
          <div className="card" style={{ marginBottom: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <b>Susun semua otomatis</b>
              <div className="hint">Generate 6 langkah berurutan sekaligus — tiap dokumen jadi acuan berikutnya.</div>
              {autoProgress && <div className="hint" style={{ fontWeight: 700, marginTop: 4 }}>{autoProgress}</div>}
            </div>
            <button type="button" className="btn btn-primary" onClick={generateSemuaOtomatis} disabled={autoJalan}>
              {autoJalan ? 'Menyusun...' : 'Generate Semua Otomatis'}
            </button>
          </div>
          {alasanKunci && (
            <div className="alert alert-info" role="status" style={{ margin: '0 0 14px' }}>
              <b>{alasanKunci.untuk} masih terkunci.</b> Selesaikan <b>{alasanKunci.butuh}</b> dulu — {alasanKunci.untuk} diturunkan darinya.
            </div>
          )}
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
                    <button
                      className={'btn btn-sm btn-primary' + (locked ? ' terkunci' : '')}
                      aria-disabled={!!locked}
                      title={locked ? `Selesaikan ${needName} dulu. ${s.nama} diturunkan darinya.` : undefined}
                      onClick={() => {
                        if (locked) {
                          setAlasanKunci({ untuk: s.nama, butuh: needName });
                        } else {
                          setAlasanKunci(null);
                          setStepKey(s.key);
                        }
                      }}
                    >
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
  // Sesi persona guru sebelum mulai menyusun — hanya bila belum pernah diisi/dilewati.
  return (
    <GerbangPersona konteks={{ jenjang: project.jenjang, fase: project.fase, kelas: project.kelas, mapel: project.mapel }}>
      {konten}
    </GerbangPersona>
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
  const [teks, setTeks] = useState(() => {
    // Pulihkan draft input (mis. teks CP yang ditempel) bila ada
    try {
      const raw = localStorage.getItem(kunciAkun('ma-draf-ruang-' + stepKey));
      if (raw) { const d = JSON.parse(raw); return d.teks || ''; }
    } catch { /* abaikan */ }
    return '';
  });       // CP resmi (tempel) / materi tambahan
  // Simpan draft otomatis saat mengetik (tahan refresh)
  useEffect(() => {
    try {
      if (teks) localStorage.setItem(kunciAkun('ma-draf-ruang-' + stepKey), JSON.stringify({ teks, kapan: Date.now() }));
      else localStorage.removeItem(kunciAkun('ma-draf-ruang-' + stepKey));
    } catch { /* abaikan */ }
  }, [teks, stepKey]);
  const [autoJalan, setAutoJalan] = useState(false); // generate semua otomatis
  const [autoProgress, setAutoProgress] = useState(''); // teks progress
  const [sumber, setSumber] = useState('');     // markdown dokumen acuan
  const [sumberJudul, setSumberJudul] = useState('');
  const [acuanHilang, setAcuanHilang] = useState([]); // K2: daftar acuan yang tidak ditemukan
  const [markdown, setMarkdown] = useState('');
  const [modeTampil, setModeTampil] = useState('pratinjau'); // pratinjau | edit
  const [busy, setBusy] = useState(false);
  const [tahapLive, setTahapLive] = useState([]);   // tahapan asli dari server
  const [statusLive, setStatusLive] = useState({});
  const [tulisan, setTulisan] = useState([]);       // teks AI realtime per tahap (efek mengetik)
  const labelMap = useRef({});
  const tugasIdRef = useRef(null); // id tugas latar (tetap hidup saat pindah halaman)
  const [paywall, setPaywall] = useState(null);
  const [error, setError] = useState('');
  const [finalMd, setFinalMd] = useState('');
  // Deteksi generate yang terputus refresh: tawarkan lanjutkan satu klik.
  const [terputus, setTerputus] = useState(() => {
    try {
      const raw = localStorage.getItem(kunciAkun('ma-gen-ruang-' + stepKey));
      if (raw) {
        const d = JSON.parse(raw);
        // Anggap terputus bila mulai < 30 menit lalu (lebih dari itu dianggap basi)
        if (d && d.mulai && Date.now() - d.mulai < 30 * 60 * 1000) return d;
      }
    } catch { /* abaikan */ }
    return null;
  });
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
    setSumber(''); setSumberJudul(''); // K1: reset dulu, cegah acuan basi antar-langkah
    (async () => {
      const daftarAcuan = [need, ...(ACUAN_TAMBAHAN[stepKey] || [])].filter(Boolean);
      const bagian = [];
      const judulBagian = [];
      const hilang = [];
      for (const kunci of daftarAcuan) {
        if (paket.docs[kunci]) {
          try {
            const d = await getModul(paket.docs[kunci]);
            if (d && d.markdown) {
              bagian.push(`\n\n===== ACUAN: ${(d.judul || DOC_TYPES[kunci].nama).toUpperCase()} =====\n${d.markdown}`);
              judulBagian.push(d.judul || DOC_TYPES[kunci].nama);
            } else {
              hilang.push(DOC_TYPES[kunci].nama);
            }
          } catch { hilang.push(DOC_TYPES[kunci].nama); }
        }
      }
      setAcuanHilang(hilang);
      if (bagian.length > 0) {
        setSumber(bagian.join('\n'));
        setSumberJudul(judulBagian.join(', '));
      }
    })();
  }, [paket, need, stepKey]);

  const profile = getProfile();
  const info = {
    nama: profile.nama, nip: profile.nip, sekolah: profile.sekolah, tahunAjaran: paket.tahunAjaran || profile.tahunAjaran,
    jenjang: paket.jenjang, fase: paket.fase, kelas: paket.kelas, semester: paket.semester, mapel: paket.mapel,
    kepalaSekolah: profile.kepalaSekolah, nipKepalaSekolah: profile.nipKepalaSekolah,
    personaGuru: profile.persona || '',
    menitPerJP: profile.menitPerJP || 45,
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

  // Generate semua langkah berurutan otomatis: CP → ATP → Minggu Efektif → Distribusi JP → Prota → Prosem
  async function generateSemuaOtomatis() {
    if (autoJalan) return;
    setAutoJalan(true); setError(''); setPaywall(null);
    const docsBaru = { ...(paket.docs || {}) };
    const profile = getProfile();
    const infoAuto = {
      nama: profile.nama, nip: profile.nip, sekolah: profile.sekolah, tahunAjaran: paket.tahunAjaran || profile.tahunAjaran,
      jenjang: paket.jenjang, fase: paket.fase, kelas: paket.kelas, semester: paket.semester, mapel: paket.mapel,
      kepalaSekolah: profile.kepalaSekolah, nipKepalaSekolah: profile.nipKepalaSekolah,
      personaGuru: profile.persona || '',
      menitPerJP: profile.menitPerJP || 45,
    };
    try {
      for (const s of ALUR_PERENCANAAN) {
        const key = s.key;
        if (docsBaru[key]) { setAutoProgress(s.nama + ' — sudah ada, lewati'); continue; }
        setAutoProgress('Menyusun ' + s.nama + '...');
        // Bangun sumber dari rantai (pakai docsBaru yang sudah terisi run ini)
        const daftarAcuan = [BUTUH[key], ...(ACUAN_TAMBAHAN[key] || [])].filter(Boolean);
        const bagian = [];
        for (const kunci of daftarAcuan) {
          if (docsBaru[kunci]) {
            try {
              const d = await getModul(docsBaru[kunci]);
              if (d && d.markdown) bagian.push('\n\n===== ACUAN: ' + (d.judul || DOC_TYPES[kunci].nama).toUpperCase() + ' =====\n' + d.markdown);
            } catch { /* abaikan */ }
          }
        }
        const sumberAuto = bagian.join('\n');
        let md = '';
        await generateDocStream(key, infoAuto, '', key === 'cp' ? '' : sumberAuto, null, (ev) => {
          if (ev.tipe === 'selesai') md = ev.markdown || '';
          else if (ev.tipe === 'gagal') throw new Error(ev.error || 'Generate gagal.');
        });
        if (!md.trim()) throw new Error(s.nama + ': AI mengembalikan dokumen kosong.');
        // Simpan
        const payload = {
          docType: key, judul: extractTitle(md),
          jenjang: paket.jenjang, fase: paket.fase, kelas: paket.kelas, semester: paket.semester,
          mapel: paket.mapel, topik: '', nama: profile.nama, sekolah: profile.sekolah,
          tahunAjaran: paket.tahunAjaran || profile.tahunAjaran,
          markdown: md, images: [], paketId: paket.id,
          projectId: project?.id || undefined,
        };
        let docId = docsBaru[key];
        if (docId) await updateModul(docId, payload);
        else docId = await saveModul(payload);
        docsBaru[key] = docId;
        await updatePaket(paket.id, { docs: { ...docsBaru } });
        setAutoProgress(s.nama + ' — selesai ✓');
      }
      setAutoProgress('Semua selesai ✓');
      onKuotaChanged && onKuotaChanged();
    } catch (e) {
      if (e.code === 'kuota_habis') setPaywall({ mode: 'kuota_habis', detail: e.detail });
      else setError('Otomatis berhenti: ' + (e.message || 'Generate gagal.'));
      setAutoProgress('Berhenti — ' + (e.message || 'gagal'));
    } finally {
      setAutoJalan(false);
    }
  }

  async function handleGenerate() {
    setError(''); setPaywall(null); setBusy(true);
    setTahapLive([]); setStatusLive({}); setTulisan([]); labelMap.current = {};
    setTerputus(null);
    // Tandai generate berjalan (untuk deteksi terputus saat refresh)
    try {
      localStorage.setItem(kunciAkun('ma-gen-ruang-' + stepKey), JSON.stringify({
        stepKey, mulai: Date.now(),
      }));
    } catch { /* abaikan */ }
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
      // Bersihkan penanda generate + draft (sudah jadi dokumen)
      try {
        localStorage.removeItem(kunciAkun('ma-gen-ruang-' + stepKey));
        localStorage.removeItem(kunciAkun('ma-draf-ruang-' + stepKey));
      } catch { /* abaikan */ }
      // Simpan hasil ke tugas latar: bila pengguna pindah halaman lalu kembali
      // via kartu floating, hasilnya bisa dipulihkan dari sini.
      tugasSelesai(tid, { markdown: md, stepKey });
      setMarkdown(md); setFinalMd(md);
      onKuotaChanged && onKuotaChanged();
    } catch (e) {
      try { localStorage.removeItem(kunciAkun('ma-gen-ruang-' + stepKey)); } catch { /* abaikan */ }
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
    try { localStorage.removeItem(kunciAkun('ma-draf-ruang-' + stepKey)); } catch { /* abaikan */ }
    if (tugasIdRef.current) tutupTugas(tugasIdRef.current);
    if (tugasIdEfektif) tutupTugas(tugasIdEfektif);
    onClose();
  }

  const isCp = stepKey === 'cp';
  // Langkah yang mendukung unggah dokumen untuk dianalisis AI
  const bisaUnggah = ['atp', 'minggu_efektif'].includes(stepKey);

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
                <strong>Acuan:</strong> {sumberJudul || (need && DOC_TYPES[need] ? DOC_TYPES[need].nama : 'dokumen sebelumnya')}.{' '}{dt.nama}{' '}akan <strong>diturunkan langsung</strong> dari acuan tersebut. AI dilarang mengarang di luar acuan.
              </div>
              {acuanHilang.length > 0 && (
                <div className="alert alert-warn">
                  <strong>Peringatan:</strong> Dokumen acuan tidak ditemukan: {acuanHilang.join(', ')}. Hasil AI mungkin tidak valid tanpa acuan ini.
                </div>
              )}
              {sumber && (
                <details style={{ marginBottom: 14 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Lihat isi acuan</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, maxHeight: 220, overflow: 'auto', background: '#f4f2ec', padding: 12, border: '2px solid #1a1a1a' }}>{sumber.slice(0, 4000)}{sumber.length > 4000 ? '\n…' : ''}</pre>
                </details>
              )}
              <div className="field">
                <label>Catatan tambahan (opsional)</label>
                <textarea rows={3} placeholder="cth: fokus pada materi X, alokasi khusus…" value={teks} onChange={(e) => setTeks(e.target.value)} />
                {bisaUnggah && (
                  <UnggahDokumen
                    label="Unggah dokumen untuk dianalisis AI (PDF/DOCX/XLSX/TXT)"
                    onTeks={(isi, namaFile) => setTeks((t) => (t ? t + '\n\n' : '') + `[Dokumen terlampir: ${namaFile}]\n${isi}`)}
                  />
                )}
              </div>
            </>
          )}
          {terputus && !busy && !markdown && (
            <div className="alert alert-info">
              <b>Generate terputus</b> (halaman di-refresh saat AI bekerja). Input kamu tersimpan sebagai draft.
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={handleGenerate}>
                  Lanjutkan generate
                </button>
                <button type="button" className="btn btn-sm" onClick={() => {
                  setTerputus(null);
                  try { localStorage.removeItem(kunciAkun('ma-gen-ruang-' + stepKey)); } catch { /* abaikan */ }
                }}>
                  Abaikan
                </button>
              </div>
            </div>
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
          <div className="btn-row no-print" style={{ marginBottom: 12 }}>
            <button
              type="button" className={'btn btn-sm' + (modeTampil === 'pratinjau' ? ' btn-ink' : '')}
              onClick={() => setModeTampil('pratinjau')}
            >
              Pratinjau
            </button>
            <button
              type="button" className={'btn btn-sm' + (modeTampil === 'edit' ? ' btn-ink' : '')}
              onClick={() => setModeTampil('edit')}
            >
              Edit blok
            </button>
          </div>
          {modeTampil === 'pratinjau' ? (
            <DocPaper doc={{ markdown: finalMd || markdown, judul: extractTitle(finalMd || markdown) }} />
          ) : (
            <DocEditor
              key={stepKey + '-edit'}
              initialMarkdown={finalMd || markdown}
              images={[]}
              docType={dt.nama}
              docTitle={extractTitle(markdown)}
              topic={paket.mapel}
              onChange={(md) => setFinalMd(md)}
            />
          )}
          {error && <div className="alert alert-error">{error}</div>}
          <div className="btn-row no-print">
            <button className="btn" onClick={() => { if (tugasIdRef.current) { tutupTugas(tugasIdRef.current); tugasIdRef.current = null; } setMarkdown(''); setFinalMd(''); }}>Generate Ulang</button>
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
