import { useEffect, useState } from 'react';
import './styles.css';
import Wizard, { getDraft } from './components/Wizard';
import DocView from './components/DocView';
import RuangPerencanaan from './components/RuangPerencanaan';
import GeneratorPaket from './components/GeneratorPaket';
import Topbar from './components/Topbar';
import Pengaturan from './components/Pengaturan';
import { ProyekList, ProyekDetail } from './components/Proyek';
import { DOC_TYPES } from './lib/docs';
import { listModuls, getModul, listProjects, getProject, migrasiPaketKeProyek } from './lib/db';
import { getSupabase, getSession } from './lib/supabase';
import { fetchKuota } from './lib/kuota';

const WA_LINK = 'https://wa.me/6285359907696?text=Halo%2C%20saya%20butuh%20bantuan%20ModulAjar';

function Landing({ onStart }) {
  return (
    <div className="wrap">
      <section className="hero-land">
        <span className="kicker">Untuk Guru Indonesia</span>
        <h1>Perangkat Ajar<br />Lengkap dalam<br /><span className="accent">Hitungan Menit.</span></h1>
        <p>
          Modul Ajar, ATP, Prota, Prosem, LKPD, Bank Soal, KKTP, sampai CP.
          Disusun mengikuti alur Kurikulum Merdeka yang benar
          (CP, ATP, Prota, Prosem, baru Modul), bisa diedit per blok,
          dilengkapi gambar berlisensi.
        </p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onStart}>Mulai Membuat</button>
          <a className="btn" href="#fitur">Lihat Fitur</a>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {Array(2).fill('MODUL AJAR · ATP · CP · PROTA · PROSEM · LKPD · BANK SOAL · KKTP · ').map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>

      <section id="fitur" style={{ marginTop: 40 }}>
        <span className="kicker">Fitur</span>
        <h2 className="sec-title">Satu aplikasi,<br />delapan perangkat.</h2>
        <div className="doc-grid">
          {Object.entries(DOC_TYPES).map(([key, d]) => (
            <div className="card doc-card-land" key={key}>
              <span className="chip red">{d.tag}</span>
              <h3>{d.nama}</h3>
              <p>{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 56 }}>
        <span className="kicker">Cara Kerja</span>
        <h2 className="sec-title">Dari ide ke dokumen<br />siap cetak.</h2>
        <div className="steps-land">
          {[
            ['01', 'Susun perencanaan', 'CP, ATP, Prota, Prosem berurutan di Ruang Perencanaan. Tiap dokumen jadi acuan berikutnya.'],
            ['02', 'Pilih dokumen', 'Modul, LKPD, Bank Soal, dengan acuan perencanaan yang sudah disusun.'],
            ['03', 'Generate', 'AI menyusun dari acuanmu. TP dan materi merujuk dokumen perencanaan, bukan karangan.'],
            ['04', 'Edit dan ekspor', 'Edit per blok, tulis ulang dengan AI, unduh sebagai Word.'],
          ].map(([n, t, d]) => (
            <div className="card step-land" key={n}><b>{n}</b><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <h2>Siap menyusun perangkat ajarmu?</h2>
        <p>Masuk dengan Google, langsung jalan di browser. Tanpa instal apa pun.</p>
        <button className="btn btn-primary" onClick={onStart}>Buat Dokumen Sekarang</button>
      </section>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

function LayarLogin({ err }) {
  const [busy, setBusy] = useState(false);
  const [gagal, setGagal] = useState(err || '');
  async function masuk() {
    setBusy(true);
    setGagal('');
    try {
      const sb = await getSupabase();
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (e) {
      setGagal('Tidak bisa membuka halaman login Google (' + (e.message || 'kesalahan tidak dikenal') + '). Periksa koneksi internet, lalu coba lagi.');
      setBusy(false);
    }
  }
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo" aria-hidden="true">M</div>
        <span className="kicker">Untuk Guru Indonesia</span>
        <h1>Perangkat ajar lengkap dalam hitungan menit</h1>
        <ul className="login-points">
          <li><span className="tick" aria-hidden="true">✓</span><span>Susun CP sampai KKTP mengikuti alur Kurikulum Merdeka yang runtut.</span></li>
          <li><span className="tick" aria-hidden="true">✓</span><span>Edit tiap bagian per blok, lalu unduh sebagai dokumen Word.</span></li>
          <li><span className="tick" aria-hidden="true">✓</span><span>Paket besar dikerjakan server. Browser boleh ditutup, pekerjaan tetap jalan.</span></li>
        </ul>
        {gagal && (
          <div className="alert alert-error" role="alert" style={{ textAlign: 'left' }}>
            <b>Gagal masuk.</b> {gagal}
          </div>
        )}
        <button className="btn btn-google" onClick={masuk} disabled={busy}>
          <GoogleG /> {busy ? 'Membuka Google…' : 'Masuk dengan Google'}
        </button>
        <p className="login-note">Datamu tersimpan di akunmu dan bisa dibuka dari perangkat mana pun.</p>
      </div>
    </div>
  );
}

function LayarTunggu({ pesan }) {
  return (
    <div className="wrap narrow" style={{ textAlign: 'center', paddingTop: 80 }}>
      <div className="loader-wrap">
        <div className="spinner" role="status" aria-label="Memuat" />
        <p>{pesan || 'Memuat…'}</p>
      </div>
    </div>
  );
}

// Posisi halaman tersimpan agar refresh tidak melempar ke halaman utama.
// Format: {view, docId, projectId} (docId untuk view 'detail', projectId untuk 'proyek').
const VIEW_KEY = 'ma-view';
const VIEW_VALID = ['landing', 'app', 'wizard', 'detail', 'ruang', 'paket', 'pengaturan', 'proyek'];
function bacaViewTersimpan() {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !VIEW_VALID.includes(d.view)) return null;
    return d;
  } catch { return null; }
}

export default function App() {
  const [auth, setAuth] = useState('loading'); // loading | login | app
  const [user, setUser] = useState(null);
  const [authErr, setAuthErr] = useState('');
  // Lazy dari localStorage agar tidak ada flash halaman utama saat refresh
  const [view, setView] = useState(() => bacaViewTersimpan()?.view || 'landing'); // landing | app | wizard | detail | ruang | paket | pengaturan | proyek
  const [restoring, setRestoring] = useState(() => {
    const d = bacaViewTersimpan();
    return (d?.view === 'detail' && !!d.docId) || (d?.view === 'proyek' && !!d.projectId);
  });
  const [moduls, setModuls] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectAktif, setProjectAktif] = useState(null);
  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState(null);
  const [wizardKey, setWizardKey] = useState(0);
  const [wizardPaket, setWizardPaket] = useState(null);
  const [wizardProyek, setWizardProyek] = useState(null);
  const [ruangProyek, setRuangProyek] = useState(null);
  const [wizardTurunan, setWizardTurunan] = useState(null); // { docType, modulId }
  const [kuota, setKuota] = useState(null); // { admin, batas, dipakai, sisa, tanggal } | null

  // Terapkan preferensi ukuran teks sesegera mungkin
  useEffect(() => {
    if (localStorage.getItem('ma-font-besar') === '1') {
      document.documentElement.classList.add('ma-font-besar');
    }
  }, []);

  async function muatKuota() {
    setKuota(await fetchKuota());
  }

  async function refresh() {
    const all = await listModuls();
    for (const m of all) if (!m.docType) m.docType = 'modul'; // normalisasi dokumen lama
    setModuls(all);
    setProjects(await listProjects());
    setDraft(await getDraft());
    muatKuota();
  }

  useEffect(() => {
    let stop = false;
    let stopSub = null;
    (async () => {
      try {
        const sb = await getSupabase();
        const sess = await getSession();
        if (!stop) { setUser(sess?.user || null); setAuth(sess ? 'app' : 'login'); }
        const { data: sub } = sb.auth.onAuthStateChange((_ev, sess2) => {
          if (!stop) { setUser(sess2?.user || null); setAuth(sess2 ? 'app' : 'login'); }
        });
        stopSub = () => sub.subscription.unsubscribe();
      } catch (e) {
        if (!stop) { setAuthErr(e.message || String(e)); setAuth('login'); }
      }
    })();
    return () => { stop = true; if (stopSub) stopSub(); };
  }, []);
  useEffect(() => {
    if (auth === 'app') {
      (async () => {
        await migrasiPaketKeProyek(); // sekali jalan: paket lama menjadi proyek
        await refresh();
      })();
    }
  }, [auth]);

  // Restore posisi tersimpan setelah login (hanya setelah auth==='app')
  useEffect(() => {
    if (auth !== 'app') return;
    const d = bacaViewTersimpan();
    if (!d) { setRestoring(false); return; }
    if (d.view === 'proyek' && d.projectId) {
      let stop = false;
      getProject(d.projectId).then((p) => {
        if (stop) return;
        if (p) { setProjectAktif(p); setView('proyek'); }
        else setView('app');
      }).catch(() => { if (!stop) setView('app'); })
        .finally(() => { if (!stop) setRestoring(false); });
      return () => { stop = true; };
    }
    if (d.view === 'detail' && d.docId) {
      let stop = false;
      getModul(d.docId).then((m) => {
        if (stop) return;
        if (m) {
          if (!m.docType) m.docType = 'modul';
          setActive(m);
          setView('detail');
        } else {
          setView('app');
        }
      }).catch(() => { if (!stop) setView('app'); })
        .finally(() => { if (!stop) setRestoring(false); });
      return () => { stop = true; };
    }
    setRestoring(false);
  }, [auth]);

  // Simpan posisi setiap view/active berubah (hanya saat sudah login)
  useEffect(() => {
    if (auth !== 'app' || restoring) return;
    if (view === 'detail' && !active?.id) return; // restore belum selesai, jangan timpa
    if (view === 'proyek' && !projectAktif?.id) return;
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({
        view,
        docId: view === 'detail' ? active?.id || null : null,
        projectId: view === 'proyek' ? projectAktif?.id || null : null,
      }));
    } catch { /* abaikan */ }
  }, [auth, view, active, projectAktif, restoring]);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  function startNew(paketId, projectId) {
    setWizardPaket(paketId || null);
    setWizardProyek(projectId || null);
    setWizardTurunan(null);
    setWizardKey((k) => k + 1);
    setView('wizard');
  }
  function startTurunan(docType, modulId) { setWizardTurunan({ docType, modulId }); setWizardPaket(null); setWizardProyek(null); setWizardKey((k) => k + 1); setView('wizard'); }
  async function openDoc(id) {
    const d = await getModul(id);
    if (d && !d.docType) d.docType = 'modul';
    setActive(d); setView('detail');
  }
  async function openProyek(id) {
    const p = await getProject(id);
    if (!p) return;
    setProjectAktif(p); setView('proyek');
  }
  const goApp = () => { setView('app'); refresh(); };
  const goRuang = (projectId) => { setRuangProyek(projectId || null); setView('ruang'); };

  async function signOut() {
    const sb = await getSupabase();
    await sb.auth.signOut();
    setUser(null);
    setActive(null);
    try { localStorage.removeItem(VIEW_KEY); } catch { /* abaikan */ }
    setView('landing');
  }

  if (auth === 'loading') return <LayarTunggu pesan="Menyiapkan aplikasi…" />;
  if (auth === 'login') return <LayarLogin err={authErr} />;
  if (restoring) return <LayarTunggu pesan="Memuat dokumen…" />;

  return (
    <>
      <Topbar
        view={view}
        onNav={(v) => { setView(v); if (v === 'app') refresh(); }}
        user={user}
        kuota={kuota}
        onOpenSettings={() => setView('pengaturan')}
        onSignOut={signOut}
      />

      {view === 'landing' && <Landing onStart={goApp} />}

      {view === 'wizard' && (
        <Wizard
          key={wizardKey}
          initial={draft && !draft.markdown ? { form: draft.form } : undefined}
          preselectPaketId={wizardPaket}
          preselectProjectId={wizardProyek}
          preselectDocType={wizardTurunan?.docType}
          preselectModulId={wizardTurunan?.modulId}
          waLink={WA_LINK}
          kuota={kuota}
          onKuotaChanged={muatKuota}
          onCancel={goApp}
          onDone={(id) => { openDoc(id); refresh(); }}
        />
      )}

      {view === 'ruang' && (
        <RuangPerencanaan
          onBack={goApp} onOpenDoc={openDoc}
          onBuatModul={(pid, projId) => startNew(pid, projId)}
          preselectProjectId={ruangProyek}
          waLink={WA_LINK} onKuotaChanged={muatKuota}
        />
      )}

      {view === 'paket' && (
        <GeneratorPaket onBack={goApp} onOpenDoc={openDoc} onChanged={refresh} waLink={WA_LINK} kuota={kuota} onKuotaChanged={muatKuota} />
      )}

      {view === 'detail' && active && (
        <DocView
          doc={active}
          onBack={goApp}
          onDeleted={goApp}
          onChanged={refresh}
          onBuatTurunan={startTurunan}
        />
      )}

      {view === 'pengaturan' && (
        <Pengaturan user={user} kuota={kuota} waLink={WA_LINK} onRefresh={refresh} onSignOut={signOut} />
      )}

      {view === 'proyek' && projectAktif && (
        <ProyekDetail
          key={projectAktif.id}
          project={projectAktif}
          docs={moduls}
          onBack={goApp}
          onOpenDoc={openDoc}
          onRuang={() => goRuang(projectAktif.id)}
          onBuatModul={() => startNew(null, projectAktif.id)}
          onChanged={refresh}
        />
      )}

      {view === 'app' && (
        <div className="wrap">
          <span className="kicker">Beranda</span>
          <h1 className="page">Proyek Perangkat Ajar</h1>
          <p className="lead">Satu proyek untuk satu mata pelajaran. Semua dokumennya terkumpul rapi di satu tempat.</p>

          <div className="card flow-hero">
            <div className="flow-num" aria-hidden="true">01</div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3 style={{ margin: '0 0 4px' }}>Ruang Perencanaan</h3>
              <p style={{ margin: '0 0 12px', fontSize: 14 }}>
                Susun CP, ATP, Prota, Prosem di dalam proyek. Dari proyek yang jadi, buat Modul Ajar,
                lalu LKPD, Bank Soal, dan KKTP. Semua saling merujuk.
              </p>
              {projects.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {projects.slice(0, 4).map((p) => (
                    <span key={p.id} className="chip">
                      {[p.mapel, p.kelas].filter(Boolean).join(' ') || p.nama}
                    </span>
                  ))}
                </div>
              )}
              <button className="btn btn-primary" onClick={() => goRuang()}>
                {projects.length === 0 ? 'Mulai Perencanaan' : 'Buka Ruang Perencanaan'}
              </button>
            </div>
          </div>

          {draft && !draft.markdown && (
            <div className="alert alert-info">
              Ada draft yang belum selesai.
              <button className="btn btn-sm btn-ink" style={{ marginLeft: 10 }} onClick={() => startNew()}>Lanjutkan Draft</button>
            </div>
          )}

          <ProyekList
            projects={projects}
            docs={moduls}
            onOpen={openProyek}
            onOpenDoc={openDoc}
            onChanged={refresh}
          />
        </div>
      )}

      <footer className="footer">
        <div>ModulAjar oleh Alfaruq Asri, S.Pd.</div>
        <a className="btn btn-sm btn-primary" style={{ marginTop: 10 }} href={WA_LINK} target="_blank" rel="noreferrer">
          Butuh Bantuan? Chat WA
        </a>
      </footer>
    </>
  );
}
