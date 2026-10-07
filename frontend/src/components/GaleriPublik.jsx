import { useEffect, useMemo, useState } from 'react';
import { listDokumenPublik, getDokumenPublik, cuplikanMarkdown } from '../lib/db';
import { DOC_TYPES } from '../lib/docs';
import DocPaper from './DocPaper';
import { Reveal } from './Reveal';

// Galeri publik: siapa saja bisa baca dokumen yang dipublikasikan guru.
// slugAwal: bila ada, langsung buka reader (deep link /baca/:slug).
export default function GaleriPublik({ slugAwal = null, onTutup }) {
  const [daftar, setDaftar] = useState(null);
  const [gagal, setGagal] = useState('');
  const [cari, setCari] = useState('');
  const [filterTipe, setFilterTipe] = useState('semua');
  const [buka, setBuka] = useState(slugAwal);

  useEffect(() => {
    (async () => {
      try { setDaftar(await listDokumenPublik(120)); }
      catch (e) { setGagal(e.message); setDaftar([]); }
    })();
  }, []);

  const tipeAda = useMemo(() => {
    const s = new Set((daftar || []).map((d) => d.docType));
    return [...s].filter(Boolean);
  }, [daftar]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (daftar || []).filter((d) => {
      if (filterTipe !== 'semua' && d.docType !== filterTipe) return false;
      if (!q) return true;
      return String(d.judul || '').toLowerCase().includes(q);
    });
  }, [daftar, cari, filterTipe]);

  if (buka) return <BacaPublik slug={buka} onKembali={() => setBuka(null)} onTutup={onTutup} />;

  return (
    <div className="wrap">
      <span className="kicker">Galeri Publik</span>
      <h1 className="page">Dokumen Guru Indonesia</h1>
      <p className="lead" style={{ maxWidth: '62ch' }}>
        Kumpulan perangkat ajar yang dibagikan guru untuk dibaca siapa saja.
        Punya dokumen bagus? Publikasikan dari halaman dokumenmu.
      </p>
      <div className="galeri-filter">
        <input value={cari} onChange={(e) => setCari(e.target.value)}
          placeholder="Cari judul dokumen…" aria-label="Cari dokumen" />
        <select value={filterTipe} onChange={(e) => setFilterTipe(e.target.value)} aria-label="Filter jenis">
          <option value="semua">Semua jenis</option>
          {tipeAda.map((t) => (
            <option key={t} value={t}>{DOC_TYPES[t]?.nama || t}</option>
          ))}
        </select>
      </div>
      {gagal && <p className="error">{gagal}</p>}
      {daftar === null ? (
        <p className="hint">Memuat galeri…</p>
      ) : tampil.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 40, margin: 0 }}>📚</p>
          <b>Belum ada dokumen publik.</b>
          <p className="hint">Jadilah yang pertama membagikan perangkat ajarmu!</p>
        </div>
      ) : (
        <div className="galeri-grid">
          {tampil.map((d, i) => (
            <Reveal key={d.id} delayMs={Math.min(i, 8) * 60} className="card galeri-card"
              as="article" onClick={() => setBuka(d.slug)} tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBuka(d.slug); } }}
              role="button" aria-label={`Baca ${d.judul}`}>
              <span className="chip red">{DOC_TYPES[d.docType]?.tag || d.docType}</span>
              <h3>{d.judul}</h3>
              <p className="hint" style={{ margin: '4px 0 0' }}>
                {d.mapel ? `${d.mapel} · ` : ''}{d.kelas ? `${d.kelas} · ` : ''}
                {d.diterbitkanPada ? new Date(d.diterbitkanPada).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
              </p>
              {d.markdown && (
                <p className="galeri-cuplikan">{cuplikanMarkdown(d.markdown)}</p>
              )}
              <span className="galeri-baca">Baca selengkapnya →</span>
            </Reveal>
          ))}
        </div>
      )}
      {onTutup && (
        <div className="btn-row" style={{ marginTop: 24 }}>
          <button type="button" className="btn" onClick={onTutup}>← Kembali</button>
        </div>
      )}
    </div>
  );
}

function BacaPublik({ slug, onKembali, onTutup }) {
  const [dok, setDok] = useState(null);
  const [gagal, setGagal] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const d = await getDokumenPublik(slug);
        if (!d) setGagal('Dokumen tidak ditemukan atau sudah tidak dipublikasikan.');
        else setDok(d);
      } catch (e) { setGagal(e.message); }
    })();
  }, [slug]);

  // Update URL saat buka deep link
  useEffect(() => {
    if (window.location.pathname !== '/baca/' + slug) {
      history.replaceState(null, '', '/baca/' + slug);
    }
  }, [slug]);

  const salin = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
  };

  return (
    <div className="wrap">
      <div className="toolbar no-print" style={{ marginBottom: 16 }}>
        <button type="button" className="btn btn-sm" onClick={() => { history.replaceState(null, '', '/galeri'); onKembali(); }}>
          ← Galeri
        </button>
        {dok && (
          <button type="button" className="btn btn-sm" onClick={salin}>Salin Tautan</button>
        )}
        {onTutup && (
          <button type="button" className="btn btn-sm" onClick={onTutup}>Tutup</button>
        )}
      </div>
      {gagal ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 40, margin: 0 }}>🔍</p>
          <b>{gagal}</b>
        </div>
      ) : !dok ? (
        <p className="hint">Memuat dokumen…</p>
      ) : (
        <>
          <p className="hint no-print" style={{ marginBottom: 8 }}>
            🌐 Dokumen publik · {DOC_TYPES[dok.docType]?.nama || dok.docType}
            {dok.diterbitkanPada ? ` · Diterbitkan ${new Date(dok.diterbitkanPada).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
          </p>
          <DocPaper markdown={dok.markdown} judul={dok.judul} images={dok.images} />
        </>
      )}
    </div>
  );
}
