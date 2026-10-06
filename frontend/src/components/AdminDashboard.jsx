import { useEffect, useState } from 'react';
import { getToken } from '../lib/supabase';
import { SkelStat, SkelTabel, SkelKartu, SkelForm } from './Kerangka';
import Paginasi from './Paginasi';

// Panggilan API admin: pola sama seperti apiJob di GeneratorPaket.jsx.
async function apiAdmin(path, method, body) {
  const t = await getToken().catch(() => '');
  const r = await fetch(path, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) {
    const err = new Error(d.error || 'Server tidak merespons.');
    err.code = d.code;
    throw err;
  }
  return d;
}

const fmtTgl = (v) => {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(v); }
};
const fmtAngka = (v) => Number(v || 0).toLocaleString('id-ID');

const STATUS_LABEL = {
  antri: 'Menunggu', berjalan: 'Berjalan', menunggu_review: 'Menunggu review',
  selesai: 'Selesai', gagal: 'Gagal', dibatalkan: 'Dibatalkan',
};

const TABS = [
  ['ringkasan', 'Ringkasan'],
  ['pengguna', 'Pengguna'],
  ['masukan', 'Masukan'],
  ['jobs', 'Job Terbaru'],
  ['transaksi', 'Transaksi'],
  ['ai', 'Pengaturan AI'],
];

// Kartu angka ringkasan: hanya dari data API, tanpa angka palsu.
function KartuAngka({ label, nilai, loading }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat-label">{label}</span>
      <b className="admin-stat-nilai">{loading ? '…' : fmtAngka(nilai)}</b>
    </div>
  );
}

function MuatUlang({ onClick }) {
  return (
    <div className="btn-row" style={{ marginTop: 12 }}>
      <button type="button" className="btn btn-sm btn-ink" onClick={onClick}>Muat ulang</button>
    </div>
  );
}

// Tab Pengaturan AI: toggle AI bawaan + key umum + key khusus admin
// + uji koneksi + muat daftar model + daftar AI tersimpan.
function PengaturanAI() {
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState('');
  const [simpanMsg, setSimpanMsg] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [form, setForm] = useState({
    bawaanAktif: true,
    umumBaseUrl: '', umumApiKey: '', umumModel: '',
    adminBaseUrl: '', adminApiKey: '', adminModel: '',
  });
  const [uji, setUji] = useState({}); // kolom -> { status, pesan }
  const [models, setModels] = useState({}); // kolom -> [id]
  const [preset, setPreset] = useState(null);
  const [formP, setFormP] = useState({ nama: '', untuk: 'umum', baseUrl: '', apiKey: '', model: '' });
  const [simpanP, setSimpanP] = useState(false);

  function muatCfg() {
    return apiAdmin('/api/admin/pengaturan-ai')
      .then((d) => {
        setCfg(d);
        setForm({
          bawaanAktif: d.bawaanAktif !== false,
          umumBaseUrl: d.umum?.baseUrl || '', umumApiKey: '', umumModel: d.umum?.model || '',
          adminBaseUrl: d.admin?.baseUrl || '', adminApiKey: '', adminModel: d.admin?.model || '',
        });
      })
      .catch((e) => setErr(e.message || 'Gagal memuat pengaturan AI.'));
  }
  function muatPreset() {
    apiAdmin('/api/admin/daftar-ai')
      .then((d) => setPreset(d.data || []))
      .catch(() => setPreset([]));
  }
  useEffect(() => { muatCfg(); muatPreset(); }, []);

  const ubah = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSimpanMsg(''); };
  const ubahP = (k, v) => setFormP((f) => ({ ...f, [k]: v }));

  async function simpan() {
    setMenyimpan(true); setErr(''); setSimpanMsg('');
    try {
      await apiAdmin('/api/admin/pengaturan-ai', 'POST', {
        bawaanAktif: form.bawaanAktif,
        umum: { baseUrl: form.umumBaseUrl, apiKey: form.umumApiKey, model: form.umumModel },
        admin: { baseUrl: form.adminBaseUrl, apiKey: form.adminApiKey, model: form.adminModel },
      });
      setSimpanMsg('Pengaturan AI tersimpan.');
      setForm((f) => ({ ...f, umumApiKey: '', adminApiKey: '' }));
      muatCfg();
    } catch (e) {
      setErr(e.message || 'Gagal menyimpan.');
    } finally {
      setMenyimpan(false);
    }
  }

  // Uji koneksi: pakai key dari form bila diisi, kalau tidak pakai yang tersimpan.
  async function ujiKoneksi(kolom) {
    const pk = kolom === 'admin' ? 'adminApiKey' : 'umumApiKey';
    const bu = kolom === 'admin' ? 'adminBaseUrl' : 'umumBaseUrl';
    const mo = kolom === 'admin' ? 'adminModel' : 'umumModel';
    setUji((u) => ({ ...u, [kolom]: { status: 'jalan', pesan: 'Menghubungi provider…' } }));
    try {
      let d;
      if (form[pk].trim()) {
        d = await apiAdmin('/api/admin/ai-uji', 'POST', { baseUrl: form[bu], apiKey: form[pk], model: form[mo] });
      } else {
        d = await apiAdmin('/api/admin/ai-uji-tersimpan', 'POST', { kolom });
      }
      setUji((u) => ({
        ...u,
        [kolom]: d.ok
          ? { status: 'ok', pesan: `Tersambung (${d.latencyMs} ms)${d.modelAsli ? ' — ' + d.modelAsli : ''}${d.balasan ? ` — balasan: "${d.balasan}"` : ''}` }
          : { status: 'gagal', pesan: d.error || 'Gagal.' },
      }));
    } catch (e) {
      setUji((u) => ({ ...u, [kolom]: { status: 'gagal', pesan: e.message || 'Gagal.' } }));
    }
  }

  // Muat daftar model dari provider.
  async function muatModel(kolom) {
    const pk = kolom === 'admin' ? 'adminApiKey' : 'umumApiKey';
    const bu = kolom === 'admin' ? 'adminBaseUrl' : 'umumBaseUrl';
    setUji((u) => ({ ...u, [kolom]: { status: 'jalan', pesan: 'Memuat daftar model…' } }));
    try {
      let d;
      if (form[pk].trim()) {
        d = await apiAdmin('/api/admin/ai-model', 'POST', { baseUrl: form[bu], apiKey: form[pk] });
      } else {
        d = await apiAdmin('/api/admin/ai-model-tersimpan', 'POST', { kolom });
      }
      if (d.ok && d.models?.length) {
        setModels((m) => ({ ...m, [kolom]: d.models }));
        setUji((u) => ({ ...u, [kolom]: { status: 'ok', pesan: `${d.models.length} model ditemukan — pilih dari daftar di bawah.` } }));
      } else {
        setUji((u) => ({ ...u, [kolom]: { status: 'gagal', pesan: d.error || 'Provider tidak mengembalikan daftar model.' } }));
      }
    } catch (e) {
      setUji((u) => ({ ...u, [kolom]: { status: 'gagal', pesan: e.message || 'Gagal.' } }));
    }
  }

  async function tambahPreset(e) {
    e.preventDefault();
    setSimpanP(true); setErr('');
    try {
      await apiAdmin('/api/admin/daftar-ai', 'POST', {
        nama: formP.nama, untuk: formP.untuk,
        baseUrl: formP.baseUrl, apiKey: formP.apiKey, model: formP.model,
      });
      setFormP({ nama: '', untuk: 'umum', baseUrl: '', apiKey: '', model: '' });
      muatPreset();
      setSimpanMsg('AI tersimpan ke daftar.');
    } catch (e2) {
      setErr(e2.message || 'Gagal menyimpan AI.');
    } finally {
      setSimpanP(false);
    }
  }

  async function pakaiPreset(id) {
    try {
      await apiAdmin('/api/admin/daftar-ai/' + id + '/pakai', 'POST');
      setSimpanMsg('AI aktif diganti.');
      muatCfg(); muatPreset();
    } catch (e) {
      setErr(e.message || 'Gagal mengaktifkan.');
    }
  }

  async function hapusPreset(id, nama) {
    if (!window.confirm(`Hapus "${nama}" dari daftar?`)) return;
    try {
      await apiAdmin('/api/admin/daftar-ai/' + id, 'DELETE');
      muatPreset();
    } catch (e) {
      setErr(e.message || 'Gagal menghapus.');
    }
  }

  if (err && !cfg) return <div className="alert alert-error">{err}</div>;
  if (!cfg) return <SkelForm baris={5} />;

  const fieldKey = (id, label, name, masked) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} type="password" autoComplete="new-password"
        value={form[name]} onChange={(e) => ubah(name, e.target.value)}
        placeholder={masked ? `Tersimpan (${masked}) — kosongkan bila tidak diubah` : 'Tempel API key di sini'}
      />
    </div>
  );

  const fieldTeks = (id, label, name, placeholder, type) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} type={type || 'text'} value={form[name]}
        onChange={(e) => ubah(name, e.target.value)} placeholder={placeholder}
        autoComplete="off" spellCheck={false}
      />
    </div>
  );

  // Satu kartu kunci (umum / admin) lengkap dengan uji koneksi + muat model.
  const kartuKunci = (kolom, judul, catatan) => {
    const bu = kolom + 'BaseUrl', pk = kolom + 'ApiKey', mo = kolom + 'Model';
    const ids = { url: `ai-${kolom}-url`, key: `ai-${kolom}-key`, model: `ai-${kolom}-model` };
    const hasil = uji[kolom];
    const daftar = models[kolom] || [];
    const masked = kolom === 'admin' ? cfg.admin?.keyMasked : cfg.umum?.keyMasked;
    return (
      <div className="card">
        <h3 className="card-title">{judul}</h3>
        {fieldTeks(ids.url, 'Base URL', bu, 'https://kenari.id/v1', 'url')}
        {fieldKey(ids.key, 'API key', pk, masked)}
        {daftar.length > 0 ? (
          <div className="field">
            <label htmlFor={ids.model}>Model</label>
            <select id={ids.model} value={form[mo]} onChange={(e) => ubah(mo, e.target.value)}>
              <option value="">— Pilih model —</option>
              {daftar.map((m) => (<option key={m} value={m}>{m}</option>))}
            </select>
          </div>
        ) : (
          fieldTeks(ids.model, 'Model', mo, 'cth: agnes-3-0-flash:free')
        )}
        <div className="btn-row" style={{ marginTop: 4, marginBottom: 0 }}>
          <button type="button" className="btn btn-sm" onClick={() => ujiKoneksi(kolom)}>
            Uji koneksi
          </button>
          <button type="button" className="btn btn-sm" onClick={() => muatModel(kolom)}>
            Muat model
          </button>
        </div>
        {hasil && (
          <p
            className={'hint ' + (hasil.status === 'ok' ? 'ok' : hasil.status === 'gagal' ? 'err' : '')}
            role="status" style={{ marginBottom: 0, marginTop: 10 }}
          >
            {hasil.status === 'ok' ? '✓ ' : hasil.status === 'gagal' ? '✗ ' : '… '}{hasil.pesan}
          </p>
        )}
        {catatan && <p className="muted" style={{ marginBottom: 0, marginTop: 10 }}>{catatan}</p>}
      </div>
    );
  };

  return (
    <section aria-label="Pengaturan AI" className="admin-ai">
      <p className="lead" style={{ marginTop: 0 }}>
        Atur kunci AI yang dipakai aplikasi. Kunci <b>umum</b> dipakai semua pengguna (memotong kredit harian).
        Kunci <b>admin</b> hanya dipakai akun admin (tanpa potong kredit).
      </p>

      {err && <div className="alert alert-error">{err}</div>}
      {simpanMsg && <div className="alert alert-ok">{simpanMsg}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="f-check" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox" checked={form.bawaanAktif}
            onChange={(e) => ubah('bawaanAktif', e.target.checked)}
            style={{ marginTop: 4, width: 18, height: 18, accentColor: 'var(--red)' }}
          />
          <span>
            <b>AI bawaan web aktif</b>
            <br />
            <span className="muted">Bila dimatikan, pengguna wajib memakai kunci AI sendiri (BYOK) — tombol generate akan menolak bila belum dipasang.</span>
          </span>
        </label>
      </div>

      <div className="admin-ai-grid">
        {kartuKunci('umum', 'Kunci untuk umum')}
        {kartuKunci('admin', 'Kunci khusus admin', 'Kosongkan API key bila admin ingin memakai kunci umum.')}
      </div>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-ink" onClick={simpan} disabled={menyimpan}>
          {menyimpan ? 'Menyimpan…' : 'Simpan pengaturan AI'}
        </button>
      </div>

      <h3 className="sec" style={{ marginTop: 28 }}>Daftar AI tersimpan</h3>
      <p className="muted" style={{ marginTop: -8 }}>
        Simpan beberapa AI (mis. Dahono, GeraiKita, Kenari), lalu pilih mana yang aktif dipakai.
        Yang aktif akan menggantikan isian kunci di atas setelah disimpan otomatis.
      </p>

      {preset === null ? (
        <SkelTabel baris={3} kolom={6} />
      ) : preset.length === 0 ? (
        <div className="alert alert-info">Belum ada AI tersimpan. Tambahkan di bawah.</div>
      ) : (
        <div className="admin-tabel-wrap" style={{ marginBottom: 16 }}>
          <table className="admin-tabel">
            <thead>
              <tr><th>Nama</th><th>Untuk</th><th>Base URL</th><th>Model</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {preset.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.nama}</b><br /><span className="muted">{p.keyMasked}</span></td>
                  <td>{p.untuk === 'admin' ? 'Admin' : 'Umum'}</td>
                  <td><code style={{ fontSize: 12 }}>{p.base_url}</code></td>
                  <td><code style={{ fontSize: 12 }}>{p.model || '-'}</code></td>
                  <td>{p.aktif ? <span className="chip red">Aktif</span> : <span className="muted">—</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!p.aktif && (
                      <button type="button" className="btn btn-sm btn-ink" onClick={() => pakaiPreset(p.id)}>
                        Pakai
                      </button>
                    )}{' '}
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => hapusPreset(p.id, p.nama)}>
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={tambahPreset} className="card">
        <h3 className="card-title">Tambah AI ke daftar</h3>
        <div className="admin-ai-grid">
          <div className="field">
            <label htmlFor="preset-nama">Nama</label>
            <input id="preset-nama" value={formP.nama} onChange={(e) => ubahP('nama', e.target.value)} placeholder="cth: Dahono DeepSeek" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="preset-untuk">Untuk</label>
            <select id="preset-untuk" value={formP.untuk} onChange={(e) => ubahP('untuk', e.target.value)}>
              <option value="umum">Umum (semua pengguna)</option>
              <option value="admin">Admin saja</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="preset-url">Base URL</label>
          <input id="preset-url" inputMode="url" value={formP.baseUrl} onChange={(e) => ubahP('baseUrl', e.target.value)} placeholder="https://gateway.dahono.com/" autoComplete="off" spellCheck={false} />
        </div>
        <div className="field">
          <label htmlFor="preset-key">API key</label>
          <input id="preset-key" type="password" value={formP.apiKey} onChange={(e) => ubahP('apiKey', e.target.value)} autoComplete="new-password" />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="preset-model">Model</label>
          <input id="preset-model" value={formP.model} onChange={(e) => ubahP('model', e.target.value)} placeholder="cth: dahono/deepseek-v4.1-flash" autoComplete="off" spellCheck={false} />
        </div>
        <div className="btn-row" style={{ marginBottom: 0 }}>
          <button type="submit" className="btn btn-sm btn-primary" disabled={simpanP}>
            {simpanP ? 'Menyimpan…' : 'Simpan ke daftar'}
          </button>
        </div>
      </form>
    </section>
  );
}

// Dashboard admin: ringkasan + pengguna + masukan + job + pengaturan AI. Prop: onBack.
export default function AdminDashboard({ onBack }) {
  const PER_HAL = 20;
  const [tab, setTab] = useState('ringkasan');
  const [ringkasan, setRingkasan] = useState(null);
  const [pengguna, setPengguna] = useState(null);
  const [masukan, setMasukan] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [transaksi, setTransaksi] = useState(null);
  const [trxBelumAda, setTrxBelumAda] = useState(false);
  const [filterTrx, setFilterTrx] = useState('');
  const [belumDibaca, setBelumDibaca] = useState(0);
  const [pg, setPg] = useState({
    pengguna: { page: 1, total: 0 }, masukan: { page: 1, total: 0 },
    jobs: { page: 1, total: 0 }, transaksi: { page: 1, total: 0 },
  });
  const [err, setErr] = useState({});

  // asArray: paksa hasil jadi array; respons tak terduga tidak boleh crash render.
  // halaman: nomor halaman yang diminta (paginasi).
  const muat = (nama, setFn, path, asArray, halaman) => {
    setErr((e) => ({ ...e, [nama]: '' }));
    const p = halaman || (pg[nama] && pg[nama].page) || 1;
    const url = path + (path.includes('?') ? '&' : '?') + 'page=' + p + '&per_page=' + PER_HAL;
    apiAdmin(url)
      .then((d) => {
        const v = d.data ?? d;
        setFn(asArray ? (Array.isArray(v) ? v : []) : v);
        if (typeof d.total === 'number') setPg((s) => ({ ...s, [nama]: { page: d.page || p, total: d.total } }));
        if (nama === 'masukan' && typeof d.belumDibaca === 'number') setBelumDibaca(d.belumDibaca);
        if (nama === 'transaksi') setTrxBelumAda(!!d.belumAda);
      })
      .catch((e) => setErr((p2) => ({ ...p2, [nama]: e.message || 'Gagal memuat data.' })));
  };

  const pathTrx = () => '/api/admin/transaksi' + (filterTrx ? '?status=' + filterTrx : '');

  useEffect(() => { muat('ringkasan', setRingkasan, '/api/admin/ringkasan'); }, []);
  useEffect(() => { if (tab === 'pengguna' && pengguna === null && !err.pengguna) muat('pengguna', setPengguna, '/api/admin/pengguna', true); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'masukan' && masukan === null && !err.masukan) muat('masukan', setMasukan, '/api/admin/masukan', true); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'jobs' && jobs === null && !err.jobs) muat('jobs', setJobs, '/api/admin/jobs', true); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'transaksi' && transaksi === null && !err.transaksi) muat('transaksi', setTransaksi, pathTrx(), true); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function tandaiBaca(id) {
    try {
      await apiAdmin('/api/admin/masukan/' + id + '/baca', 'POST');
      setMasukan((m) => (m || []).map((x) => (x.id === id ? { ...x, dibaca: true } : x)));
      setBelumDibaca((n) => Math.max(0, n - 1));
    } catch (e) {
      setErr((p) => ({ ...p, masukan: e.message || 'Gagal menandai dibaca.' }));
    }
  }

  async function hapusMasukan(id) {
    if (!window.confirm('Hapus masukan ini? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      await apiAdmin('/api/admin/masukan/' + id, 'DELETE');
      setMasukan((m) => (m || []).filter((x) => x.id !== id));
    } catch (e) {
      setErr((p) => ({ ...p, masukan: e.message || 'Gagal menghapus masukan.' }));
    }
  }

  const r = ringkasan || {};

  return (
    <div className="wrap">
      <span className="kicker">Admin</span>
      <h1 className="page">Dashboard Admin</h1>
      <p className="lead">Pantau pengguna, dokumen, kredit, job paket, dan masukan yang masuk.</p>

      <div className="admin-layout">
        <nav className="admin-side" aria-label="Bagian dashboard admin">
          {TABS.map(([k, label]) => (
            <button
              key={k} type="button" aria-current={tab === k ? 'page' : undefined}
              className={'admin-nav' + (tab === k ? ' aktif' : '')}
              onClick={() => setTab(k)}
            >
              <span>{label}</span>
              {k === 'masukan' && belumDibaca > 0 && (
                <span className="chip red">{belumDibaca}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="admin-main">
      {tab === 'ringkasan' && (
        <section aria-label="Ringkasan">
          {err.ringkasan ? (
            <div className="alert alert-error">Gagal memuat ringkasan: {err.ringkasan}<MuatUlang onClick={() => muat('ringkasan', setRingkasan, '/api/admin/ringkasan')} /></div>
          ) : (
            <>
              <div className="admin-stats">
                <KartuAngka label="Total Pengguna" nilai={r.totalUser} loading={!ringkasan} />
                <KartuAngka label="Dokumen Dibuat" nilai={r.dokumenTotal} loading={!ringkasan} />
                <KartuAngka label="Dokumen Hari Ini" nilai={r.dokumenHariIni} loading={!ringkasan} />
                <KartuAngka label="Kredit Terpakai Hari Ini" nilai={r.kreditTerpakaiHariIni} loading={!ringkasan} />
                <KartuAngka label="Job Paket Aktif" nilai={r.jobAktif} loading={!ringkasan} />
                <KartuAngka label="Referral Diklaim" nilai={r.referralDiklaim} loading={!ringkasan} />
              </div>
              {!ringkasan && <SkelStat />}
            </>
          )}
        </section>
      )}

      {tab === 'pengguna' && (
        <section aria-label="Daftar pengguna">
          {err.pengguna ? (
            <div className="alert alert-error">Gagal memuat daftar pengguna: {err.pengguna}<MuatUlang onClick={() => muat('pengguna', setPengguna, '/api/admin/pengguna', true)} /></div>
          ) : !pengguna ? (
            <SkelTabel baris={6} kolom={5} />
          ) : pengguna.length === 0 ? (
            <div className="alert alert-info">Belum ada pengguna terdaftar.</div>
          ) : (
            <>
              <div className="admin-tabel-wrap">
                <table className="admin-tabel">
                  <thead>
                    <tr><th>Email</th><th>Terdaftar</th><th>Kunci AI Sendiri</th><th>Dokumen</th></tr>
                  </thead>
                  <tbody>
                    {pengguna.map((u) => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td>{fmtTgl(u.dibuat)}</td>
                        <td>{u.byok ? <span className="chip ok">Ya</span> : <span className="chip">Tidak</span>}</td>
                        <td>{fmtAngka(u.jmlDokumen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginasi page={pg.pengguna.page} total={pg.pengguna.total} perPage={PER_HAL}
                onPindah={(p) => muat('pengguna', setPengguna, '/api/admin/pengguna', true, p)} />
            </>
          )}
        </section>
      )}

      {tab === 'masukan' && (
        <section aria-label="Masukan pengguna">
          {err.masukan ? (
            <div className="alert alert-error">Gagal memuat masukan: {err.masukan}<MuatUlang onClick={() => muat('masukan', setMasukan, '/api/admin/masukan', true)} /></div>
          ) : !masukan ? (
            <SkelKartu jumlah={3} />
          ) : masukan.length === 0 ? (
            <div className="alert alert-info">Belum ada masukan.</div>
          ) : (
            <>
            <ul className="admin-masukan">
              {masukan.map((m) => (
                <li key={m.id} className={'admin-masukan-item' + (m.dibaca ? '' : ' baru')}>
                  <div className="admin-masukan-head">
                    <span className={'chip' + (m.jenis === 'kontak' ? ' fill' : '')}>{m.jenis === 'kontak' ? 'Kontak' : 'Saran'}</span>
                    {!m.dibaca && <span className="chip red">Baru</span>}
                    <span className="hint">{fmtTgl(m.dibuat)}</span>
                  </div>
                  <p className="admin-masukan-isi">{m.pesan}</p>
                  <p className="hint" style={{ margin: '4px 0 0' }}>{m.nama || 'Tanpa nama'}{m.email ? ' · ' + m.email : ''}</p>
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    {!m.dibaca && (
                      <button type="button" className="btn btn-sm" onClick={() => tandaiBaca(m.id)}>Tandai dibaca</button>
                    )}
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => hapusMasukan(m.id)}>Hapus</button>
                  </div>
                </li>
              ))}
            </ul>
            <Paginasi page={pg.masukan.page} total={pg.masukan.total} perPage={PER_HAL}
              onPindah={(p) => muat('masukan', setMasukan, '/api/admin/masukan', true, p)} />
            </>
          )}
        </section>
      )}

      {tab === 'jobs' && (
        <section aria-label="Job paket terbaru">
          {err.jobs ? (
            <div className="alert alert-error">Gagal memuat job: {err.jobs}<MuatUlang onClick={() => muat('jobs', setJobs, '/api/admin/jobs', true)} /></div>
          ) : !jobs ? (
            <SkelTabel baris={6} kolom={4} />
          ) : jobs.length === 0 ? (
            <div className="alert alert-info">Belum ada job paket.</div>
          ) : (
            <>
              <div className="admin-tabel-wrap">
                <table className="admin-tabel">
                  <thead>
                    <tr><th>ID</th><th>Mode</th><th>Status</th><th>Pengguna</th><th>Dibuat</th></tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id}>
                        <td><code>{String(j.id).slice(0, 8)}</code></td>
                        <td>{j.mode}</td>
                        <td>{STATUS_LABEL[j.status] || j.status}</td>
                        <td>{j.userEmail || '-'}</td>
                        <td>{fmtTgl(j.dibuat)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginasi page={pg.jobs.page} total={pg.jobs.total} perPage={PER_HAL}
                onPindah={(p) => muat('jobs', setJobs, '/api/admin/jobs', true, p)} />
            </>
          )}
        </section>
      )}

      {tab === 'transaksi' && (
        <section aria-label="Transaksi pembayaran">
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <label className="hint" htmlFor="trx-status" style={{ fontWeight: 800 }}>Status:</label>
            <select
              id="trx-status" value={filterTrx}
              onChange={(e) => {
                const v = e.target.value;
                setFilterTrx(v); setTrxBelumAda(false);
                muat('transaksi', setTransaksi, '/api/admin/transaksi' + (v ? '?status=' + v : ''), true, 1);
              }}
              style={{ maxWidth: 220 }}
            >
              <option value="">Semua</option>
              <option value="pending">Pending</option>
              <option value="berhasil">Berhasil</option>
              <option value="gagal">Gagal</option>
              <option value="kadaluarsa">Kadaluarsa</option>
            </select>
            {trxBelumAda && <span className="chip red">Tabel transaksi belum ada — jalankan supabase-bundle.sql</span>}
          </div>
          {err.transaksi ? (
            <div className="alert alert-error">Gagal memuat transaksi: {err.transaksi}<MuatUlang onClick={() => muat('transaksi', setTransaksi, pathTrx(), true)} /></div>
          ) : !transaksi ? (
            <SkelTabel baris={6} kolom={6} />
          ) : transaksi.length === 0 ? (
            <div className="alert alert-info">Belum ada transaksi.</div>
          ) : (
            <>
              <div className="admin-tabel-wrap">
                <table className="admin-tabel">
                  <thead>
                    <tr><th>Tanggal</th><th>Email</th><th>Paket</th><th>Nominal</th><th>Metode</th><th>Status</th><th>Referensi</th></tr>
                  </thead>
                  <tbody>
                    {transaksi.map((t) => (
                      <tr key={t.id}>
                        <td>{fmtTgl(t.created_at)}</td>
                        <td>{t.email || '—'}</td>
                        <td>{t.paket || '—'}</td>
                        <td>{t.jumlah ? 'Rp' + fmtAngka(t.jumlah) : '—'}</td>
                        <td>{t.metode || '—'}</td>
                        <td>
                          <span className={'chip' + (t.status === 'berhasil' ? ' ok' : t.status === 'pending' ? ' red' : '')}>
                            {t.status}
                          </span>
                        </td>
                        <td><code>{t.referensi ? String(t.referensi).slice(0, 18) : '—'}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginasi page={pg.transaksi.page} total={pg.transaksi.total} perPage={PER_HAL}
                onPindah={(p) => muat('transaksi', setTransaksi, pathTrx(), true, p)} />
            </>
          )}
        </section>
      )}

      {tab === 'ai' && <PengaturanAI />}

      <div className="btn-row">
        <button type="button" className="btn" onClick={onBack}>Kembali</button>
      </div>
        </div>{/* /.admin-main */}
      </div>{/* /.admin-layout */}
    </div>
  );
}
