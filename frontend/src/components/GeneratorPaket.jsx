import { useEffect, useRef, useState } from 'react';
import { JENJANG, FASE, MAPEL, MODEL } from '../lib/referensi';
import { DOC_TYPES, SEMESTER } from '../lib/docs';
import { generateDoc, rekomendasiAI, extractTitle, getProfile, saveProfile } from '../lib/api';
import { saveModul, savePaket } from '../lib/db';
import UnggahDokumen from './UnggahDokumen';

// Urutan rantai: tiap dokumen menjadi acuan otomatis bagi dokumen berikutnya
const RANTAI = {
  lengkap: ['cp', 'atp', 'prota', 'prosem', 'modul', 'lkpd', 'soal', 'kktp'],
  perencanaan: ['cp', 'atp', 'prota', 'prosem'],
  pelaksanaan: ['modul', 'lkpd', 'soal', 'kktp'],
};
const RANTAI_DESC = {
  cp: 'Disusun dari info mapel dan fase, merujuk teks CP resmi bila ditempel.',
  atp: 'TP diturunkan berurutan dari CP di atas.',
  prota: 'Distribusi materi mengikuti urutan ATP di atas.',
  prosem: 'Rincian mingguan mengikuti Prota di atas.',
  modul: 'TP diambil dari ATP, kegiatan mengikuti sintaks model.',
  lkpd: 'Kegiatan dan materi selaras dengan Modul Ajar di atas.',
  soal: 'Kisi-kisi diturunkan dari TP pada Modul Ajar.',
  kktp: 'Kriteria merujuk TP yang tercantum pada ATP.',
};
const MODE_INFO = {
  lengkap: { nama: 'Paket Lengkap', meta: '8 dokumen · sekitar 6 menit', desc: 'Dari CP sampai KKTP dalam satu proses berurutan.' },
  perencanaan: { nama: 'Paket Perencanaan', meta: '4 dokumen · sekitar 3 menit', desc: 'CP, ATP, Prota, Prosem. Pas untuk awal semester.' },
  pelaksanaan: { nama: 'Paket Pelaksanaan', meta: '4 dokumen · sekitar 3 menit', desc: 'Modul Ajar, LKPD, Paket Soal, KKTP per topik.' },
};
const ID_PERENCANAAN = ['cp', 'atp', 'prota', 'prosem'];

const emptyForm = {
  nama: '', sekolah: '', tahunAjaran: '',
  jenjang: 'SMP/MTs', fase: '', kelas: '', semester: 'Ganjil',
  mapel: '', topik: '', alokasi: '', model: 'auto',
  jmlPG: '10', jmlUraian: '3', materi: '', acuan: '', cpResmi: '',
};

function acuanUntuk(id, ctx, tempel) {
  switch (id) {
    case 'cp': return tempel.cp;
    case 'atp': return ctx.cp || '';
    case 'prota': return ctx.atp || '';
    case 'prosem': return ctx.prota || '';
    case 'modul': return ctx.atp || ctx.prosem || tempel.atp;
    case 'lkpd': return ctx.modul || '';
    case 'soal': return ctx.modul || ctx.atp || '';
    case 'kktp': return ctx.atp || tempel.atp;
    default: return '';
  }
}

export default function GeneratorPaket({ onBack, onOpenDoc, onChanged }) {
  const [mode, setMode] = useState('lengkap');
  const [form, setForm] = useState(() => ({ ...emptyForm, ...getProfile() }));
  const [tahap, setTahap] = useState('form'); // form | jalan | selesai
  const [steps, setSteps] = useState([]);
  const [detik, setDetik] = useState(0);
  const [subStatus, setSubStatus] = useState('');
  const [gagal, setGagal] = useState(null); // { index, pesan }
  const [hasilIds, setHasilIds] = useState([]);
  const [errForm, setErrForm] = useState({});
  const ctxRef = useRef({});
  const hasilRef = useRef([]);
  const rekomRef = useRef(null);
  const batalRef = useRef(false);
  const timerRef = useRef(null);

  const faseOpts = FASE[form.jenjang] || [];
  const mapelOpts = MAPEL[form.jenjang] || [];
  useEffect(() => {
    if (!faseOpts.includes(form.fase)) setForm((f) => ({ ...f, fase: faseOpts[0] || '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.jenjang]);
  useEffect(() => () => { clearInterval(timerRef.current); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Teks hasil unggahan dokumen ditambahkan ke kolom (tetap bisa diedit manual)
  function gabung(k, teks, nama) {
    setForm((f) => {
      const lama = (f[k] || '').trim();
      return { ...f, [k]: lama ? lama + '\n\n[Sumber: ' + nama + ']\n' + teks : teks };
    });
  }

  function validasi() {
    const e = {};
    if (!form.nama.trim()) e.nama = 'Wajib diisi.';
    if (!form.sekolah.trim()) e.sekolah = 'Wajib diisi.';
    if (!form.mapel.trim()) e.mapel = 'Wajib diisi.';
    if (!form.topik.trim()) e.topik = 'Wajib diisi.';
    if (mode === 'pelaksanaan' && !form.acuan.trim()) e.acuan = 'Tempel ATP/Prosem sebagai acuan.';
    setErrForm(e);
    return Object.keys(e).length === 0;
  }

  async function jalankan(dari) {
    const ids = RANTAI[mode];
    const info0 = { ...form };
    const tempel = { cp: info0.cpResmi, atp: info0.acuan };
    batalRef.current = false;
    setGagal(null);
    setTahap('jalan');
    setSubStatus('');
    setSteps(ids.map((id, i) => ({ id, status: i < dari ? 'ok' : 'antri' })));
    const t0 = Date.now() - (dari > 0 ? detik * 1000 : 0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setDetik(Math.floor((Date.now() - t0) / 1000)), 1000);
    let pos = dari;
    try {
      for (; pos < ids.length; pos++) {
        if (batalRef.current) return;
        const id = ids[pos];
        setSteps((prev) => prev.map((s, j) => (j === pos ? { ...s, status: 'jalan' } : s)));
        if (id === 'modul' && !rekomRef.current) {
          setSubStatus('Menyiapkan rekomendasi model pembelajaran...');
          try {
            rekomRef.current = await rekomendasiAI({ jenjang: info0.jenjang, fase: info0.fase, mapel: info0.mapel, topik: info0.topik });
          } catch { rekomRef.current = null; }
          setSubStatus('');
        }
        if (batalRef.current) return;
        const info = { ...info0 };
        delete info.acuan; delete info.cpResmi; delete info.materi;
        if (id === 'modul') {
          if (!info.model || info.model === 'auto') info.model = rekomRef.current?.model || '';
          if (!info.alokasi) info.alokasi = rekomRef.current?.alokasi || '';
        }
        const md = await generateDoc(
          id, info, info0.materi,
          acuanUntuk(id, ctxRef.current, tempel),
          id === 'modul' ? rekomRef.current : undefined,
        );
        if (batalRef.current) return;
        ctxRef.current[id] = md;
        const docId = await saveModul({
          docType: id, judul: extractTitle(md),
          jenjang: info0.jenjang, fase: info0.fase, kelas: info0.kelas, semester: info0.semester,
          mapel: info0.mapel, topik: info0.topik, alokasi: info.alokasi, model: info.model,
          nama: info0.nama, sekolah: info0.sekolah, tahunAjaran: info0.tahunAjaran,
          markdown: md, images: [],
        });
        setHasilIds((prev) => [...prev, { id, docId, judul: extractTitle(md) }]);
        setSteps((prev) => prev.map((s, j) => (j === pos ? { ...s, status: 'ok' } : s)));
      }
      // Catat paket perencanaan agar muncul di Ruang Perencanaan
      const peta = {};
      for (const h of hasilRef.current) if (ID_PERENCANAAN.includes(h.id)) peta[h.id] = h.docId;
      if (Object.keys(peta).length === ID_PERENCANAAN.length) {
        await savePaket({
          mapel: info0.mapel, kelas: info0.kelas, semester: info0.semester,
          tahunAjaran: info0.tahunAjaran, jenjang: info0.jenjang, fase: info0.fase,
          nama: info0.nama, sekolah: info0.sekolah, docs: peta,
        });
      }
      saveProfile({ nama: info0.nama, sekolah: info0.sekolah, tahunAjaran: info0.tahunAjaran, jenjang: info0.jenjang });
      clearInterval(timerRef.current);
      setTahap('selesai');
      onChanged && onChanged();
    } catch (e) {
      if (batalRef.current) return;
      clearInterval(timerRef.current);
      setSteps((prev) => prev.map((s, j) => (j === pos ? { ...s, status: 'gagal' } : s)));
      setGagal({ index: pos, pesan: e.message || 'Terjadi kendala.' });
    }
  }

  useEffect(() => { hasilRef.current = hasilIds; }, [hasilIds]);

  function mulai() {
    if (!validasi()) return;
    ctxRef.current = {}; rekomRef.current = null;
    setHasilIds([]); setDetik(0);
    jalankan(0);
    window.scrollTo(0, 0);
  }

  function batalkan() {
    batalRef.current = true;
    clearInterval(timerRef.current);
    setTahap('form');
    window.scrollTo(0, 0);
  }

  const ids = RANTAI[mode];
  const fmtWaktu = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

  return (
    <div className="wrap">
      <span className="kicker">Generator Paket</span>
      <h1 className="page">Delapan Dokumen, Satu Klik</h1>
      <p className="lead">
        CP, ATP, Prota, Prosem, Modul Ajar, LKPD, Paket Soal, dan KKTP disusun berurutan.
        Setiap dokumen otomatis menjadi acuan untuk dokumen berikutnya.
      </p>

      {tahap === 'form' && (
        <>
          <h2 style={{ marginTop: 28 }}>Pilih paket</h2>
          <div className="grid2" role="radiogroup" aria-label="Pilih paket dokumen">
            {Object.entries(MODE_INFO).map(([k, m]) => (
              <button
                key={k} type="button" role="radio" aria-checked={mode === k}
                className="card" onClick={() => setMode(k)}
                style={{
                  textAlign: 'left', cursor: 'pointer',
                  borderColor: mode === k ? 'var(--red)' : undefined,
                  boxShadow: mode === k ? '3px 3px 0 var(--red)' : undefined,
                }}
              >
                <b style={{ display: 'block', fontSize: 16 }}>{m.nama}</b>
                <span className="chip red" style={{ margin: '6px 0' }}>{m.meta}</span>
                <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--muted, #6f6a5e)' }}>{m.desc}</p>
              </button>
            ))}
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <b style={{ fontSize: 13 }}>Alur acuan otomatis</b>
            <p className="hint" style={{ margin: '6px 0 0' }}>
              {ids.map((id) => DOC_TYPES[id]?.nama || id).join(' → ')}
            </p>
          </div>

          {mode !== 'pelaksanaan' ? (
            <div className="alert alert-info" style={{ marginTop: 14 }}>
              <b>Belum punya CP / ATP / Prota / Prosem? Tidak masalah.</b> Mode ini
              justru menyusunnya dari nol secara berurutan — kamu cukup isi data dasar
              di bawah. Teks CP resmi boleh ditempel bila ada; bila tidak, AI menyusun
              drafnya dari info jenjang, fase, dan mapel.
            </div>
          ) : (
            <div className="alert alert-info" style={{ marginTop: 14 }}>
              <b>Mode ini butuh acuan.</b> Tempel ATP atau Prosem yang sudah ada pada
              kolom Dokumen Acuan di bawah, agar Modul Ajar dan turunannya selaras
              dengan perencanaanmu.
            </div>
          )}

          <h2 style={{ marginTop: 28 }}>Data pembelajaran</h2>
          <div className="grid2">
            <div className="field"><label>Nama Guru</label>
              <input value={form.nama} onChange={(e) => set('nama', e.target.value)} placeholder="cth: Alfaruq Asri, S.Pd." />
              {errForm.nama && <p className="hint" style={{ color: 'var(--red)' }}>{errForm.nama}</p>}</div>
            <div className="field"><label>Sekolah</label>
              <input value={form.sekolah} onChange={(e) => set('sekolah', e.target.value)} placeholder="cth: SMAN Modal Bangsa" />
              {errForm.sekolah && <p className="hint" style={{ color: 'var(--red)' }}>{errForm.sekolah}</p>}</div>
            <div className="field"><label>Tahun Ajaran</label>
              <input value={form.tahunAjaran} onChange={(e) => set('tahunAjaran', e.target.value)} placeholder="cth: 2026/2027" /></div>
            <div className="field"><label>Jenjang</label>
              <select value={form.jenjang} onChange={(e) => set('jenjang', e.target.value)}>
                {JENJANG.map((j) => <option key={j}>{j}</option>)}
              </select></div>
            <div className="field"><label>Fase</label>
              <select value={form.fase} onChange={(e) => set('fase', e.target.value)}>
                {faseOpts.map((f) => <option key={f}>{f}</option>)}
              </select></div>
            <div className="field"><label>Kelas</label>
              <input value={form.kelas} onChange={(e) => set('kelas', e.target.value)} placeholder="cth: 8" /></div>
            <div className="field"><label>Semester</label>
              <select value={form.semester} onChange={(e) => set('semester', e.target.value)}>
                {SEMESTER.map((s) => <option key={s}>{s}</option>)}
              </select></div>
            <div className="field"><label>Mata Pelajaran</label>
              <input value={form.mapel} onChange={(e) => set('mapel', e.target.value)} placeholder="cth: IPA" list="mapelList" />
              <datalist id="mapelList">{mapelOpts.map((m) => <option key={m} value={m} />)}</datalist>
              {errForm.mapel && <p className="hint" style={{ color: 'var(--red)' }}>{errForm.mapel}</p>}</div>
          </div>
          <div className="field"><label>Topik / Materi Pokok</label>
            <input value={form.topik} onChange={(e) => set('topik', e.target.value)} placeholder="cth: Sistem pernapasan manusia" />
            {errForm.topik && <p className="hint" style={{ color: 'var(--red)' }}>{errForm.topik}</p>}</div>
          <div className="grid2">
            <div className="field"><label>Model Pembelajaran</label>
              <select value={form.model} onChange={(e) => set('model', e.target.value)}>
                <option value="auto">Rekomendasi AI (otomatis)</option>
                {MODEL.map((m) => <option key={m}>{m}</option>)}
              </select></div>
            <div className="field"><label>Alokasi Waktu</label>
              <input value={form.alokasi} onChange={(e) => set('alokasi', e.target.value)} placeholder="cth: 2 x 45 menit" /></div>
            <div className="field"><label>Jumlah Soal PG</label>
              <input type="number" min="0" value={form.jmlPG} onChange={(e) => set('jmlPG', e.target.value)} /></div>
            <div className="field"><label>Jumlah Soal Uraian</label>
              <input type="number" min="0" value={form.jmlUraian} onChange={(e) => set('jmlUraian', e.target.value)} /></div>
          </div>
          <div className="field"><label>Materi Sumber <span className="hint">(opsional)</span></label>
            <textarea value={form.materi} onChange={(e) => set('materi', e.target.value)}
              placeholder="Tempel ringkasan materi dari buku atau sumber tepercaya" rows={3} />
            <UnggahDokumen onTeks={(t, n) => gabung('materi', t, n)} /></div>
          {mode === 'pelaksanaan' && (
            <div className="field"><label>Dokumen Acuan (ATP/Prosem)</label>
              <textarea value={form.acuan} onChange={(e) => set('acuan', e.target.value)}
                placeholder="Tempel ATP atau Prosem yang sudah ada" rows={4} />
              <UnggahDokumen onTeks={(t, n) => gabung('acuan', t, n)} />
              {errForm.acuan && <p className="hint" style={{ color: 'var(--red)' }}>{errForm.acuan}</p>}</div>
          )}
          <div className="field"><label>Teks CP Resmi <span className="hint">(opsional, bila ditempel AI merujuk persis ke teks ini)</span></label>
            <textarea value={form.cpResmi} onChange={(e) => set('cpResmi', e.target.value)}
              placeholder="Tempel CP resmi Kemendikdasmen bila ada" rows={3} />
            <UnggahDokumen onTeks={(t, n) => gabung('cpResmi', t, n)} /></div>

          <div className="btn-row">
            <button className="btn btn-primary" onClick={mulai}>Buat {MODE_INFO[mode].nama}</button>
            <button className="btn" onClick={onBack}>Kembali</button>
          </div>
          <p className="hint">{MODE_INFO[mode].meta}. Proses berjalan berurutan dan tiap dokumen tersimpan otomatis ke Dokumen Saya.</p>
        </>
      )}

      {tahap === 'jalan' && (
        <>
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b>Menyusun {MODE_INFO[mode].nama}...</b>
            <span className="chip">{fmtWaktu(detik)}</span>
          </div>
          {subStatus && <p className="hint" style={{ marginTop: 10 }}>{subStatus}</p>}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {steps.map((s, i) => (
              <div key={s.id} className="card" style={{
                padding: '12px 16px',
                opacity: s.status === 'antri' ? 0.55 : 1,
                borderColor: s.status === 'jalan' ? 'var(--red)' : undefined,
              }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: '50%', flex: 'none',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 14, color: '#fff',
                    background: s.status === 'ok' ? 'var(--ok, #2e7d32)' : s.status === 'gagal' ? 'var(--red)' : s.status === 'jalan' ? 'var(--red)' : '#a8a59c',
                  }}>
                    {s.status === 'ok' ? '✓' : s.status === 'gagal' ? '!' : i + 1}
                  </span>
                  <div>
                    <b>{DOC_TYPES[s.id]?.nama || s.id}</b>
                    <p className="hint" style={{ margin: 0 }}>{RANTAI_DESC[s.id]}</p>
                    {s.status === 'jalan' && <p className="hint" style={{ margin: 0, color: 'var(--red)' }}>Menyusun...</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {gagal ? (
            <div className="alert" style={{ marginTop: 16 }}>
              <b>Kendala pada {DOC_TYPES[RANTAI[mode][gagal.index]]?.nama}:</b> {gagal.pesan}
              <br />Dokumen yang sudah selesai tetap tersimpan.
              <div className="btn-row">
                <button className="btn btn-primary" onClick={() => jalankan(gagal.index)}>Coba lagi dari langkah ini</button>
                <button className="btn" onClick={batalkan}>Batalkan</button>
              </div>
            </div>
          ) : (
            <div className="btn-row">
              <button className="btn" onClick={batalkan}>Batalkan</button>
            </div>
          )}
          <p className="hint">Jangan tutup halaman ini sampai selesai.</p>
        </>
      )}

      {tahap === 'selesai' && (
        <>
          <div className="alert alert-info">
            <b>Paket selesai disusun</b> dalam {fmtWaktu(detik)}. Semua dokumen tersimpan di Dokumen Saya
            {mode !== 'pelaksanaan' && ' dan paket perencanaan tercatat di Ruang Perencanaan'}. Klik untuk membuka dan mengeditnya.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {hasilIds.map((h) => (
              <div key={h.docId} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                <div>
                  <span className="chip red">{DOC_TYPES[h.id]?.nama}</span>
                  <b style={{ display: 'block', marginTop: 6 }}>{h.judul}</b>
                </div>
                <button className="btn btn-sm btn-ink" onClick={() => onOpenDoc(h.docId)}>Buka</button>
              </div>
            ))}
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => { setTahap('form'); window.scrollTo(0, 0); }}>Buat paket baru</button>
            <button className="btn" onClick={onBack}>Kembali ke Beranda</button>
          </div>
        </>
      )}
    </div>
  );
}
