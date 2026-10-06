import { useEffect, useRef } from 'react';

// Modal konfirmasi bertema Warm Paper — pengganti confirm() bawaan browser.
// Props:
//   judul, pesan, daftar (array string opsional, ditampilkan sebagai list),
//   teksYa, teksBatal, berbahaya (tombol Ya merah), sibuk,
//   onYa, onBatal
export default function Konfirmasi({
  judul, pesan, daftar, teksYa = 'Ya', teksBatal = 'Batal',
  berbahaya = false, sibuk = false, onYa, onBatal,
}) {
  const batalRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !sibuk) onBatal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBatal, sibuk]);

  useEffect(() => {
    batalRef.current && batalRef.current.focus();
  }, []);

  return (
    <div
      className="paywall-overlay"
      role="dialog" aria-modal="true" aria-labelledby="konf-judul"
      onClick={(e) => { if (e.target === e.currentTarget && !sibuk) onBatal(); }}
    >
      <div className="paywall-card" style={{ maxWidth: 440 }}>
        <span className="kicker" style={{ color: berbahaya ? 'var(--red)' : undefined }}>
          {berbahaya ? 'Tindakan berbahaya' : 'Konfirmasi'}
        </span>
        <h2 id="konf-judul" style={{ marginTop: 4 }}>{judul}</h2>
        {pesan && <p>{pesan}</p>}
        {daftar && daftar.length > 0 && (
          <ul style={{ margin: '0 0 20px', paddingLeft: 20, lineHeight: 1.7, maxHeight: 180, overflowY: 'auto' }}>
            {daftar.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
        <div className="btn-row">
          <button ref={batalRef} type="button" className="btn" onClick={onBatal} disabled={sibuk}>
            {teksBatal}
          </button>
          <button
            type="button"
            className={'btn ' + (berbahaya ? 'btn-danger' : 'btn-primary')}
            onClick={onYa} disabled={sibuk}
          >
            {sibuk ? 'Memproses…' : teksYa}
          </button>
        </div>
      </div>
    </div>
  );
}
