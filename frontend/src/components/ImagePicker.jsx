import { useEffect, useState } from 'react';
import { fetchGambar } from '../lib/api';

// Pilih maksimal 3 gambar referensi dari Wikimedia Commons.
// onChange(selected) -> [{title, thumbUrl, fullUrl, caption, artist, license, pageUrl}]
export default function ImagePicker({ query, initial = [], onChange, max = 3 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(initial);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const imgs = await fetchGambar(query);
        if (alive) setResults(imgs);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function toggle(img) {
    const exists = selected.find((s) => s.thumbUrl === img.thumbUrl);
    let next;
    if (exists) next = selected.filter((s) => s.thumbUrl !== img.thumbUrl);
    else {
      if (selected.length >= max) return;
      next = [...selected, { ...img, caption: img.title }];
    }
    setSelected(next);
    onChange(next);
  }

  function setCaption(thumbUrl, caption) {
    const next = selected.map((s) => (s.thumbUrl === thumbUrl ? { ...s, caption } : s));
    setSelected(next);
    onChange(next);
  }

  return (
    <div>
      <p className="lead" style={{ marginBottom: 6 }}>
        Pilih hingga{' '}{max}{' '}gambar yang paling relevan dengan materi. Gambar diambil dari Wikimedia Commons
        (gratis &amp; berlisensi) dan otomatis dicantumkan sumbernya di modul.
      </p>
      {loading && (
        <div className="loader-wrap" style={{ padding: 30 }}>
          <div className="spinner" style={{ width: 40, height: 40 }} />
          <div className="stage">Mencari gambar yang relevan…</div>
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      {!loading && !error && results.length === 0 && (
        <div className="alert alert-info">Tidak ditemukan gambar yang cocok. Anda bisa melewati langkah ini.</div>
      )}
      <div className="img-grid" role="group" aria-label="Hasil pencarian gambar">
        {results.map((img) => {
          const sel = selected.find((s) => s.thumbUrl === img.thumbUrl);
          return (
            <button
              key={img.thumbUrl} type="button"
              className={'img-pick' + (sel ? ' selected' : '')}
              aria-pressed={!!sel}
              onClick={() => toggle(img)}
            >
              <span className="check" aria-hidden="true">{sel ? '✓' : ''}</span>
              <img src={img.thumbUrl} alt={img.title} loading="lazy" />
              <span className="cap">{img.title}</span>
              <span className="src">Wikimedia Commons · {img.license || 'CC'}</span>
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 15, textTransform: 'uppercase', letterSpacing: 1 }}>Keterangan gambar terpilih</h3>
          {selected.map((s) => (
            <div className="field" key={s.thumbUrl}>
              <label>Gambar: {s.title}</label>
              <input
                value={s.caption}
                onChange={(e) => { e.stopPropagation(); setCaption(s.thumbUrl, e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                placeholder="Tulis keterangan gambar…"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
