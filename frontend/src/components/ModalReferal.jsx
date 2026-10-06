import { useEffect, useState } from 'react';
import { getReferal } from '../lib/api';

// Modal "Free Credit": link referal + penjelasan bonus kredit.
// Dibuka dari item "Free Credit" di menu pengguna (topbar).
export default function ModalReferal({ onClose }) {
  const [status, setStatus] = useState('memuat'); // memuat | ok | gagal
  const [ref, setRef] = useState(null);
  const [err, setErr] = useState('');
  const [disalin, setDisalin] = useState(false);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const d = await getReferal();
        if (!stop) { setRef(d); setStatus('ok'); }
      } catch (e) {
        if (!stop) { setErr(e.message || 'Gagal memuat.'); setStatus('gagal'); }
      }
    })();
    return () => { stop = true; };
  }, []);

  // Escape menutup modal
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function salin() {
    if (!ref?.link) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(ref.link);
      ok = true;
    } catch {
      const el = document.getElementById('ref-link-modal');
      if (el) { el.select(); try { ok = document.execCommand('copy'); } catch { /* abaikan */ } }
    }
    if (ok) {
      setDisalin(true);
      setTimeout(() => setDisalin(false), 2000);
    }
  }

  return (
    <div
      className="paywall-overlay"
      role="dialog" aria-modal="true" aria-labelledby="ref-modal-judul"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="paywall-card">
        <h2 id="ref-modal-judul">Free Credit</h2>
        <p>
          Bagikan link referalmu ke teman guru. Setiap teman yang bergabung lewat
          link ini memberimu <b>+3 kredit bonus</b> (maksimal 5 klaim per minggu).
          Bonus direset tiap Minggu 15:00 WIB dan otomatis menambah sisa kredit
          mingguanmu.
        </p>
        {status === 'memuat' && <p className="hint">Memuat link referal…</p>}
        {status === 'gagal' && <div className="alert alert-error" role="alert">{err}</div>}
        {ref && (
          <>
            <div className="field">
              <label htmlFor="ref-link-modal">Link referalmu</label>
              <div className="ref-row">
                <input id="ref-link-modal" readOnly value={ref.link} onClick={(e) => e.target.select()} />
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
        <div className="btn-row" style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-sm" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}
