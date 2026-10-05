import { useEffect, useRef, useState } from 'react';

// Panel "Tulisan AI": menampilkan teks yang sedang ditulis AI secara realtime,
// apa adanya (markdown mentah), dikelompokkan per tahap.
// segmen: [{key, label, teks}]. aria-live dimatikan agar screen reader tidak
// kebanjiran pengumuman tiap delta; user membacanya sesuai permintaan.
export default function TulisanAI({ segmen = [], defaultBuka = true, live = false }) {
  const [buka, setBuka] = useState(defaultBuka);
  const boxRef = useRef(null);
  const totalLen = segmen.reduce((a, s) => a + (s.teks || '').length, 0);
  const ada = segmen.some((s) => (s.teks || '').length > 0);

  useEffect(() => {
    const el = boxRef.current;
    if (el && buka) el.scrollTop = el.scrollHeight;
  }, [totalLen, buka]);

  if (!ada) return null;

  return (
    <div className="tulisan-ai">
      <button
        type="button"
        className="tulisan-ai-toggle"
        aria-expanded={buka}
        onClick={() => setBuka((v) => !v)}
      >
        <span className="kicker" style={{ margin: 0 }}>Tulisan AI</span>
        <span className="hint">{buka ? 'Sembunyikan' : 'Lihat'}</span>
      </button>
      {buka && (
        <div className="tulisan-ai-box" ref={boxRef} tabIndex={0} aria-label="Tulisan AI yang sedang dibuat">
          {segmen.filter((s) => (s.teks || '').length > 0).map((s, ix, arr) => (
            <div key={s.key} className="tulisan-ai-segmen">
              {s.label && <div className="tulisan-ai-label">{s.label}</div>}
              <div className="tulisan-ai-teks">
                {s.teks}
                {live && ix === arr.length - 1 && <span className="tulisan-caret" aria-hidden="true" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
