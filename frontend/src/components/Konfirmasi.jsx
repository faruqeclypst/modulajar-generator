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
  const dialogRef = useRef(null);
  const pemicuRef = useRef(null);

  useEffect(() => {
    // Simpan elemen yang sedang fokus; kembalikan saat modal ditutup
    pemicuRef.current = document.activeElement;
    return () => {
      if (pemicuRef.current && pemicuRef.current.focus) pemicuRef.current.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !sibuk) { onBatal(); return; }
      // Focus trap: Tab tidak boleh keluar dari dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const fokus = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const aktif = [...fokus].filter((el) => !el.disabled);
        if (!aktif.length) return;
        const pertama = aktif[0];
        const terakhir = aktif[aktif.length - 1];
        if (e.shiftKey && document.activeElement === pertama) {
          e.preventDefault(); terakhir.focus();
        } else if (!e.shiftKey && document.activeElement === terakhir) {
          e.preventDefault(); pertama.focus();
        }
      }
    };
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
      <div className="paywall-card" style={{ maxWidth: 440 }} ref={dialogRef}>
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
