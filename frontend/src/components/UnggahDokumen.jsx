import { useRef, useState } from 'react';
import { ekstrakTeks } from '../lib/ekstrakDokumen';

// Tombol unggah dokumen panduan: PDF/DOCX/XLSX/TXT dibaca di browser,
// teksnya diteruskan ke onTeks untuk mengisi kolom formulir.
export default function UnggahDokumen({ onTeks, label }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState('');

  async function pilih(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setStatus('Mengekstrak teks dari ' + f.name + '...');
    try {
      const teks = (await ekstrakTeks(f)).trim().replace(/\n{3,}/g, '\n\n');
      if (!teks) throw new Error('Tidak ada teks yang terbaca dari file ini.');
      onTeks(teks, f.name);
      setStatus('Masuk: ' + teks.length.toLocaleString('id-ID') + ' karakter dari ' + f.name + '.');
    } catch (err) {
      setStatus('Gagal: ' + (err.message || 'file tidak bisa dibaca.'));
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <input
        ref={inputRef} type="file" accept=".pdf,.docx,.xlsx,.xls,.txt,.md"
        onChange={pilih} style={{ display: 'none' }} aria-label={label || 'Unggah dokumen panduan'}
      />
      <button type="button" className="btn btn-sm" onClick={() => inputRef.current && inputRef.current.click()}>
        {label || 'Unggah dokumen (PDF/DOCX/XLSX/TXT)'}
      </button>
      {status && <p className="hint" style={{ margin: '6px 0 0' }}>{status}</p>}
    </div>
  );
}
