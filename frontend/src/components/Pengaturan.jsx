import { useEffect, useState } from 'react';
import Paywall from './Paywall';
import { getAiConfig, saveAiConfig, deleteAiConfig, getAiStatus, setAiPilihan, getReferal, getProfile, saveProfile } from '../lib/api';
import { SkelForm, Skel } from './Kerangka';

// Sumber AI: pilih "AI bawaan web" atau "AI sendiri (BYOK)".
// AI bawaan memotong kuota mingguan; AI sendiri tidak.
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
  const [pilihan, setPilihan] = useState(true); // true = AI bawaan web
  const [bawaanAktif, setBawaanAktif] = useState(true);
  const [menggantiPilihan, setMenggantiPilihan] = useState(false);

  async function muat() {
    setStatus('memuat');
    setErr('');
    try {
      const [d, s] = await Promise.all([getAiConfig(), getAiStatus().catch(() => null)]);
      if (d && d.ada) { setCfg(d); setStatus('aktif'); }
      else setStatus('kosong');
      if (s) {
        setPilihan(s.pakaiBawaan !== false);
        setBawaanAktif(s.bawaanAktif !== false);
      } else if (d) {
        setPilihan(d.pakaiBawaan !== false);
      }
    } catch (e) {
      setErr((e.message || 'Gagal memuat.') + ' Periksa koneksi, lalu muat ulang halaman.');
      setStatus('gagal');
    }
  }
  useEffect(() => { muat(); }, []);

  async function gantiPilihan(keBawaan) {
    if (keBawaan === pilihan || menggantiPilihan) return;
    setMenggantiPilihan(true);
    setErr(''); setCatatan('');
    try {
      await setAiPilihan(keBawaan);
      setPilihan(keBawaan);
      setCatatan(keBawaan ? 'Sekarang memakai AI bawaan web (memotong kredit mingguan).' : 'Sekarang memakai kunci AI sendiri (tanpa potong kredit).');
    } catch (e) {
      setErr('Gagal mengganti pilihan: ' + (e.message || 'coba lagi.'));
    } finally {
      setMenggantiPilihan(false);
    }
  }

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
    if (!window.confirm('Hapus kunci AI sendiri? Generate akan kembali memakai kuota mingguan.')) return;
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
      <h2 className="sec" id="set-aikey" style={{ marginTop: 0 }}>Sumber AI</h2>
      <p style={{ marginTop: 0 }}>Pilih AI yang dipakai untuk generate dokumen.</p>

      <div className="ai-pilih" role="radiogroup" aria-label="Pilih sumber AI">
        <label className={'ai-pilih-opsi' + (pilihan ? ' aktif' : '')}>
          <input
            type="radio" name="sumber-ai" checked={pilihan}
            onChange={() => gantiPilihan(true)} disabled={menggantiPilihan || !bawaanAktif}
          />
          <span>
            <b>AI bawaan web</b>
            <br />
            <span className="muted">
              {bawaanAktif ? 'Memakai kunci yang disediakan web. Generate memotong kredit mingguan.' : 'Saat ini dimatikan admin — wajib pakai AI sendiri.'}
            </span>
          </span>
        </label>
        <label className={'ai-pilih-opsi' + (!pilihan ? ' aktif' : '')}>
          <input
            type="radio" name="sumber-ai" checked={!pilihan}
            onChange={() => gantiPilihan(false)} disabled={menggantiPilihan}
          />
          <span>
            <b>AI sendiri</b>
            <br />
            <span className="muted">Pakai API key milikmu. Generate tidak memotong kredit mingguan.</span>
          </span>
        </label>
      </div>

      {!pilihan && (
        <>
      <h3 className="sec" style={{ fontSize: 16 }}>Kunci AI Sendiri</h3>
      {status === 'memuat' && <SkelForm baris={3} />}
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
        </>
      )}
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
      <p style={{ marginTop: 0 }}>Kamu dan temanmu masing-masing +3 kredit untuk tiap teman yang bergabung lewat linkmu (maks 5 per minggu). Bonus direset tiap Minggu 15:00 WIB.</p>
      {status === 'memuat' && <><Skel tinggi={14} lebar="100%" gaya={{ marginBottom: 10 }} /><Skel tinggi={44} lebar="100%" /></>}
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
// Alat pemulihan proyek "yatim": proyek yang tersimpan di kunci akun lain
// atau kunci lama sehingga tidak tampil di akun saat ini.
function PulihkanProyek({ onRefresh }) {
  const [hasil, setHasil] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState('');
  async function pindai() {
    setSibuk(true); setPesan(''); setHasil(null);
    try {
      const { pindaiProyekYatim } = await import('../lib/db');
      const temu = await pindaiProyekYatim();
      setHasil(temu);
      if (!temu.length) setPesan('Tidak ada proyek lain di perangkat ini.');
    } catch {
      setPesan('Gagal memindai. Coba lagi.');
    } finally { setSibuk(false); }
  }
  async function pulihkan() {
    setSibuk(true); setPesan('');
    try {
      const { adopsiProyekYatim } = await import('../lib/db');
      const n = await adopsiProyekYatim();
      setHasil(null);
      setPesan(n ? n + ' proyek dipindahkan ke akun ini.' : 'Tidak ada yang dipindahkan.');
      if (n && onRefresh) await onRefresh();
    } catch {
      setPesan('Gagal memulihkan. Coba lagi.');
    } finally { setSibuk(false); }
  }
  return (
    <div style={{ marginTop: 16, borderTop: '1px dashed var(--line)', paddingTop: 16 }}>
      <b>Proyek tidak muncul?</b>
      <p className="hint" style={{ marginBottom: 10 }}>Pindai penyimpanan perangkat untuk proyek yang tersimpan di akun lain atau sebelum pembaruan.</p>
      <div className="btn-row" style={{ marginBottom: 0 }}>
        <button type="button" className="btn btn-sm" onClick={pindai} disabled={sibuk}>
          {sibuk ? 'Memindai…' : 'Pindai proyek hilang'}
        </button>
      </div>
      {hasil && hasil.length > 0 && (
        <>
          <p className="hint">Ditemukan {hasil.length} proyek: {hasil.map((p) => p.nama || 'Tanpa nama').join(', ')}.</p>
          <div className="btn-row" style={{ marginBottom: 0 }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={pulihkan} disabled={sibuk}>
              Pindahkan ke akun ini
            </button>
          </div>
        </>
      )}
      {pesan && <p className="hint" role="status" style={{ marginBottom: 0 }}>{pesan}</p>}
    </div>
  );
}

// Hapus total: bersihkan seluruh data lokal dan mulai dari bersih.
function HapusTotalData() {
  const [sibuk, setSibuk] = useState(false);
  async function jalankan() {
    let yatim = 0;
    try {
      const { pindaiProyekYatim } = await import('../lib/db');
      yatim = (await pindaiProyekYatim()).length;
    } catch { /* abaikan */ }
    const lanjut = window.confirm(
      yatim
        ? `Ditemukan ${yatim} proyek di penyimpanan lain. Hapus total akan MENGHAPUSNYA PERMANEN dari perangkat ini. Lanjutkan?`
        : 'Hapus SELURUH data lokal (proyek, draft, profil, sesi login)? Kamu akan keluar dan perlu login lagi. Dokumen di server TIDAK ikut terhapus. Lanjutkan?'
    );
    if (!lanjut) return;
    setSibuk(true);
    try {
      const { hapusTotalDataLokal } = await import('../lib/akunLokal');
      await hapusTotalDataLokal();
    } finally {
      window.location.reload();
    }
  }
  return (
    <div style={{ marginTop: 16, borderTop: '1px dashed var(--line)', paddingTop: 16 }}>
      <b>Data lokal bermasalah?</b>
      <p className="hint" style={{ marginBottom: 10 }}>Hapus seluruh data lokal di perangkat ini dan mulai dari keadaan bersih.</p>
      <div className="btn-row" style={{ marginBottom: 0 }}>
        <button type="button" className="btn btn-sm btn-danger" onClick={jalankan} disabled={sibuk}>
          {sibuk ? 'Menghapus…' : 'Hapus total data lokal'}
        </button>
      </div>
    </div>
  );
}

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
  const [pegawai, setPegawai] = useState(() => {
    const p = getProfile();
    return { nip: p.nip || '', kepalaSekolah: p.kepalaSekolah || '', nipKepalaSekolah: p.nipKepalaSekolah || '' };
  });
  const [catatanPegawai, setCatatanPegawai] = useState('');

  function simpanPegawai() {
    saveProfile({
      nip: pegawai.nip.trim(),
      kepalaSekolah: pegawai.kepalaSekolah.trim(),
      nipKepalaSekolah: pegawai.nipKepalaSekolah.trim(),
    });
    setCatatanPegawai('Tersimpan. Dipakai di Lembar Pengesahan dokumen.');
  }

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
    <div className="wrap pengaturan">
      <span className="kicker">Akun</span>
      <h1 className="page">Pengaturan</h1>
      <p className="lead">Profil, kredit, kunci AI, bonus, tampilan, data, dan bantuan. Semua yang ada di sini benar-benar berfungsi.</p>

      <div className="pengaturan-grid">
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

      <section className="card" aria-labelledby="set-pegawai">
        <h2 className="sec" id="set-pegawai" style={{ marginTop: 0 }}>Data Kepegawaian</h2>
        <p className="hint" style={{ marginTop: 0 }}>Dipakai di Lembar Pengesahan dokumen. Cukup isi sekali, tersimpan di perangkat ini.</p>
        <div className="grid2">
          <div className="field">
            <label htmlFor="set-nip">NIP Guru</label>
            <input id="set-nip" value={pegawai.nip} onChange={(e) => setPegawai((p) => ({ ...p, nip: e.target.value }))} placeholder="cth: 198001012005011001" inputMode="numeric" />
          </div>
          <div className="field">
            <label htmlFor="set-kepsek">Nama Kepala Sekolah</label>
            <input id="set-kepsek" value={pegawai.kepalaSekolah} onChange={(e) => setPegawai((p) => ({ ...p, kepalaSekolah: e.target.value }))} placeholder="cth: Drs. Budi Santosa, M.Pd." />
          </div>
          <div className="field">
            <label htmlFor="set-nip-kepsek">NIP Kepala Sekolah</label>
            <input id="set-nip-kepsek" value={pegawai.nipKepalaSekolah} onChange={(e) => setPegawai((p) => ({ ...p, nipKepalaSekolah: e.target.value }))} placeholder="cth: 197501012000031002" inputMode="numeric" />
          </div>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-sm btn-primary" onClick={simpanPegawai}>Simpan Data Kepegawaian</button>
        </div>
        {catatanPegawai && <p className="hint" role="status" style={{ marginBottom: 0 }}>{catatanPegawai}</p>}
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
              Sisa <b>{kuota.sisa}</b> dari <b>{kuota.batas}</b> kredit minggu ini.
              {kuota.batas || 20} kredit/minggu, diperbarui setiap Minggu jam 15:00 WIB.
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
        <p style={{ marginTop: 0 }}>Dokumen, proyek, dan profilmu tersimpan di akunmu melalui Supabase. Login di perangkat mana pun — komputermu, komputer orang lain, HP — datanya tetap sama.</p>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-sm" onClick={muatUlang} disabled={memuat}>
            {memuat ? 'Memuat…' : 'Muat ulang data'}
          </button>
        </div>
        {catatan && <p className="hint" role="status" style={{ marginBottom: 0 }}>{catatan}</p>}
        <PulihkanProyek onRefresh={onRefresh} />
        <HapusTotalData />
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
      </div>

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
