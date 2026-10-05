import { useEffect, useState } from 'react';
import { getToken } from '../lib/supabase';

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

// Dashboard admin: ringkasan + pengguna + masukan + job. Prop: onBack.
export default function AdminDashboard({ onBack }) {
  const [tab, setTab] = useState('ringkasan');
  const [ringkasan, setRingkasan] = useState(null);
  const [pengguna, setPengguna] = useState(null);
  const [masukan, setMasukan] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [err, setErr] = useState({});

  const muat = (nama, setFn, path) => {
    setErr((e) => ({ ...e, [nama]: '' }));
    apiAdmin(path)
      .then((d) => setFn(d.data ?? d))
      .catch((e) => setErr((p) => ({ ...p, [nama]: e.message || 'Gagal memuat data.' })));
  };

  useEffect(() => { muat('ringkasan', setRingkasan, '/api/admin/ringkasan'); }, []);
  useEffect(() => { if (tab === 'pengguna' && pengguna === null && !err.pengguna) muat('pengguna', setPengguna, '/api/admin/pengguna'); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'masukan' && masukan === null && !err.masukan) muat('masukan', setMasukan, '/api/admin/masukan'); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'jobs' && jobs === null && !err.jobs) muat('jobs', setJobs, '/api/admin/jobs'); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function tandaiBaca(id) {
    try {
      await apiAdmin('/api/admin/masukan/' + id + '/baca', 'POST');
      setMasukan((m) => (m || []).map((x) => (x.id === id ? { ...x, dibaca: true } : x)));
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

      <div className="admin-tabs" role="tablist" aria-label="Bagian dashboard admin">
        {TABS.map(([k, label]) => (
          <button
            key={k} type="button" role="tab" aria-selected={tab === k}
            className={'admin-tab' + (tab === k ? ' aktif' : '')}
            onClick={() => setTab(k)}
          >
            {label}
            {k === 'masukan' && Array.isArray(masukan) && masukan.some((m) => !m.dibaca) && (
              <span className="chip red" style={{ marginLeft: 8 }}>{masukan.filter((m) => !m.dibaca).length}</span>
            )}
          </button>
        ))}
      </div>

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
              {!ringkasan && <p className="hint" role="status">Memuat ringkasan…</p>}
            </>
          )}
        </section>
      )}

      {tab === 'pengguna' && (
        <section aria-label="Daftar pengguna">
          {err.pengguna ? (
            <div className="alert alert-error">Gagal memuat daftar pengguna: {err.pengguna}<MuatUlang onClick={() => muat('pengguna', setPengguna, '/api/admin/pengguna')} /></div>
          ) : !pengguna ? (
            <p className="hint" role="status">Memuat daftar pengguna…</p>
          ) : pengguna.length === 0 ? (
            <div className="alert alert-info">Belum ada pengguna terdaftar.</div>
          ) : (
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
          )}
        </section>
      )}

      {tab === 'masukan' && (
        <section aria-label="Masukan pengguna">
          {err.masukan ? (
            <div className="alert alert-error">Gagal memuat masukan: {err.masukan}<MuatUlang onClick={() => muat('masukan', setMasukan, '/api/admin/masukan')} /></div>
          ) : !masukan ? (
            <p className="hint" role="status">Memuat masukan…</p>
          ) : masukan.length === 0 ? (
            <div className="alert alert-info">Belum ada masukan.</div>
          ) : (
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
          )}
        </section>
      )}

      {tab === 'jobs' && (
        <section aria-label="Job paket terbaru">
          {err.jobs ? (
            <div className="alert alert-error">Gagal memuat job: {err.jobs}<MuatUlang onClick={() => muat('jobs', setJobs, '/api/admin/jobs')} /></div>
          ) : !jobs ? (
            <p className="hint" role="status">Memuat job terbaru…</p>
          ) : jobs.length === 0 ? (
            <div className="alert alert-info">Belum ada job paket.</div>
          ) : (
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
          )}
        </section>
      )}

      <div className="btn-row">
        <button type="button" className="btn" onClick={onBack}>Kembali</button>
      </div>
    </div>
  );
}
