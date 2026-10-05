import { useEffect, useRef, useState } from 'react';
import './styles.css';
import Wizard, { getDraft } from './components/Wizard';
import DocView from './components/DocView';
import RuangPerencanaan from './components/RuangPerencanaan';
import GeneratorPaket from './components/GeneratorPaket';
import { DOC_TYPES } from './lib/docs';
import { listModuls, getModul, listPakets, paketProgress } from './lib/db';
import { getSupabase, getSession } from './lib/supabase';

const WA_LINK = 'https://wa.me/6285359907696?text=Halo%2C%20saya%20butuh%20bantuan%20ModulAjar';

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Reveal on scroll
function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); ob.disconnect(); } }, { threshold: 0.15 });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  return <div ref={ref} className={'reveal' + (vis ? ' on' : '')} style={{ transitionDelay: delay + 'ms' }}>{children}</div>;
}

function Landing({ onStart }) {
  return (
    <div className="wrap">
      <section className="hero-land">
        <div className="float-sq s1" /><div className="float-sq s2" /><div className="float-sq s3" />
        <span className="kicker red">Untuk Guru Indonesia</span>
        <h1>Perangkat Ajar<br />Lengkap dalam<br /><span className="accent">Hitungan Menit.</span></h1>
        <p>
          Modul Ajar, ATP, Prota, Prosem, LKPD, Bank Soal, KKTP, sampai CP —
          disusun AI mengikuti alur Kurikulum Merdeka yang benar (CP → ATP → Prota → Prosem → Modul),
          bisa diedit per blok, dilengkapi gambar berlisensi. Login dengan Google — datamu tersimpan aman dan bisa dibuka dari perangkat mana pun.
        </p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onStart}>Mulai Membuat</button>
          <a className="btn" href="#fitur">Lihat Fitur</a>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {Array(2).fill('MODUL AJAR • ATP • CP • PROTA • PROSEM • LKPD • BANK SOAL • KKTP • ').map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>

      <section id="fitur" style={{ marginTop: 40 }}>
        <Reveal><span className="kicker">Fitur</span></Reveal>
        <Reveal><h2 className="sec-title">Satu aplikasi,<br />delapan perangkat.</h2></Reveal>
        <div className="doc-grid">
          {Object.entries(DOC_TYPES).map(([key, d], i) => (
            <Reveal key={key} delay={i * 60}>
              <div className="card doc-card-land" onClick={onStart} role="button" tabIndex={0}>
                <span className="chip red">{d.tag}</span>
                <h3>{d.nama}</h3>
                <p>{d.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 56 }}>
        <Reveal><span className="kicker">Cara Kerja</span></Reveal>
        <Reveal><h2 className="sec-title">Dari ide ke dokumen<br />siap cetak.</h2></Reveal>
        <div className="steps-land">
          {[
            ['01', 'Susun perencanaan', 'CP → ATP → Prota → Prosem, berurutan di Ruang Perencanaan. Tiap dokumen jadi acuan berikutnya.'],
            ['02', 'Pilih dokumen', 'Modul, LKPD, Bank Soal — dengan acuan perencanaan yang sudah disusun.'],
            ['03', 'Generate AI', 'AI menyusun dari acuanmu — TP dan materi merujuk dokumen perencanaan, bukan karangan.'],
            ['04', 'Edit & ekspor', 'Edit per blok ala Gutenberg, tulis ulang dengan AI, unduh Word.'],
          ].map(([n, t, d], i) => (
            <Reveal key={n} delay={i * 80}>
              <div className="card step-land"><b>{n}</b><h3>{t}</h3><p>{d}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal>
        <section className="cta-band">
          <h2>Siap menyusun perangkat ajarmu?</h2>
          <p>Gratis. Login dengan Google, langsung jalan di browser.</p>
          <button className="btn btn-primary" onClick={onStart}>Buat Dokumen Sekarang</button>
        </section>
      </Reveal>
    </div>
  );
}

function LayarLogin({ onLogin, err }) {
  const [busy, setBusy] = useState(false);
  async function masuk() {
    setBusy(true);
    try {
      const sb = await getSupabase();
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (e) {
      alert('Gagal membuka login Google: ' + (e.message || e));
      setBusy(false);
    }
  }
  return (
    <div className="wrap">
      <section className="hero-land" style={{ textAlign: 'center' }}>
        <span className="kicker red">Untuk Guru Indonesia</span>
        <h1>ModulAjar<br /><span className="accent">Perangkat Ajar AI.</span></h1>
        <p>Masuk dengan akun Google untuk mulai menyusun CP, ATP, Prota, Prosem, Modul Ajar, LKPD, Bank Soal, dan KKTP.</p>
        {err && <div className="alert" style={{ textAlign: 'left' }}>{err}</div>}
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={masuk} disabled={busy}>
            {busy ? 'Membuka Google...' : 'Login dengan Google'}
          </button>
        </div>
      </section>
    </div>
  );
}

function LayarTunggu({ pesan }) {
  return (
    <div className="wrap">
      <section className="hero-land" style={{ textAlign: 'center' }}>
        <span className="kicker">ModulAjar</span>
        <p>{pesan || 'Memuat...'}</p>
      </section>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState('loading'); // loading | login | app
  const [authErr, setAuthErr] = useState('');
  const [view, setView] = useState('landing'); // landing | app | wizard | detail | ruang | paket
  const [moduls, setModuls] = useState([]);
  const [pakets, setPakets] = useState([]);
  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState(null);
  const [wizardKey, setWizardKey] = useState(0);
  const [wizardPaket, setWizardPaket] = useState(null);
  const [wizardTurunan, setWizardTurunan] = useState(null); // { docType, modulId }

  async function refresh() {
    const all = await listModuls();
    // Normalisasi: dokumen lama (sebelum kolom docType ada) semuanya Modul Ajar
    for (const m of all) if (!m.docType) m.docType = 'modul';
    setModuls(all);
    setPakets(await listPakets());
    setDraft(await getDraft());
  }
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const sb = await getSupabase();
        const sess = await getSession();
        if (!stop) setAuth(sess ? 'app' : 'login');
        const { data: sub } = sb.auth.onAuthStateChange((_ev, sess2) => {
          if (!stop) setAuth(sess2 ? 'app' : 'login');
        });
        stopSub = () => sub.subscription.unsubscribe();
      } catch (e) {
        if (!stop) { setAuthErr(e.message || String(e)); setAuth('login'); }
      }
    })();
    let stopSub = null;
    return () => { stop = true; if (stopSub) stopSub(); };
  }, []);
  useEffect(() => { if (auth === 'app') refresh(); }, [auth]);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  function startNew(paketId) { setWizardPaket(paketId || null); setWizardTurunan(null); setWizardKey((k) => k + 1); setView('wizard'); }
  function startTurunan(docType, modulId) { setWizardTurunan({ docType, modulId }); setWizardPaket(null); setWizardKey((k) => k + 1); setView('wizard'); }
  async function openDoc(id) {
    const d = await getModul(id);
    if (d && !d.docType) d.docType = 'modul'; // normalisasi dokumen lama
    setActive(d); setView('detail');
  }
  const goApp = () => { setView('app'); refresh(); };
  const goRuang = () => setView('ruang');

  if (auth === 'loading') return <LayarTunggu pesan="Menyiapkan aplikasi..." />;
  if (auth === 'login') return <LayarLogin err={authErr} />;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="logo" onClick={() => setView('landing')}>
            <div className="logo-mark">M</div>
            <div><b>ModulAjar</b><small>Perangkat Ajar AI</small></div>
          </div>
          <div className="spacer" />
          {view === 'landing' ? (
            <button className="btn btn-primary btn-sm" onClick={goApp}>Buka Aplikasi</button>
          ) : (
            <>
              <button className="btn btn-sm" style={{ background: '#fff' }} onClick={() => setView('paket')}>Generator Paket</button>
              <button className="btn btn-sm" style={{ background: '#fff' }} onClick={async () => { const sb = await getSupabase(); await sb.auth.signOut(); setView('landing'); }}>Keluar</button>
              {view === 'app' && <button className="btn btn-primary btn-sm" onClick={() => startNew()}>+ Buat Baru</button>}
              {view !== 'app' && <button className="btn btn-sm" style={{ background: '#fff' }} onClick={goApp}>Dokumen Saya</button>}
            </>
          )}
        </div>
      </header>

      {view === 'landing' && <Landing onStart={goApp} />}

      {view === 'wizard' && (
        <Wizard
          key={wizardKey}
          initial={draft && !draft.markdown ? { form: draft.form } : undefined}
          preselectPaketId={wizardPaket}
          preselectDocType={wizardTurunan?.docType}
          preselectModulId={wizardTurunan?.modulId}
          onCancel={goApp}
          onDone={(id) => { openDoc(id); refresh(); }}
        />
      )}

      {view === 'ruang' && (
        <RuangPerencanaan onBack={goApp} onOpenDoc={openDoc} onBuatModul={(pid) => startNew(pid)} />
      )}

      {view === 'paket' && (
        <GeneratorPaket onBack={goApp} onOpenDoc={openDoc} onChanged={refresh} />
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

      {view === 'app' && (
        <div className="wrap">
          <span className="kicker">Beranda</span>
          <h1 className="page">Perangkat Ajarmu</h1>
          <p className="lead">Satu alur runtut: Perencanaan → Modul Ajar → LKPD & Asesmen.</p>

          <div className="card flow-hero">
            <div className="flow-num">01</div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3 style={{ margin: '0 0 4px' }}>Ruang Perencanaan</h3>
              <p style={{ margin: '0 0 12px', fontSize: 14 }}>
                Susun CP → ATP → Prota → Prosem. Dari paket yang jadi, buat Modul Ajar —
                lalu LKPD, Bank Soal, dan KKTP langsung dari modulnya. Semua saling merujuk.
              </p>
              {pakets.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {pakets.slice(0, 4).map((p) => {
                    const prog = paketProgress(p);
                    return (
                      <span key={p.id} className="chip" style={prog === 5 ? { background: 'var(--ink)', color: '#fff' } : {}}>
                        {p.mapel} · {prog}/5
                      </span>
                    );
                  })}
                </div>
              )}
              <button className="btn btn-primary" onClick={goRuang}>
                {pakets.length === 0 ? 'Mulai Perencanaan' : 'Buka Ruang Perencanaan'}
              </button>
            </div>
          </div>

          {draft && !draft.markdown && (
            <div className="alert alert-info">
              Ada draft yang belum selesai.
              <button className="btn btn-sm btn-ink" style={{ marginLeft: 10 }} onClick={() => startNew()}>Lanjutkan Draft</button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 4px' }}>
            <div className="flow-num sm">02</div>
            <h2 style={{ margin: 0 }}>Dokumen Saya</h2>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>Tersimpan aman di akunmu — bisa dibuka dari perangkat mana pun.</p>

          {moduls.length === 0 ? (
            <div className="empty">
              <h3>Belum ada dokumen</h3>
              <p>Mulai dari Ruang Perencanaan agar alurnya runtut.</p>
              <button className="btn btn-primary" onClick={goRuang}>Mulai Perencanaan</button>
            </div>
          ) : (
            <div className="modul-grid">
              {moduls.map((m) => {
                const tn = (DOC_TYPES[m.docType] || {}).nama || 'Dokumen';
                return (
                  <div className="card modul-card" key={m.id}>
                    <span className="chip red" style={{ alignSelf: 'flex-start' }}>{tn}</span>
                    <h3>{m.judul}</h3>
                    <div className="meta">
                      <span className="chip fill">{m.jenjang}</span>
                      {m.mapel && <span className="chip">{m.mapel}</span>}
                    </div>
                    {m.topik && <div style={{ fontSize: 13.5, color: '#3d3d3a' }}>{m.topik}</div>}
                    {(m.images?.length > 0) && (
                      <div className="thumbstrip">
                        {m.images.slice(0, 3).map((g, i) => (
                          <img key={i} src={g.thumbUrl} alt="" loading="lazy" />
                        ))}
                      </div>
                    )}
                    <time>Diperbarui {fmtDate(m.updatedAt)}</time>
                    <div className="actions">
                      <button className="btn btn-sm btn-ink" onClick={() => openDoc(m.id)}>Buka</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <footer className="footer">
        <div>ModulAjar v1 oleh Alfaruq Asri, S.Pd.</div>
        <a className="btn btn-sm btn-primary" style={{ marginTop: 10 }} href={WA_LINK} target="_blank" rel="noreferrer">
          Butuh Bantuan? Chat WA
        </a>
      </footer>
    </>
  );
}
