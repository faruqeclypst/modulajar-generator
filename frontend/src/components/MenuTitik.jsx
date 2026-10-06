import { useEffect, useRef, useState } from 'react';

// Menu aksi "⋯": tombol kecil dengan dropdown berisi aksi sekunder.
// Dipakai di kartu proyek agar bar aksi tidak penuh sesak.
// opsi: [{ label, aksi, bahaya }]
export default function MenuTitik({ opsi, label = 'Aksi lainnya' }) {
  const [buka, setBuka] = useState(false);
  const bungkusRef = useRef(null);

  useEffect(() => {
    if (!buka) return;
    const tutupLuar = (e) => {
      if (bungkusRef.current && !bungkusRef.current.contains(e.target)) setBuka(false);
    };
    const tutupEsc = (e) => { if (e.key === 'Escape') setBuka(false); };
    document.addEventListener('mousedown', tutupLuar);
    document.addEventListener('keydown', tutupEsc);
    return () => {
      document.removeEventListener('mousedown', tutupLuar);
      document.removeEventListener('keydown', tutupEsc);
    };
  }, [buka]);

  return (
    <span className="menu-titik" ref={bungkusRef}>
      <button
        type="button"
        className="btn btn-sm"
        aria-haspopup="menu"
        aria-expanded={buka}
        aria-label={label}
        title={label}
        onClick={() => setBuka((v) => !v)}
      >
        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1, letterSpacing: 2 }}>•••</span>
      </button>
      {buka && (
        <span className="menu-titik-drop" role="menu">
          {opsi.map((o, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={'menu-titik-item' + (o.bahaya ? ' bahaya' : '')}
              onClick={() => { setBuka(false); o.aksi && o.aksi(); }}
            >
              {o.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
