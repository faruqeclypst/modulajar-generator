import { useEffect, useRef, useState } from 'react';
import { langgananTugas, tutupTugas, sembunyikanTugas } from '../lib/tugasLatar';

function fmtLama(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + ' dtk';
  return Math.floor(s / 60) + ' mnt ' + (s % 60) + ' dtk';
}

// Kartu progress mengambang ala bubble chat: bisa dibuka & diminimize.
// Tetap tampil saat pengguna pindah halaman. Responsif mobile.
// awalMinim: mulai sebagai bubble kecil (dipakai saat di halaman asal tugas).
export default function TugasFloating({ onKembali, onBuka, awalMinim }) {
  const [daftar, setDaftar] = useState([]);
  const [buka, setBuka] = useState(!awalMinim);
  const userTutup = useRef(false); // true bila pengguna manual minimize/buka
  const persenMaks = useRef({}); // id -> persen tertinggi yang pernah tampil
  const [, setDetik] = useState(0);
  useEffect(() => langgananTugas(setDaftar), []);
  useEffect(() => {
    const iv = setInterval(() => setDetik((d) => d + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  // Sinkronkan mode awal hanya bila pengguna belum interaksi manual
  useEffect(() => {
    if (!userTutup.current) setBuka(!awalMinim);
  }, [awalMinim]);

  const tampil = daftar.filter((t) => !t.tersembunyi);
  const jalan = tampil.filter((t) => t.state === 'jalan');
  if (!tampil.length) return null;

  // Mode minimize: bubble kecil dengan indikator jumlah proses berjalan
  if (!buka) {
    return (
      <button
        type="button"
        className="tugas-bubble"
        onClick={() => { userTutup.current = true; setBuka(true); }}
        aria-label={`${jalan.length} proses berjalan. Buka untuk melihat.`}
        title="Lihat proses berjalan"
      >
        <span className="tugas-bubble-spinner" aria-hidden="true" />
        <span className="tugas-bubble-teks">
          {jalan.length > 0 ? `${jalan.length} proses` : 'Selesai'}
        </span>
      </button>
    );
  }

  return (
    <div className="tugas-floating" role="region" aria-label="Proses berjalan">
      <div className="tugas-panel-kepala">
        <b>Proses berjalan</b>
        <button
          type="button" className="tugas-tutup" aria-label="Minimize"
          onClick={() => { userTutup.current = true; setBuka(false); }}
          title="Minimize"
        >—</button>
      </div>
      {tampil.map((t) => {
        const total = t.tahap.length;
        const ok = t.tahap.filter((p) => t.status[p.key] === 'ok').length;
        const jalanTahap = t.tahap.find((p) => t.status[p.key] === 'jalan');
        // Penyebut dibekukan: persen tak pernah turun (tahap bisa bertambah saat stream)
        const mentah = total ? Math.round((ok / total) * 100) : 0;
        const persen = Math.max(mentah, persenMaks.current[t.id] || 0);
        persenMaks.current[t.id] = persen;
        const nungguReview = t.meta && t.meta.menunggu_review;
        return (
          <div key={t.id} className={'tugas-card' + (t.state === 'gagal' ? ' gagal' : '')}>
            <div className="tugas-kepala">
              <b className="tugas-judul">
                {t.state === 'selesai' ? '✓ ' : t.state === 'gagal' ? '✕ ' : ''}
                {t.judul}
              </b>
              {t.state === 'jalan' ? (
                <button
                  type="button" className="tugas-tutup" aria-label="Sembunyikan (tugas tetap berjalan)"
                  title="Sembunyikan — tugas tetap berjalan"
                  onClick={() => sembunyikanTugas(t.id)}
                >×</button>
              ) : (
                <button
                  type="button" className="tugas-tutup" aria-label="Tutup"
                  onClick={() => tutupTugas(t.id)}
                >×</button>
              )}
            </div>
            {t.state === 'jalan' && (
              <>
                <div className="progress" role="progressbar" aria-valuenow={ok} aria-valuemin={0} aria-valuemax={total} aria-label={t.judul}>
                  <div className="progress-fill" style={{ width: persen + '%' }} />
                </div>
                <p className="tugas-status">
                  {nungguReview ? (
                    <><b>Menunggu review</b> — ketuk untuk lanjutkan.</>
                  ) : jalanTahap ? (
                    <>Menyusun {jalanTahap.label.charAt(0).toLowerCase() + jalanTahap.label.slice(1)}…</>
                  ) : 'Menyiapkan…'}
                  <span className="tugas-waktu">{fmtLama(Date.now() - t.mulai)}</span>
                </p>
                {onKembali && (
                  <button type="button" className="btn btn-sm" onClick={() => onKembali(t)}>
                    {nungguReview ? 'Lanjutkan review' : (t.aksi?.kembali || 'Lihat proses')}
                  </button>
                )}
              </>
            )}
            {t.state === 'selesai' && (
              <>
                <p className="tugas-status">Selesai dalam {fmtLama(Date.now() - t.mulai)}.</p>
                {onBuka && (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => onBuka(t)}>
                    Buka hasil
                  </button>
                )}
              </>
            )}
            {t.state === 'gagal' && (
              <>
                <p className="tugas-status">{t.error}</p>
                {t.konteks === 'ruang' && onKembali && (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => onKembali(t)}>
                    Buka langkah — coba lagi
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
