import { useCallback, useEffect, useRef, useState } from 'react';
import { DOC_TYPES } from '../lib/docs';

// Satu blok showcase interaktif: isi berganti antar tahap alur dengan motion profesional.
// Autoplay 6 detik per tahap, jeda saat hover/fokus, hormati prefers-reduced-motion.
const DURASI = 6000;

export function AlurBlok({ rantai }) {
  const tahap = [
    ...rantai.map((g, i) => ({ ...g, no: String(i + 1).padStart(2, '0') })),
    {
      grup: 'Siklus', no: '04', kunci: [],
      ket: 'Alur ini melingkar, bukan jalan buntu. Hasil penilaian dan refleksi menjadi bahan perbaikan perencanaan periode berikutnya — begitu seterusnya.',
      siklus: true,
    },
  ];
  const [aktif, setAktif] = useState(0);
  const [arah, setArah] = useState(1); // 1 maju, -1 mundur (untuk arah slide)
  const [jeda, setJeda] = useState(false);
  const gerakKecil = useRef(false);
  useEffect(() => {
    gerakKecil.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const pindah = useCallback((i) => {
    setAktif((lama) => {
      if (i === lama) return lama;
      setArah(i > lama ? 1 : -1);
      return (i + tahap.length) % tahap.length;
    });
  }, [tahap.length]);

  // Autoplay
  useEffect(() => {
    if (jeda || gerakKecil.current || document.hidden) return;
    const t = setTimeout(() => {
      setAktif((lama) => { setArah(1); return (lama + 1) % tahap.length; });
    }, DURASI);
    return () => clearTimeout(t);
  }, [aktif, jeda, tahap.length]);

  const s = tahap[aktif];
  return (
    <div
      className="alur-blok"
      onMouseEnter={() => setJeda(true)}
      onMouseLeave={() => setJeda(false)}
      onFocus={() => setJeda(true)}
      onBlur={() => setJeda(false)}
    >
      <div className="alur-tabs" role="tablist" aria-label="Tahap alur dokumen">
        {tahap.map((t, i) => (
          <button
            key={t.grup}
            type="button"
            role="tab"
            aria-selected={i === aktif}
            className={`alur-tab${i === aktif ? ' aktif' : ''}`}
            onClick={() => pindah(i)}
          >
            <span className="alur-tab-no" aria-hidden="true">{t.no}</span>
            <span className="alur-tab-nama">{t.grup}</span>
          </button>
        ))}
        {!gerakKecil.current && !jeda && (
          <span key={aktif} className="alur-bar" aria-hidden="true" style={{ animationDuration: `${DURASI}ms` }} />
        )}
      </div>

      <div className="alur-stage" role="tabpanel" aria-live="polite">
        <div key={aktif} className={`alur-stage-isi${arah < 0 ? ' mundur' : ''}`}>
          <span className="alur-stage-no" aria-hidden="true">{s.no}</span>
          <h3>{s.grup}</h3>
          <p>{s.ket}</p>
          {s.siklus ? (
            <div className="alur-siklus">
              <span className="alur-siklus-ikon" aria-hidden="true">↺</span>
              <p><b>Penilaian</b> → <b>Perencanaan</b> → <b>Pelaksanaan</b> → kembali ke <b>Penilaian</b></p>
            </div>
          ) : (
            <ul className="alur-docs">
              {s.kunci.map((k, ki) => (
                <li key={k} style={{ animationDelay: `${ki * 70}ms` }}>
                  <span className="chip red">{DOC_TYPES[k].tag}</span>
                  <b>{DOC_TYPES[k].nama}</b>
                  <span>{DOC_TYPES[k].desc}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="alur-nav">
        <button type="button" className="alur-panah" onClick={() => pindah(aktif - 1)} aria-label="Tahap sebelumnya">←</button>
        <div className="alur-titik">
          {tahap.map((t, i) => (
            <button key={t.grup} type="button" aria-label={`Ke tahap ${t.grup}`}
              className={i === aktif ? 'aktif' : ''} onClick={() => pindah(i)} />
          ))}
        </div>
        <button type="button" className="alur-panah" onClick={() => pindah(aktif + 1)} aria-label="Tahap berikutnya">→</button>
      </div>
    </div>
  );
}
