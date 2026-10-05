import { useEffect, useRef, useState } from 'react';
import { mulaiUpgrade } from '../lib/bayar';

// Paywall: modal penawaran upgrade saat kredit habis (atau dibuka manual).
// mode 'kuota_habis': judul + pemakaian X dari Y + info butuh/sisa bila ada.
// mode 'upgrade': langsung ke tampilan upgrade.
// mulaiUpgrade() masih STUB (lihat lib/bayar.js): menampilkan pesan
// "Pembayaran segera hadir" + opsi hubungi admin via WhatsApp. Semua tombol berfungsi.
export default function Paywall({ mode, detail, onClose, waLink }) {
  const [layar, setLayar] = useState(mode === 'upgrade' ? 'upgrade' : 'info');
  const utamaRef = useRef(null);

  useEffect(() => {
    if (utamaRef.current) utamaRef.current.focus();
  }, [layar]);

  useEffect(() => {
    function esc(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  async function upgrade() {
    const r = await mulaiUpgrade();
    if (r && r.segera) setLayar('segera');
  }

  const dipakai = detail?.dipakai;
  const batas = detail?.batas;
  const butuh = detail?.butuh;
  const sisa = detail?.sisa;

  return (
    <div className="paywall-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="paywall-card" role="dialog" aria-modal="true" aria-labelledby="paywall-judul">
        {layar === 'info' && (
          <>
            <span className="kicker red">Kredit</span>
            <h2 id="paywall-judul">Kredit harian habis</h2>
            <p>
              {typeof dipakai === 'number' && typeof batas === 'number'
                ? `Kamu memakai ${dipakai} dari ${batas} kredit hari ini. `
                : 'Kredit harianmu sudah habis. '}
              {typeof butuh === 'number' && typeof sisa === 'number'
                ? `Paket ini butuh ${butuh} dokumen, sisa kreditmu ${sisa}. `
                : ''}
              Kredit diperbarui setiap jam 15:00 WIB, atau upgrade untuk membuat tanpa batas.
            </p>
            <div className="btn-row">
              <button ref={utamaRef} type="button" className="btn btn-primary" onClick={() => setLayar('upgrade')}>
                Upgrade Sekarang
              </button>
              <button type="button" className="btn" onClick={onClose}>Nanti saja</button>
            </div>
          </>
        )}

        {layar === 'upgrade' && (
          <>
            <span className="kicker red">Upgrade</span>
            <h2 id="paywall-judul">Buat dokumen tanpa batas</h2>
            <p>
              Satu akun upgrade, kredit harian tidak berlaku lagi.
              Cocok untuk awal semester saat banyak perangkat harus disusun sekaligus.
            </p>
            <div className="btn-row">
              <button ref={utamaRef} type="button" className="btn btn-primary" onClick={upgrade}>
                Upgrade Sekarang
              </button>
              <button type="button" className="btn" onClick={onClose}>Nanti saja</button>
            </div>
          </>
        )}

        {layar === 'segera' && (
          <>
            <span className="kicker">Segera hadir</span>
            <h2 id="paywall-judul">Pembayaran segera hadir</h2>
            <p>
              Gerbang pembayaran masih disiapkan. Untuk aktivasi manual,
              hubungi admin via WhatsApp.
            </p>
            <div className="btn-row">
              <a ref={utamaRef} className="btn btn-primary" href={waLink} target="_blank" rel="noreferrer">
                Chat WhatsApp
              </a>
              <button type="button" className="btn" onClick={onClose}>Tutup</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
