import { useEffect, useState } from 'react';
import { updateModul, deleteModul, listModuls, publikasikanDokumen, batalPublikasi } from '../lib/db';
import { buangJudulGanda, rapikanIdentitas, extractTitle, generateDocStream, getProfile } from '../lib/api';
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
  const [publikBusy, setPublikBusy] = useState(false);
  const [tautanPublik, setTautanPublik] = useState(null);
  const [errSimpan, setErrSimpan] = useState('');
  const [gabungBusy, setGabungBusy] = useState(null); // docType yang sedang digabung
  const [gabungError, setGabungError] = useState('');

  useEffect(() => {
    if (isModul) {
      listModuls().then((all) => setTurunan(all.filter((m) => m.modulAcuanId === doc.id)));
    }
  }, [doc.id, doc.docType]);

  // Gabung turunan (LKPD/Bank Soal/KKTP) ke HALAMAN YANG SAMA — bukan dokumen terpisah.
  // Generate via AI (konsumsi 1 kredit seperti biasa), lalu tempel sebagai seksi baru di akhir modul.
  async function gabungTurunan(tipe) {
    if (gabungBusy) return;
    setGabungBusy(tipe); setGabungError('');
    try {
      const prof = getProfile();
      const info = {
        nama: doc.nama || prof.nama, sekolah: doc.sekolah || prof.sekolah,
        tahunAjaran: doc.tahunAjaran || prof.tahunAjaran,
        jenjang: doc.jenjang, fase: doc.fase, kelas: doc.kelas, semester: doc.semester,
        mapel: doc.mapel, topik: doc.topik || doc.judul, alokasi: doc.alokasi || '',
        model: doc.model || '', docType: tipe,
        personaGuru: prof.persona || '', menitPerJP: prof.menitPerJP || 45,
      };
      // Modul ini sebagai acuan penuh
      const sumber = '===== MODUL AJAR (ACUAN) =====\n' + (doc.markdown || '').slice(0, 12000);
      let md = '';
      await generateDocStream(tipe, info, doc.topik || doc.judul, sumber, null, (ev) => {
        if (ev.tipe === 'selesai') md = ev.markdown || '';
        else if (ev.tipe === 'gagal') throw new Error(ev.error || 'Generate gagal.');
      });
      if (!md.trim()) throw new Error('AI mengembalikan konten kosong.');
      // Tentukan huruf seksi berikutnya (D, E, F...)
      const huruf = { lkpd: 'D', soal: 'E', kktp: 'F' }[tipe] || 'D';
      const judulSeksi = { lkpd: 'Lembar Kerja Peserta Didik (LKPD)', soal: 'Bank Soal', kktp: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)' }[tipe] || tipe;
      // Buang heading pertama AI bila redundan (diawali # ), pakai seksi kita
      const isiBersih = md.replace(/^#[^\n]*\n/, '').trim();
      const tambahan = `\n\n## ${huruf}. ${judulSeksi}\n\n${isiBersih}`;
      const baru = (text || '').trimEnd() + tambahan;
      await updateModul(doc.id, { markdown: baru });
      setText(baru);
      onChanged && onChanged();
    } catch (e) {
      setGabungError(e.code === 'kuota_habis' ? 'Kredit habis.' : (e.message || 'Gagal menggabungkan.'));
    } finally {
      setGabungBusy(null);
    }
  }

  // Prosem: paksa landscape saat cetak via style injeksi (lebih andal dari named @page di Chrome)
  useEffect(() => {
    if (docType !== 'prosem') return;
    const el = document.createElement('style');
    el.id = 'prosem-cetak-landscape';
    el.textContent = '@media print { @page { size: A4 landscape; margin: 1.8cm 1.5cm; } }';
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [docType]);

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
            {doc.publik ? (
              <button className="btn btn-sm" title="Dokumen ini publik. Klik untuk menyalin tautan."
                onClick={() => { setTautanPublik(`${window.location.origin}/baca/${doc.slug}`); }}>
                🌐 Publik
              </button>
            ) : (
              <button className="btn btn-sm" disabled={publikBusy}
                onClick={async () => {
                  setPublikBusy(true);
                  try {
                    const slug = await publikasikanDokumen(doc.id);
                    doc.publik = true; doc.slug = slug;
                    setTautanPublik(`${window.location.origin}/baca/${slug}`);
                  } catch (e) { alert(e.message); }
                  setPublikBusy(false);
                }}>
                {publikBusy ? 'Menerbitkan…' : 'Publikasikan'}
              </button>
            )}
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
              Klik tombol di bawah untuk menyusun dan menempelkannya langsung di halaman modul ini. (Masing-masing 1 kredit.)
            </p>
          ) : (
            <div className="meta" style={{ marginBottom: 10 }}>
              {turunan.map((t) => (
                <span key={t.id} className="chip fill">{(DOC_TYPES[t.docType] || {}).nama}: {t.judul.slice(0, 40)}</span>
              ))}
            </div>
          )}
          <div className="btn-row" style={{ margin: 0 }}>
            <button className="btn btn-sm btn-primary" onClick={() => gabungTurunan('lkpd')} disabled={!!gabungBusy}>
              {gabungBusy === 'lkpd' ? 'Menyusun...' : '+ LKPD'}
            </button>
            <button className="btn btn-sm" onClick={() => gabungTurunan('soal')} disabled={!!gabungBusy}>
              {gabungBusy === 'soal' ? 'Menyusun...' : '+ Bank Soal'}
            </button>
            <button className="btn btn-sm" onClick={() => gabungTurunan('kktp')} disabled={!!gabungBusy}>
              {gabungBusy === 'kktp' ? 'Menyusun...' : '+ KKTP'}
            </button>
          </div>
          {gabungBusy && <p className="hint" style={{ marginTop: 8 }}>Menyusun {gabungBusy === 'lkpd' ? 'LKPD' : gabungBusy === 'soal' ? 'Bank Soal' : 'KKTP'}... akan ditempel di halaman ini. (1 kredit)</p>}
          {gabungError && <p className="hint" style={{ marginTop: 8, color: 'var(--red-dark)', fontWeight: 700 }}>{gabungError}</p>}
        </div>
      )}
      {tautanPublik && (
        <div className="modal-overlay" onClick={() => setTautanPublik(null)}>
          <div className="card modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3 style={{ marginTop: 0 }}>🌐 Dokumen dipublikasikan!</h3>
            <p>Siapa saja bisa membaca dokumen ini lewat tautan berikut:</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={tautanPublik} onFocus={(e) => e.target.select()}
                style={{ flex: 1, padding: '10px 12px', border: 'var(--bd)', fontSize: 13 }} />
              <button className="btn btn-sm btn-primary" onClick={() => { navigator.clipboard.writeText(tautanPublik); }}>
                Salin
              </button>
            </div>
            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn btn-sm" onClick={() => setTautanPublik(null)}>Tutup</button>
              <button className="btn btn-sm" style={{ color: 'var(--red)' }}
                onClick={async () => { await batalPublikasi(doc.id); doc.publik = false; setTautanPublik(null); }}>
                Batalkan publikasi
              </button>
            </div>
          </div>
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
