import { useState } from 'react';
import { getToken } from '../lib/supabase';

// Formulir masukan & kontak. Prop:
// - mode: 'saran' (pengguna aplikasi, nama/email opsional) atau 'kontak'
//   (pengunjung landing, tanpa login).
// Mengirim POST /api/masukan {jenis, nama?, email?, pesan}.
// Status: idle | sending | done | error, selalu dengan umpan balik jelas.
const JUDUL = {
  saran: 'Kirim Masukan',
  kontak: 'Hubungi Kami',
};
const KET = {
  saran: 'Ide fitur, laporan kendala, atau hal yang membingungkan. Ditanggapi serius.',
  kontak: 'Tulis pesanmu di bawah ini. Kami membaca setiap pesan yang masuk.',
};

export default function FeedbackForm({ mode = 'saran' }) {
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [pesan, setPesan] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [err, setErr] = useState('');

  const pesanOk = pesan.trim().length >= 10 && pesan.trim().length <= 2000;
  const emailOk = email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const bisaKirim = status !== 'sending' && pesanOk && emailOk;

  async function kirim(e) {
    e.preventDefault();
    if (!bisaKirim) return;
    setStatus('sending');
    setErr('');
    try {
      // Mode 'saran' dipakai di dalam aplikasi (sudah login): sertakan token
      // agar server mengenali pengirim. Mode 'kontak' untuk pengunjung landing.
      const headers = { 'Content-Type': 'application/json' };
      if (mode === 'saran') {
        try {
          const t = await getToken().catch(() => '');
          if (t) headers.Authorization = 'Bearer ' + t;
        } catch { /* abaikan: kirim tanpa token */ }
      }
      const r = await fetch('/api/masukan', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jenis: mode,
          nama: nama.trim() || undefined,
          email: email.trim() || undefined,
          pesan: pesan.trim(),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || 'Server tidak merespons.');
      setStatus('done');
    } catch (e2) {
      setErr(e2.message || 'Gagal mengirim. Periksa koneksi internet, lalu coba lagi.');
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div className="card fb-done" role="status">
        <span className="tick" aria-hidden="true">✓</span>
        <div>
          <b>Terima kasih! Masukanmu tercatat.</b>
          <p>Kami membacanya dan memakai untuk memperbaiki ModulAjar.</p>
        </div>
      </div>
    );
  }

  return (
    <form className="card fb-form" onSubmit={kirim} noValidate>
      <h3 style={{ margin: '0 0 4px' }}>{JUDUL[mode] || JUDUL.saran}</h3>
      <p className="hint" style={{ margin: '0 0 14px' }}>{KET[mode] || KET.saran}</p>
      <div className="grid2">
        <div className="field">
          <label htmlFor={'fb-nama-' + mode}>Nama (opsional)</label>
          <input
            id={'fb-nama-' + mode} value={nama}
            onChange={(e) => setNama(e.target.value)} maxLength={80}
            placeholder="Nama kamu" autoComplete="name"
          />
        </div>
        <div className="field">
          <label htmlFor={'fb-email-' + mode}>Email (opsional)</label>
          <input
            id={'fb-email-' + mode} type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} maxLength={120}
            placeholder="nama@email.com" autoComplete="email"
            aria-invalid={email.trim() !== '' && !emailOk}
          />
          {email.trim() !== '' && !emailOk && (
            <p className="hint" style={{ color: 'var(--red)' }}>Format email tidak valid.</p>
          )}
        </div>
      </div>
      <div className="field">
        <label htmlFor={'fb-pesan-' + mode}>Pesan *</label>
        <textarea
          id={'fb-pesan-' + mode} value={pesan}
          onChange={(e) => setPesan(e.target.value)}
          rows={5} maxLength={2000}
          placeholder="Tulis minimal 10 karakter…"
          aria-describedby={'fb-count-' + mode}
        />
        <p className="hint" id={'fb-count-' + mode}>
          {pesan.trim().length}/2000 karakter
          {pesan.trim().length > 0 && pesan.trim().length < 10 && ' (minimal 10)'}
        </p>
      </div>
      {status === 'error' && (
        <div className="alert alert-error" role="alert"><b>Gagal mengirim.</b> {err}</div>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={!bisaKirim}>
          {status === 'sending' ? 'Mengirim…' : 'Kirim'}
        </button>
      </div>
    </form>
  );
}
