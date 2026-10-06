import { useEffect, useState } from 'react';
import { updateModul, deleteModul, listModuls } from '../lib/db';
import { buangJudulGanda, rapikanIdentitas, extractTitle } from '../lib/api';
import { exportDocx } from '../lib/docxExport';
import { TEMA_DOKUMEN, bacaTemaDokumen, simpanTemaDokumen } from '../lib/tema';
import { DOC_TYPES } from '../lib/docs';
import DocPaper from './DocPaper';
import PaperEditor from './PaperEditor';
import ImagePicker from './ImagePicker';
import Konfirmasi from './Konfirmasi';
import MenuTitik from './MenuTitik';

export default function DocView({ doc, onBack, onDeleted, onChanged, onBuatTurunan }) {
  const docType = doc.docType || 'modul'; // dokumen lama tanpa docType = modul
  const isModul = docType === 'modul';
  const [mode, setMode] = useState('view'); // view | edit | images
  const [tema, setTema] = useState(() => bacaTemaDokumen()); // hangat | resmi | modern
  const [text, setText] = useState(doc.markdown);
  const [judul, setJudul] = useState(doc.judul);
  const [images, setImages] = useState(doc.images || []);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [turunan, setTurunan] = useState([]);
  const [konfHapus, setKonfHapus] = useState(false);
  const [errSimpan, setErrSimpan] = useState('');

  useEffect(() => {
    if (isModul) {
      listModuls().then((all) => setTurunan(all.filter((m) => m.modulAcuanId === doc.id)));
    }
  }, [doc.id, doc.docType]);

  const typeName = (DOC_TYPES[docType] || {}).nama || 'Dokumen';
  const paperDoc = { ...doc, judul, markdown: text, images };

  async function persist(patch) {
    setSaving(true);
    setErrSimpan('');
    try {
      await updateModul(doc.id, patch);
      Object.assign(doc, patch);
      onChanged && onChanged();
    } catch (e) {
      setErrSimpan('Gagal menyimpan: ' + (e.message || 'kesalahan tidak dikenal') + '.');
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setErrSimpan('');
    try {
      await exportDocx({ judul, docType: doc.docType, markdown: text, images, tema });
    } catch (e) {
      setErrSimpan('Gagal mengunduh Word: ' + (e.message || 'kesalahan tidak dikenal') + '.');
    } finally {
      setExporting(false);
    }
  }

  function gantiTema(t) {
    setTema(t);
    simpanTemaDokumen(t);
  }

  async function handleDelete() {
    await deleteModul(doc.id);
    onDeleted();
  }

  return (
    <div className="wrap docview">
      <div className="toolbar no-print">
        <button className="btn btn-sm" onClick={onBack}>← Kembali</button>
        {mode === 'view' && (
          <>
            <button className="btn btn-sm btn-primary" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Menyiapkan…' : 'Unduh Word'}
            </button>
            <button className="btn btn-sm" onClick={() => setMode('edit')}>Edit Langsung</button>
            <button className="btn btn-sm" onClick={() => setMode('images')}>Kelola Gambar</button>
            <button className="btn btn-sm" onClick={() => window.print()} title="Di dialog cetak: pilih 'Save as PDF', matikan 'Headers and footers' agar bersih">Cetak / PDF</button>
            <MenuTitik
              label="Aksi lainnya"
              opsi={[
                { label: 'Hapus dokumen', aksi: () => setKonfHapus(true), bahaya: true },
              ]}
            />
          </>
        )}
        {mode === 'view' && (
          <div className="tema-pilih no-print" role="radiogroup" aria-label="Tema tampilan dokumen">
            <span className="tema-label" id="tema-dok-label">Tema dokumen:</span>
            {TEMA_DOKUMEN.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={tema === t.key}
                aria-describedby="tema-dok-label"
                title={t.desc}
                className={'btn btn-sm' + (tema === t.key ? ' btn-primary' : '')}
                onClick={() => gantiTema(t.key)}
              >
                {t.nama}
              </button>
            ))}
          </div>
        )}
        {mode === 'edit' && (
          <>
            <button className="btn btn-sm btn-primary" onClick={async () => { await persist({ markdown: text, judul, images }); setMode('view'); }} disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan & Pratinjau'}
            </button>
            <button className="btn btn-sm" onClick={() => { setText(doc.markdown); setJudul(doc.judul); setImages(doc.images || []); setMode('view'); }}>Batal</button>
          </>
        )}
        {mode === 'images' && (
          <>
            <button className="btn btn-sm btn-primary" onClick={async () => { await persist({ images }); setMode('view'); }} disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan Gambar'}
            </button>
            <button className="btn btn-sm" onClick={() => { setImages(doc.images || []); setMode('view'); }}>Batal</button>
          </>
        )}
      </div>

      {mode === 'images' ? (
        <div className="card">
          <span className="kicker">Gambar Referensi</span>
          <h1 className="page" style={{ fontSize: 24 }}>Kelola Gambar</h1>
          <ImagePicker
            query={[doc.topik, doc.mapel].filter(Boolean).join(' ')}
            initial={images}
            onChange={setImages}
          />
        </div>
      ) : mode === 'edit' ? (
        <div>
          <div className="alert alert-info no-print">
            Ubah langsung di dokumen: <b>klik dua kali</b> teks untuk mengedit, arahkan kursor ke bagian
            untuk <b>menggeser</b> (tahan ⠿ atau Alt+↑/↓), <b>perbaiki dengan AI</b>, atau <b>sisipkan gambar</b>.
          </div>
          {errSimpan && (
            <div className="alert alert-error no-print" role="alert">
              {errSimpan}
            </div>
          )}
          <PaperEditor
            initialMarkdown={buangJudulGanda(rapikanIdentitas(text), judul)}
            images={images}
            docType={typeName}
            docTitle={judul}
            topic={doc.topik}
            tema={tema}
            typeName={typeName}
            onChange={(newMd, newImgs) => {
              setText(newMd); setImages(newImgs);
              const t = extractTitle(newMd); if (t) setJudul(t);
            }}
          />
        </div>
      ) : (
        <DocPaper doc={paperDoc} tema={tema} />
      )}

      {mode === 'view' && isModul && (
        <div className="card no-print" style={{ marginTop: 20 }}>
          <span className="kicker">Rangkaian Dokumen</span>
          <h3 style={{ margin: '4px 0 6px' }}>Dibuat dari modul ini</h3>
          {turunan.length === 0 ? (
            <p className="hint" style={{ margin: '0 0 10px' }}>
              Belum ada. Buat LKPD, Bank Soal, atau KKTP yang otomatis merujuk modul ini.
            </p>
          ) : (
            <div className="meta" style={{ marginBottom: 10 }}>
              {turunan.map((t) => (
                <span key={t.id} className="chip fill">{(DOC_TYPES[t.docType] || {}).nama}: {t.judul.slice(0, 40)}</span>
              ))}
            </div>
          )}
          {onBuatTurunan && (
            <div className="btn-row" style={{ margin: 0 }}>
              <button className="btn btn-sm btn-primary" onClick={() => onBuatTurunan('lkpd', doc.id)}>+ LKPD</button>
              <button className="btn btn-sm" onClick={() => onBuatTurunan('soal', doc.id)}>+ Bank Soal</button>
              <button className="btn btn-sm" onClick={() => onBuatTurunan('kktp', doc.id)}>+ KKTP</button>
            </div>
          )}
        </div>
      )}
      {konfHapus && (
        <Konfirmasi
          judul={`Hapus ${typeName.toLowerCase()} ini?`}
          pesan={`"${judul}" akan dihapus permanen dan tidak bisa dikembalikan.`}
          teksYa="Ya, hapus" berbahaya
          onYa={handleDelete}
          onBatal={() => setKonfHapus(false)}
        />
      )}
    </div>
  );
}
