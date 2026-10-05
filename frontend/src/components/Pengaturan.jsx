import { useEffect, useState } from 'react';
import Paywall from './Paywall';
import { getAiConfig, saveAiConfig, deleteAiConfig, getReferal } from '../lib/api';

// Kunci AI sendiri (BYOK): simpan base URL + API key milik user.
// Generate dengan kunci sendiri tidak memotong kuota harian.
function KunciAISendiri() {
  const [status, setStatus] = useState('memuat'); // memuat | aktif | kosong | gagal
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState('');
  const [catatan, setCatatan] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [ganti, setGanti] = useState(false);

  async function muat() {
    setStatus('memuat');
    setErr('');
    try {
      const d = await getAiConfig();
      if (d && d.ada) { setCfg(d); setStatus('aktif'); }
      else setStatus('kosong');
    } catch (e) {
      setErr((e.message || 'Gagal memuat.') + ' Periksa koneksi, lalu muat ulang halaman.');
      setStatus('gagal');
    }
  }
  useEffect(() => { muat(); }, []);

  async function simpan(e) {
    e.preventDefault();
    setErr('');
    setCatatan('');
    if (!baseUrl.trim() || !apiKey.trim()) {
      setErr('Isi Base URL dan API Key dulu.');
      return;
    }
    setMenyimpan(true);
    try {
      await saveAiConfig({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
      setApiKey('');
      setGanti(false);
      setCatatan('Kunci AI tersimpan dan aktif.');
      await muat();
    } catch (e2) {
      setErr((e2.message || 'Gagal menyimpan.') + ' Periksa Base URL dan API Key, lalu coba lagi.');
    } finally {
      setMenyimpan(false);
    }
  }

  async function hapus() {
    if (!window.confirm('Hapus kunci AI sendiri? Generate akan kembali memakai kuota harian.')) return;
    setErr('');
    setCatatan('');
    try {
      await deleteAiConfig();
      setCfg(null);
      setBaseUrl('');
      setModel('');
      setStatus('kosong');
      setCatatan('Kunci AI dihapus.');
    } catch (e) {
      setErr((e.message || 'Gagal menghapus.') + ' Periksa koneksi, lalu coba lagi.');
    }
  }

  const tampilForm = status === 'kosong' || status === 'gagal' || ganti;

  return (
    <section className="card" aria-labelledby="set-aikey">
      <h2 className="sec" id="set-aikey" style={{ marginTop: 0 }}>Kunci AI Sendiri</h2>
      <p style={{ marginTop: 0 }}>Pakai API key milikmu sendiri, generate tidak memotong kuota harian.</p>
      {status === 'memuat' && <p>Memuat…</p>}
      {err && <div className="alert alert-error" role="alert">{err}</div>}
      {status === 'aktif' && cfg && !ganti && (
        <>
          <p style={{ marginBottom: 10 }}><span className="chip red">Aktif</span></p>
          <div className="set-field">Base URL</div>
          <div className="set-value">{cfg.baseUrl}</div>
          <div className="set-field">Model</div>
          <div className="set-value">{cfg.model || 'Bawaan penyedia'}</div>
          <div className="set-field">API Key</div>
          <div className="set-value">{cfg.keyMasked}</div>
          <div className="btn-row" style={{ marginTop: 12, marginBottom: 0 }}>
            <button type="button" className="btn btn-sm" onClick={() => { setGanti(true); setBaseUrl(cfg.baseUrl || ''); setModel(cfg.model || ''); setErr(''); }}>
              Ganti
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={hapus}>
              Hapus
            </button>
          </div>
        </>
      )}
      {tampilForm && status !== 'memuat' && (
        <form onSubmit={simpan}>
          <div className="field">
            <label htmlFor="ai-baseurl">Base URL</label>
            <input id="ai-baseurl" inputMode="url" placeholder="https://..." value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="ai-key">API Key</label>
            <input id="ai-key" type="password" value={apiKey}
              onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="ai-model">Model (opsional)</label>
            <input id="ai-model" placeholder="cth: gpt-4o-mini" value={model}
              onChange={(e) => setModel(e.target.value)} autoComplete="off" />
          </div>
          <div className="btn-row" style={{ marginBottom: 0 }}>
            <button type="submit" className="btn btn-sm btn-primary" disabled={menyimpan}>
              {menyimpan ? 'Menyimpan…' : 'Simpan'}
            </button>
            {ganti && (
              <button type="button" className="btn btn-sm" onClick={() => { setGanti(false); setErr(''); }}>
                Batal
              </button>
            )}
          </div>
        </form>
      )}
      {catatan && <p className="hint" role="status" style={{ marginBottom: 0 }}>{catatan}</p>}
    </section>
  );
}

// Bagikan & Bonus: link referal + salin + status bonus periode berjalan.
function BagikanBonus() {
  const [status, setStatus] = useState('memuat'); // memuat | ok | gagal
  const [ref, setRef] = useState(null);
  const [err, setErr] = useState('');
  const [disalin, setDisalin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await getReferal();
        setRef(d);
        setStatus('ok');
      } catch (e) {
        setErr((e.message || 'Gagal memuat.') + ' Periksa koneksi, lalu muat ulang halaman.');
        setStatus('gagal');
      }
    })();
  }, []);

  async function salin() {
    if (!ref?.link) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(ref.link);
      ok = true;
    } catch {
      const el = document.getElementById('ref-link');
      if (el) { el.select(); try { ok = document.execCommand('copy'); } catch { /* abaikan */ } }
    }
    if (ok) {
      setDisalin(true);
      setTimeout(() => setDisalin(false), 2000);
    }
  }

  return (
    <section className="card" aria-labelledby="set-referal">
      <h2 className="sec" id="set-referal" style={{ marginTop: 0 }}>Bagikan &amp; Bonus</h2>
      <p style={{ marginTop: 0 }}>+3 kredit bonus untuk tiap teman yang bergabung lewat linkmu (maks 5 per 3 hari). Bonus dihitung ulang tiap 3 hari.</p>
      {status === 'memuat' && <p>Memuat…</p>}
      {err && <div className="alert alert-error" role="alert">{err}</div>}
      {ref && (
        <>
          <div className="field">
            <label htmlFor="ref-link">Link referalmu</label>
            <div className="ref-row">
              <input id="ref-link" readOnly value={ref.link} onClick={(e) => e.target.select()} />
              <button type="button" className="btn btn-sm btn-primary" onClick={salin}>
                {disalin ? 'Tersalin' : 'Salin Link'}
              </button>
            </div>
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            Bonus periode ini: <b>{ref.bonusPeriodeIni}</b> · Tautan diklaim: <b>{ref.klaimPeriodeIni}/{ref.maksKlaim}</b>
          </p>
        </>
      )}
    </section>
  );
}

// Halaman Pengaturan: hanya kontrol nyata, semuanya berfungsi.
export default function Pengaturan({ user, kuota, waLink, onRefresh, onSignOut }) {
  const meta = user?.user_metadata || {};
  const nama = meta.full_name || meta.name || '';
  const email = user?.email || '';
  const inisial = (nama || email || 'G').trim()[0].toUpperCase();
  const foto = meta.avatar_url || meta.picture || null;

  const [besar, setBesar] = useState(() => localStorage.getItem('ma-font-besar') === '1');
  const [memuat, setMemuat] = useState(false);
  const [catatan, setCatatan] = useState('');
  const [paywall, setPaywall] = useState(null);

  function pilihUkuran(v) {
    setBesar(v);
    if (v) {
      localStorage.setItem('ma-font-besar', '1');
      document.documentElement.classList.add('ma-font-besar');
    } else {
      localStorage.removeItem('ma-font-besar');
      document.documentElement.classList.remove('ma-font-besar');
    }
  }

  async function muatUlang() {
    setMemuat(true);
    setCatatan('');
    try {
      await onRefresh();
      setCatatan('Data dimuat ulang ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + '.');
    } catch (e) {
      setCatatan('Gagal memuat ulang: ' + (e.message || 'periksa koneksi, lalu coba lagi.'));
    } finally {
      setMemuat(false);
    }
  }

  async function keluar() {
    if (!window.confirm('Keluar dari ModulAjar? Kamu bisa masuk lagi kapan pun dengan akun Google yang sama.')) return;
    await onSignOut();
  }

  return (
    <div className="wrap narrow">
      <span className="kicker">Akun</span>
      <h1 className="page">Pengaturan</h1>
      <p className="lead">Profil, kredit, kunci AI, bonus, tampilan, data, dan bantuan. Semua yang ada di sini benar-benar berfungsi.</p>

      <section className="card" aria-labelledby="set-profil">
        <h2 className="sec" id="set-profil" style={{ marginTop: 0 }}>Profil</h2>
        <div className="set-row">
          {foto ? (
            <img className="set-avatar set-avatar-img" src={foto} alt="" referrerPolicy="no-referrer" aria-hidden="true" />
          ) : (
            <span className="set-avatar" aria-hidden="true">{inisial}</span>
          )}
          <div>
            <div className="set-field">Nama</div>
            <div className="set-value">{nama || 'Belum ada nama'}</div>
            <div className="set-field">Email</div>
            <div className="set-value">{email || 'Belum ada email'}</div>
            <p className="hint" style={{ margin: '4px 0 0' }}>Diambil dari akun Google, tidak bisa diubah di sini.</p>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="set-kuota">
        <h2 className="sec" id="set-kuota" style={{ marginTop: 0 }}>Kredit &amp; Langganan</h2>
        {!kuota && (
          <p style={{ marginBottom: 0 }}>Memuat status kredit…</p>
        )}
        {kuota && kuota.admin && (
          <p style={{ marginBottom: 0 }}>
            <span className="chip red">Tanpa batas (Admin)</span>
          </p>
        )}
        {kuota && !kuota.admin && (
          <>
            <p style={{ marginTop: 0 }}>
              Sisa <b>{kuota.sisa}</b> dari <b>{kuota.batas}</b> kredit hari ini.
              20 kredit/hari, diperbarui setiap jam 15:00 WIB.
            </p>
            <div className="btn-row" style={{ marginTop: 12, marginBottom: 0 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setPaywall({ mode: 'upgrade' })}>
                Upgrade
              </button>
            </div>
          </>
        )}
      </section>

      <KunciAISendiri />

      <BagikanBonus />

      <section className="card" aria-labelledby="set-tampilan">
        <h2 className="sec" id="set-tampilan" style={{ marginTop: 0 }}>Tampilan</h2>
        <div className="field" style={{ marginBottom: 0 }}>
          <span id="label-ukuran" className="set-field" style={{ display: 'block', marginBottom: 10 }}>Ukuran teks</span>
          <div className="radio-cards" role="radiogroup" aria-labelledby="label-ukuran">
            <button
              type="button" role="radio" aria-checked={!besar}
              className={'radio-card' + (!besar ? ' selected' : '')}
              onClick={() => pilihUkuran(false)}
            >
              <b>Normal</b>
              <span>Ukuran bawaan, 16px.</span>
            </button>
            <button
              type="button" role="radio" aria-checked={besar}
              className={'radio-card' + (besar ? ' selected' : '')}
              onClick={() => pilihUkuran(true)}
            >
              <b>Besar</b>
              <span>Lebih lega dibaca, 18px.</span>
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>Pilihanmu tersimpan di perangkat ini dan langsung diterapkan.</p>
        </div>
      </section>

      <section className="card" aria-labelledby="set-data">
        <h2 className="sec" id="set-data" style={{ marginTop: 0 }}>Data</h2>
        <p style={{ marginTop: 0 }}>Dokumenmu tersimpan di akunmu melalui Supabase. Buka dari perangkat mana pun, datanya tetap sama.</p>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-sm" onClick={muatUlang} disabled={memuat}>
            {memuat ? 'Memuat…' : 'Muat ulang data'}
          </button>
        </div>
        {catatan && <p className="hint" role="status" style={{ marginBottom: 0 }}>{catatan}</p>}
      </section>

      <section className="card" aria-labelledby="set-bantuan">
        <h2 className="sec" id="set-bantuan" style={{ marginTop: 0 }}>Bantuan</h2>
        <p style={{ marginTop: 0 }}>Ada kendala atau pertanyaan? Ceritakan langsung, dibalas secepatnya.</p>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <a className="btn btn-sm btn-primary" href={waLink} target="_blank" rel="noreferrer">Chat WhatsApp</a>
        </div>
      </section>

      <section className="card" aria-labelledby="set-keluar">
        <h2 className="sec" id="set-keluar" style={{ marginTop: 0 }}>Keluar</h2>
        <p style={{ marginTop: 0 }}>Akhiri sesi di perangkat ini. Dokumenmu tetap aman di akun.</p>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-sm btn-danger" onClick={keluar}>Keluar dari aplikasi</button>
        </div>
      </section>

      {paywall && (
        <Paywall
          mode={paywall.mode}
          detail={null}
          waLink={waLink}
          onClose={() => setPaywall(null)}
        />
      )}
    </div>
  );
}
