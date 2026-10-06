import { useEffect, useState, useRef } from 'react';
import './styles.css';
import Wizard, { getDraft } from './components/Wizard';
import DocView from './components/DocView';
import RuangPerencanaan from './components/RuangPerencanaan';
import GeneratorPaket from './components/GeneratorPaket';
import Topbar from './components/Topbar';
import Landing from './components/Landing';
import DocsView from './components/DocsView';
import HalamanMasukan from './components/HalamanMasukan';
import AdminDashboard from './components/AdminDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import { setUidLokal, kunciAkun } from './lib/akunLokal';
import Pengaturan from './components/Pengaturan';
import { ProyekList, ProyekDetail } from './components/Proyek';
import { DOC_TYPES } from './lib/docs';
import { listModuls, getModul, listProjects, getProject, migrasiPaketKeProyek } from './lib/db';
import { getSupabase, getSession, getTurnstileSiteKey } from './lib/supabase';
import { klaimReferal } from './lib/api';
import { fetchKuota } from './lib/kuota';

const WA_LINK = 'https://wa.me/6285359907696?text=Halo%2C%20saya%20butuh%20bantuan%20ModulAjar';

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

function LayarLogin({ err, onBatal }) {
  const [busy, setBusy] = useState(false);
  const [gagal, setGagal] = useState(err || '');
  const [siteKey, setSiteKey] = useState(null); // null = memuat, '' = captcha nonaktif
  const [captchaOk, setCaptchaOk] = useState(false);
  const widgetRef = useRef(null);
  const tokenRef = useRef('');

  // Muat site key + widget Cloudflare Turnstile (bila dikonfigurasi)
  useEffect(() => {
    let stop = false;
    (async () => {
      const key = await getTurnstileSiteKey();
      if (stop) return;
      setSiteKey(key);
      if (!key) return;
      const pasang = () => {
        if (stop || !widgetRef.current || !window.turnstile) return;
        try {
          window.turnstile.render(widgetRef.current, {
            sitekey: key,
            theme: 'light',
            callback: (token) => { tokenRef.current = token; setCaptchaOk(true); },
            'expired-callback': () => { tokenRef.current = ''; setCaptchaOk(false); },
            'error-callback': () => { tokenRef.current = ''; setCaptchaOk(false); },
          });
        } catch { /* widget gagal dimuat: biarkan tombol nonaktif */ }
      };
      if (window.turnstile) { pasang(); return; }
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true; s.defer = true;
      s.onload = pasang;
      document.head.appendChild(s);
    })();
    return () => { stop = true; };
  }, []);

  async function masuk() {
    setBusy(true);
    setGagal('');
    try {
      // Bila captcha aktif, verifikasi token ke server dulu
      if (siteKey) {
        if (!tokenRef.current) throw new Error('Selesaikan verifikasi captcha dulu.');
        const r = await fetch('/api/verifikasi-captcha', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenRef.current }),
        });
        const d = await r.json().catch(() => ({}));
        if (!d.ok) throw new Error(d.error || 'Verifikasi captcha gagal.');
      }
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
  const perluCaptcha = !!siteKey;
  return (
    <div className="login-wrap">
      <div className="login-card">
        {onBatal && (
          <div style={{ textAlign: 'left', marginBottom: 18 }}>
            <button type="button" className="btn btn-sm" onClick={onBatal}>
              ← Kembali
            </button>
          </div>
        )}
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
        {perluCaptcha && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 16px' }}>
            <div ref={widgetRef} aria-label="Verifikasi keamanan Cloudflare" />
          </div>
        )}
        <button className="btn btn-google" onClick={masuk} disabled={busy || (perluCaptcha && !captchaOk)}>
          <GoogleG /> {busy ? 'Membuka Google…' : 'Masuk dengan Google'}
        </button>
        {perluCaptcha && !captchaOk && (
          <p className="hint" style={{ marginTop: 10 }}>Selesaikan verifikasi keamanan di atas untuk masuk.</p>
        )}
        <p className="login-note">Datamu tersimpan di akunmu dan bisa dibuka dari perangkat mana pun.</p>
      </div>
    </div>
  );
}

function LayarTunggu({ pesan }) {
  return (
    <div className="boot-screen">
      <div className="in">
        <div className="logo">MODULAJAR<small>PERANGKAT AJAR AI</small></div>
        <div className="spinner" role="status" aria-label="Memuat" />
        <p>{pesan || 'Memuat…'}</p>
      </div>
    </div>
  );
}

// Posisi halaman tersimpan agar refresh tidak melempar ke halaman utama.
// Format: {view, docId, projectId, ruangProjectId} (docId untuk 'detail', projectId untuk 'proyek', ruangProjectId untuk 'ruang').
const VIEW_KEY = 'ma-view';
const VIEW_VALID = ['landing', 'app', 'wizard', 'detail', 'ruang', 'paket', 'pengaturan', 'proyek', 'docs', 'admin', 'masukan'];
function bacaViewTersimpan() {
  try {
    const raw = localStorage.getItem(kunciAkun(VIEW_KEY));
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
  const [mintaLogin, setMintaLogin] = useState(false); // belum login: tampilkan form login di atas landing
  // Buka form login: bersihkan hash anchor landing (mis. #alur) agar URL rapi
  const bukaLogin = () => {
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setMintaLogin(true);
  };
  // Lazy dari localStorage agar tidak ada flash halaman utama saat refresh.
  // null = belum dipulihkan (dibedakan dari 'landing' agar user login tidak
  // sekilas melihat landing publik saat tidak ada posisi tersimpan).
  const [view, setView] = useState(() => bacaViewTersimpan()?.view || null); // null | landing | app | wizard | detail | ruang | paket | pengaturan | proyek | docs | admin | masukan | tidak-ditemukan
  const [restoring, setRestoring] = useState(() => {
    const d = bacaViewTersimpan();
    return (d?.view === 'detail' && !!d.docId) || (d?.view === 'proyek' && !!d.projectId);
  });
  const [moduls, setModuls] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectAktif, setProjectAktif] = useState(null);
  const [active, setActive] = useState(null);
  const [asalDoc, setAsalDoc] = useState(null); // halaman asal sebelum buka dokumen (untuk tombol Kembali)
  const [docGagalId, setDocGagalId] = useState(null); // id dokumen yang gagal dimuat karena jaringan (untuk tombol Coba lagi)
  const bukaRef = useRef(0); // tiket pembatalan fetch openDoc (mencegah race navigasi)
  const [draft, setDraft] = useState(null);
  const [wizardKey, setWizardKey] = useState(0);
  const [wizardPaket, setWizardPaket] = useState(null);
  const [wizardProyek, setWizardProyek] = useState(null);
  const [ruangProyek, setRuangProyek] = useState(() => bacaViewTersimpan()?.ruangProjectId || null);
  const [wizardTurunan, setWizardTurunan] = useState(null); // { docType, modulId }
  const [wizardDocType, setWizardDocType] = useState(null); // preselect jenis dokumen satuan dari beranda
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
        if (!stop) { setUidLokal(sess?.user?.id || null); setUser(sess?.user || null); setAuth(sess ? 'app' : 'login'); if (sess) setMintaLogin(false); }
        const { data: sub } = sb.auth.onAuthStateChange((_ev, sess2) => {
          if (!stop) { setUidLokal(sess2?.user?.id || null); setUser(sess2?.user || null); setAuth(sess2 ? 'app' : 'login'); if (sess2) setMintaLogin(false); }
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

  // Klaim referal sekali setelah login pertama (kode dari ?ref= di landing).
  // Gagal klaim ditangani diam-diam agar tidak mengganggu login.
  useEffect(() => {
    if (auth !== 'app') return;
    let kode = null;
    try { kode = localStorage.getItem(kunciAkun('ma-ref')) || localStorage.getItem('ma-ref'); } catch { /* abaikan */ }
    if (!kode) return;
    (async () => {
      try { await klaimReferal(kode); } catch { /* diam-diam */ }
      try { localStorage.removeItem(kunciAkun('ma-ref')); localStorage.removeItem('ma-ref'); } catch { /* abaikan */ }
    })();
  }, [auth]);

  // Restore posisi tersimpan setelah login (hanya setelah auth==='app').
  // Pengaman anti-macet: bila 20 detik belum selesai (mis. dokumen acuan
  // tak kunjung termuat karena jaringan), paksa keluar dari layar
  // "Memuat halaman…" ke dashboard.
  useEffect(() => {
    if (auth !== 'app') return;
    let stop = false;
    const paksa = setTimeout(() => {
      if (stop) return;
      setView((v) => (v === null ? 'app' : v));
      setRestoring(false);
    }, 20000);
    const beres = () => { clearTimeout(paksa); if (!stop) setRestoring(false); };
    const d = bacaViewTersimpan();
    // Tidak ada posisi tersimpan (atau tidak valid) -> dashboard, bukan landing publik.
    if (!d) { setView('app'); beres(); }
    else if (d.view === 'proyek' && d.projectId) {
      getProject(d.projectId).then((p) => {
        if (stop) return;
        if (p) { setProjectAktif(p); setView('proyek'); }
        else setView('app');
      }).catch(() => { if (!stop) setView('app'); }).finally(beres);
    }
    else if (d.view === 'detail' && d.docId) {
      getModul(d.docId).then((m) => {
        if (stop) return;
        if (m) {
          if (!m.docType) m.docType = 'modul';
          setActive(m);
          setView('detail');
        } else {
          setView('app');
        }
      }).catch(() => { if (!stop) setView('app'); }).finally(beres);
    }
    else if (d.view === 'ruang') {
      // Kembalikan proyek ruang yang sedang dibuka; tanpa itu jatuh ke 'app'
      if (d.ruangProjectId) setRuangProyek(d.ruangProjectId);
      else { setView('app'); }
      beres();
    }
    else if (d.view === 'wizard') {
      // Wizard adalah alur transien (form tidak dipersist) -> kembali ke app
      setView('app');
      beres();
    }
    else beres();
    return () => { stop = true; clearTimeout(paksa); };
  }, [auth]);

  // Simpan posisi setiap view/active berubah (hanya saat sudah login).
  // 'tidak-ditemukan' dan null tidak disimpan agar reload tidak terjebak di halaman error.
  useEffect(() => {
    if (auth !== 'app' || restoring) return;
    if (!view || view === 'tidak-ditemukan') return;
    if (view === 'detail' && !active?.id) return; // restore belum selesai, jangan timpa
    if (view === 'proyek' && !projectAktif?.id) return;
    if (view === 'ruang' && !ruangProyek) return;
    try {
      localStorage.setItem(kunciAkun(VIEW_KEY), JSON.stringify({
        view,
        docId: view === 'detail' ? active?.id || null : null,
        projectId: view === 'proyek' ? projectAktif?.id || null : null,
        ruangProjectId: view === 'ruang' ? ruangProyek || null : null,
      }));
    } catch { /* abaikan */ }
  }, [auth, view, active, projectAktif, ruangProyek, restoring]);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  function startNew(paketId, projectId) {
    setWizardPaket(paketId || null);
    setWizardProyek(projectId || null);
    setWizardTurunan(null);
    setWizardDocType(null);
    setWizardKey((k) => k + 1);
    setView('wizard');
  }
  function startTurunan(docType, modulId) { setWizardTurunan({ docType, modulId }); setWizardDocType(null); setWizardPaket(null); setWizardProyek(null); setWizardKey((k) => k + 1); setView('wizard'); }
  function startSatuan(docType) { setWizardDocType(docType || null); setWizardTurunan(null); setWizardPaket(null); setWizardProyek(null); setWizardKey((k) => k + 1); setView('wizard'); }
  async function openDoc(id, asal) {
    const tiket = ++bukaRef.current; // (B) batalkan bila pengguna navigasi sebelum fetch selesai
    let d = null;
    try {
      d = await getModul(id);
    } catch (e) {
      if (tiket !== bukaRef.current) return;
      // (C) Gangguan jaringan: bedakan dari "dokumen tidak ada"
      setActive(null);
      setDocGagalId(id);
      setView('tidak-ditemukan');
      const p = '/dokumen/' + id;
      if (window.location.pathname !== p) history.pushState(null, '', p);
      return;
    }
    if (tiket !== bukaRef.current) return;
    setDocGagalId(null);
    if (!d) {
      // Dokumen tidak ada / sudah dihapus -> halaman 404
      setActive(null);
      setView('tidak-ditemukan');
      const p = '/dokumen/' + id;
      if (window.location.pathname !== p) history.pushState(null, '', p);
      return;
    }
    if (!d.docType) d.docType = 'modul';
    // asal === undefined: pertahankan asal yang sudah dicatat (mis. via klik link)
    if (asal !== undefined) setAsalDoc(asal || null);
    setActive(d); setView('detail');
    const p = '/dokumen/' + id;
    if (window.location.pathname !== p) history.pushState(null, '', p);
  }
  // Catat halaman asal sebelum buka dokumen (untuk tombol Kembali)
  const catatAsal = (asal) => setAsalDoc(asal || null);
  function kembaliDariDoc() {
    bukaRef.current++; // (B) batalkan fetch openDoc yang masih berjalan
    if (window.location.pathname.startsWith('/dokumen/')) {
      history.replaceState(null, '', '/');
    }
    const a = asalDoc; setAsalDoc(null);
    if (a?.view === 'proyek' && a.projectId) {
      // (G3) Proyek asal mungkin sudah dihapus -> fallback ke beranda agar tidak stuck
      openProyek(a.projectId).then((ok) => { if (!ok) goApp(); });
    }
    else if (a?.view === 'ruang' && a.ruangProjectId) goRuang(a.ruangProjectId);
    else if (a?.view === 'paket') setView('paket');
    else goApp();
  }
  // Routing dokumen via path /dokumen/<id> (bukan hash, agar tautan rapi dan
  // tidak rusak saat dibagikan). Mendukung: tombol Lihat, klik kanan > buka di
  // tab baru, tombol back browser, dan link hash lama (#/dokumen/<id>) yang
  // otomatis dikonversi ke path baru.
  const pertamaRouting = useRef(true);
  useEffect(() => {
    if (auth !== 'app') return;
    const idDokumenDariUrl = () => {
      const hm = window.location.hash.match(/^#\/dokumen\/([\w-]+)/);
      if (hm) {
        history.replaceState(null, '', '/dokumen/' + hm[1]);
        return hm[1];
      }
      const pm = window.location.pathname.match(/^\/dokumen\/([\w-]+)\/?$/);
      return pm ? pm[1] : null;
    };
    // (A) Sinkronisasi URL: navigasi programmatic menjauh dari dokumen (setView
    // tanpa ubah URL) harus mereset URL ke '/', kalau tidak bukaDariUrl() akan
    // membuka ulang dokumen -> bounce. Dilewati pada proses pertama agar deep
    // link (/dokumen/<id> dibuka di tab baru) tetap dibuka.
    if (!pertamaRouting.current) {
      if ((view !== 'detail' && view !== 'tidak-ditemukan') && window.location.pathname.startsWith('/dokumen/')) {
        history.replaceState(null, '', '/');
        bukaRef.current++; // (B) batalkan fetch openDoc yang masih berjalan
      }
    }
    pertamaRouting.current = false;
    const bukaDariUrl = () => {
      const id = idDokumenDariUrl();
      if (!id) return false;
      // Sudah di halaman 404 untuk id ini (tak ada / gagal jaringan): jangan buka ulang
      if (view === 'tidak-ditemukan') return true;
      if (view !== 'detail' || active?.id !== id) openDoc(id, null); // (D) asal eksplisit
      return true;
    };
    const tandai404 = () => {
      const path = window.location.pathname;
      const matchDok = /^\/dokumen\/([\w-]+)\/?$/.test(path); // (G1) '/dokumen/' tanpa id -> 404
      if (path !== '/' && !matchDok && view !== 'tidak-ditemukan') {
        setView('tidak-ditemukan');
      }
    };
    bukaDariUrl();
    tandai404();
    // Tombol back/forward browser: kembali dari dokumen ke halaman asal
    const onPop = () => {
      if (!bukaDariUrl() && (view === 'detail' || view === 'tidak-ditemukan')) kembaliDariDoc();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, view, active]);
  // Bersihkan hash kosong ("#") dari URL agar tidak tampil aneh di address bar
  useEffect(() => {
    if (window.location.hash === '#') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);
  async function openProyek(id) {
    const p = await getProject(id);
    if (!p) return false;
    setProjectAktif(p); setView('proyek');
    return true;
  }
  const goApp = () => { setView('app'); refresh(); };
  const goRuang = (projectId) => { setRuangProyek(projectId || null); setView('ruang'); };

  async function signOut() {
    const sb = await getSupabase();
    await sb.auth.signOut();
    setUser(null);
    setActive(null);
    try { localStorage.removeItem(kunciAkun(VIEW_KEY)); } catch { /* abaikan */ }
    setUidLokal(null);
    history.replaceState(null, '', '/'); // (G2) jangan tinggalkan URL /dokumen/<id>
    setView('landing');
  }

  if (auth === 'loading') return <LayarTunggu pesan="Menyiapkan aplikasi…" />;
  // Belum login: tampilkan landing page dulu; form login muncul saat pengguna
  // memilih "Masuk" / "Mulai Membuat".
  if (auth === 'login') {
    if (mintaLogin) return <LayarLogin err={authErr} onBatal={() => setMintaLogin(false)} />;
    return (
      <>
        <Topbar
          view="landing"
          onNav={() => {}}
          user={null}
          kuota={null}
          onLogin={bukaLogin}
          onOpenSettings={() => {}}
          onOpenDocs={null}
          isAdmin={false}
          onSignOut={() => {}}
        />
        <ErrorBoundary key="landing-publik" onBack={() => {}}>
        <div className="view-enter">
          <Landing
            onStart={bukaLogin}
            onDocs={null}
            onMasukan={null}
            waLink={WA_LINK}
            onLogin={bukaLogin}
          />
        </div>
        </ErrorBoundary>
      </>
    );
  }
  if (restoring || view === null) return <LayarTunggu pesan="Memuat halaman…" />;

  return (
    <>
      <Topbar
        view={view}
        onNav={(v) => { setView(v); if (v === 'app') refresh(); }}
        user={user}
        kuota={kuota}
        onOpenSettings={() => setView('pengaturan')}
        onOpenDocs={() => setView('docs')}
        isAdmin={!!kuota?.admin}
        onSignOut={signOut}
        onKuotaChanged={muatKuota}
      />

      <ErrorBoundary key={view} onBack={goApp}>
      <div className="view-enter">
      {view === 'landing' && <Landing onStart={goApp} onDocs={() => setView('docs')} onMasukan={() => setView('masukan')} waLink={WA_LINK} />}

      {view === 'masukan' && (
        <HalamanMasukan
          mode={user ? 'saran' : 'kontak'}
          onBack={() => setView(user ? 'app' : 'landing')}
        />
      )}

      {view === 'docs' && <DocsView onBack={goApp} onMasukan={() => setView('masukan')} />}

      {view === 'tidak-ditemukan' && (
        <div className="wrap narrow" style={{ textAlign: 'center', paddingTop: 72 }}>
          <span className="kicker">404</span>
          <h1 className="page">Halaman tidak ditemukan</h1>
          {docGagalId ? (
            <p className="lead" style={{ maxWidth: '52ch', marginLeft: 'auto', marginRight: 'auto' }}>
              Koneksi bermasalah saat memuat dokumen. Periksa koneksi internet,
              lalu coba lagi.
            </p>
          ) : (
            <p className="lead" style={{ maxWidth: '52ch', marginLeft: 'auto', marginRight: 'auto' }}>
              Dokumen atau halaman yang kamu cari tidak ada, sudah dihapus,
              atau tautannya salah ketik.
            </p>
          )}
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            {docGagalId && (
              <button
                type="button" className="btn btn-primary"
                onClick={() => openDoc(docGagalId, null)}
              >
                Coba lagi
              </button>
            )}
            <button
              type="button" className={docGagalId ? 'btn' : 'btn btn-primary'}
              onClick={() => { setDocGagalId(null); history.replaceState(null, '', '/'); goApp(); }}
            >
              Kembali ke beranda
            </button>
          </div>
        </div>
      )}

      {view === 'admin' && kuota?.admin && <AdminDashboard onBack={goApp} />}

      {view === 'wizard' && (
        <Wizard
          key={wizardKey}
          initial={draft && !draft.markdown ? { form: draft.form, step: draft.step } : undefined}
          preselectPaketId={wizardPaket}
          preselectProjectId={wizardProyek}
          preselectDocType={wizardTurunan?.docType || wizardDocType}
          preselectModulId={wizardTurunan?.modulId}
          waLink={WA_LINK}
          kuota={kuota}
          onKuotaChanged={muatKuota}
          onCancel={goApp}
          onDone={(id) => { openDoc(id, null); refresh(); }}
        />
      )}

      {view === 'ruang' && (
        <RuangPerencanaan
          onBack={goApp} onOpenDoc={(id) => openDoc(id, { view: 'ruang', ruangProjectId: ruangProyek })}
          onCatatAsal={catatAsal}
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
          onBack={kembaliDariDoc}
          onDeleted={kembaliDariDoc}
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
          onCatatAsal={catatAsal}
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

          <div className="card">
            <div className="flow-num" aria-hidden="true">02</div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3 style={{ margin: '0 0 4px' }}>Buat Satu Dokumen</h3>
              <p style={{ margin: '0 0 12px', fontSize: 14 }}>
                Butuh satu saja? Pilih jenis dokumen — modul ajar 1 unit, KKTP saja, CP saja, dan lainnya.
                Memakai 1 kredit per dokumen jadi.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(DOC_TYPES).map(([key, dt]) => (
                  <button key={key} type="button" className="btn btn-sm" onClick={() => startSatuan(key)} title={dt.desc}>
                    {dt.nama}
                  </button>
                ))}
              </div>
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
      </div>
      </ErrorBoundary>

    </>
  );
}
