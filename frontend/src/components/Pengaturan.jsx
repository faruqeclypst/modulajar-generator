import { useState } from 'react';
import Paywall from './Paywall';

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
      <p className="lead">Profil, tampilan, data, dan bantuan. Semua yang ada di sini benar-benar berfungsi.</p>

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
              Kredit diperbarui setiap hari.
            </p>
            <div className="btn-row" style={{ marginTop: 12, marginBottom: 0 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setPaywall({ mode: 'upgrade' })}>
                Upgrade
              </button>
            </div>
          </>
        )}
      </section>

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
