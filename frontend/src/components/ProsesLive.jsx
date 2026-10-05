import { useEffect, useState } from 'react';
import TulisanAI from './TulisanAI';
import StempelSelesai from './StempelSelesai';

const STATUS_LABEL = { tunggu: 'Menunggu', jalan: 'Menyusun', ok: 'Selesai' };

function fmtDetik(s) {
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// Stepper vertikal untuk progress generate yang REAL dari backend (via SSE).
// tahap: [{key,label}] sesuai urutan kedatangan event; status: {key:'tunggu'|'jalan'|'ok'}.
// tulisan: [{key,label,teks}] opsional, yaitu tulisan AI realtime per tahap (komponen TulisanAI).
// Spinner hanya pada tahap yang sedang berjalan: penanda loading yang nyata,
// bukan dekorasi (ada label teks "Menyusun" di sampingnya).
export default function ProsesLive({ judul, tahap, status, tulisan = [] }) {
  const [detik, setDetik] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const iv = setInterval(() => setDetik(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);
  const okCount = tahap.filter((t) => status[t.key] === 'ok').length;
  const tahapJalan = tahap.find((t) => status[t.key] === 'jalan');
  const semuaSelesai = tahap.length > 0 && okCount === tahap.length;
  const live = !!tahapJalan && !semuaSelesai;
  return (
    <div className="card">
      <span className="kicker">Proses berjalan</span>
      <h2 style={{ margin: '0 0 4px' }}>{judul}</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        {tahapJalan
          ? <>AI sedang {tahapJalan.label.charAt(0).toLowerCase() + tahapJalan.label.slice(1)}. Halaman ini jangan ditutup.</>
          : 'Tahapan asli dari server, bukan animasi. Halaman ini jangan ditutup.'}
      </p>
      <div
        className="progress" role="progressbar"
        aria-valuenow={okCount} aria-valuemin={0} aria-valuemax={tahap.length}
        aria-label={judul}
      >
        <div className="progress-fill" style={{ width: (tahap.length ? (okCount / tahap.length) * 100 : 0) + '%' }} />
      </div>
      <p className="progress-label">Langkah {okCount} dari {tahap.length} · {fmtDetik(detik)}</p>
      <TulisanAI segmen={tulisan} live={live} />
      {semuaSelesai && (
        <StempelSelesai teks="Dokumen selesai disusun" subteks="Klik dokumen untuk membuka dan mengeditnya." />
      )}
      {tahap.length === 0 ? (
        <div className="shimmer-wrap" role="status" aria-label="Menyiapkan generate">
          <span className="shimmer" aria-hidden="true" />
          <span className="shimmer" aria-hidden="true" />
          <span className="shimmer pendek" aria-hidden="true" />
        </div>
      ) : (
      <ol className="job-steps">
        {tahap.map((t, i) => {
          const st = status[t.key] || 'tunggu';
          const cls = st === 'jalan' ? 'is-jalan' : st === 'ok' ? 'is-ok' : 'is-antri';
          return (
            <li key={t.key} className={'job-step ' + cls}>
              <span className="job-dot" aria-hidden="true">
                {st === 'ok' ? '✓' : st === 'jalan' ? <span className="spinner spinner-sm" /> : (i + 1)}
              </span>
              <div className="job-step-body">
                <b>{t.label}</b>
                <span className="job-status">{STATUS_LABEL[st] || st}</span>
              </div>
            </li>
          );
        })}
      </ol>
      )}
    </div>
  );
}
