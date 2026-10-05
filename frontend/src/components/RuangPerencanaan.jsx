import { useEffect, useState } from 'react';
import { JENJANG, FASE, MAPEL } from '../lib/referensi';
import { DOC_TYPES, ALUR_PERENCANAAN, SEMESTER } from '../lib/docs';
import { generateDoc, extractTitle, getProfile } from '../lib/api';
import { saveModul, updateModul, getModul, savePaket, updatePaket, deletePaket, listPakets, getPaket, paketProgress } from '../lib/db';
import DocEditor from './DocEditor';

const GEN_STAGE = ['Menyiapkan kerangka...', 'Merumuskan dari acuan...', 'Menyusun dokumen...', 'Merapikan hasil...'];

// Urutan prasyarat: tiap langkah butuh langkah sebelumnya
const BUTUH = { cp: null, atp: 'cp', prota: 'atp', prosem: 'prota' };

export default function RuangPerencanaan({ onBack, onOpenDoc, onBuatModul }) {
  const [pakets, setPakets] = useState([]);
  const [paketId, setPaketId] = useState(null);
  const [paket, setPaket] = useState(null);
  const [showBaru, setShowBaru] = useState(false);
  const [baru, setBaru] = useState({ jenjang: 'SMA/MA', fase: 'F (Kelas 11-12)', kelas: '', semester: 'Ganjil', mapel: '', tahunAjaran: '' });
  const [stepKey, setStepKey] = useState(null);

  async function refresh(id) {
    const list = await listPakets();
    setPakets(list);
    const pid = id || paketId;
    if (pid) setPaket(await getPaket(pid));
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const p = getProfile();
    setBaru((b) => ({ ...b, tahunAjaran: b.tahunAjaran || p.tahunAjaran || '' }));
  }, []);

  async function buatPaket() {
    if (!baru.mapel) { alert('Pilih mata pelajaran dulu.'); return; }
    const id = await savePaket({ ...baru, docs: {} });
    setShowBaru(false);
    setPaketId(id);
    setPaket(await getPaket(id));
    refresh(id);
  }

  async function hapusPaket(id) {
    if (!confirm('Hapus paket perencanaan ini? Dokumen yang sudah dibuat tidak ikut terhapus.')) return;
    await deletePaket(id);
    if (paketId === id) { setPaketId(null); setPaket(null); }
    refresh();
  }

  function bukaPaket(id) { setPaketId(id); setStepKey(null); refresh(id); }

  if (!paket) {
    return (
      <div className="wrap narrow">
        <span className="kicker">Ruang Perencanaan</span>
        <h1 className="page">Alur Perangkat Ajar</h1>
        <p className="lead">
          Susun perangkat <strong>berurutan</strong>: CP → ATP → Prota → Prosem — baru Modul Ajar.
          Tiap dokumen menjadi <strong>acuan resmi</strong> dokumen berikutnya, bukan karangan AI.
        </p>
        <div className="btn-row" style={{ marginBottom: 20 }}>
          <button className="btn" onClick={onBack}>Kembali</button>
          <button className="btn btn-primary" onClick={() => setShowBaru(!showBaru)}>+ Paket Perencanaan Baru</button>
        </div>

        {showBaru && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>Paket Baru</h3>
            <div className="grid2">
              <div className="field"><label>Jenjang</label>
                <select value={baru.jenjang} onChange={(e) => setBaru({ ...baru, jenjang: e.target.value, fase: FASE[e.target.value][0], mapel: '' })}>
                  {JENJANG.map((j) => <option key={j}>{j}</option>)}
                </select></div>
              <div className="field"><label>Fase</label>
                <select value={baru.fase} onChange={(e) => setBaru({ ...baru, fase: e.target.value })}>
                  {FASE[baru.jenjang].map((f) => <option key={f}>{f}</option>)}
                </select></div>
              <div className="field"><label>Kelas</label>
                <input placeholder="cth: XI-1" value={baru.kelas} onChange={(e) => setBaru({ ...baru, kelas: e.target.value })} /></div>
              <div className="field"><label>Semester</label>
                <select value={baru.semester} onChange={(e) => setBaru({ ...baru, semester: e.target.value })}>
                  {SEMESTER.map((s) => <option key={s}>{s}</option>)}
                </select></div>
              <div className="field"><label>Mata Pelajaran</label>
                <select value={baru.mapel} onChange={(e) => setBaru({ ...baru, mapel: e.target.value })}>
                  <option value="">— Pilih —</option>
                  {MAPEL[baru.jenjang].map((m) => <option key={m}>{m}</option>)}
                </select></div>
              <div className="field"><label>Tahun Ajaran</label>
                <input placeholder="cth: 2025/2026" value={baru.tahunAjaran} onChange={(e) => setBaru({ ...baru, tahunAjaran: e.target.value })} /></div>
            </div>
            <div className="btn-row">
              <button className="btn" onClick={() => setShowBaru(false)}>Batal</button>
              <button className="btn btn-primary" onClick={buatPaket}>Buat Paket</button>
            </div>
          </div>
        )}

        {pakets.length === 0 ? (
          <div className="empty">
            <h3>Belum ada paket perencanaan</h3>
            <p>Buat satu paket per mata pelajaran + kelas + semester.</p>
          </div>
        ) : (
          <div className="modul-grid">
            {pakets.map((p) => {
              const prog = paketProgress(p);
              return (
                <div className="card modul-card" key={p.id}>
                  <span className="chip red" style={{ alignSelf: 'flex-start' }}>{prog}/4 Langkah</span>
                  <h3>{p.mapel}</h3>
                  <div className="meta">
                    <span className="chip fill">{p.jenjang}</span>
                    {p.fase && <span className="chip">{p.fase}</span>}
                    {p.kelas && <span className="chip">{p.kelas}</span>}
                    <span className="chip">Semester {p.semester}</span>
                  </div>
                  <div className="progress"><div className="progress-fill" style={{ width: (prog / 4 * 100) + '%' }} /></div>
                  <div className="actions">
                    <button className="btn btn-sm btn-ink" onClick={() => bukaPaket(p.id)}>Buka</button>
                    <button className="btn btn-sm" onClick={() => hapusPaket(p.id)}>Hapus</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const docs = paket.docs || {};
  const prog = paketProgress(paket);

  return (
    <div className="wrap narrow">
      <span className="kicker">Ruang Perencanaan</span>
      <h1 className="page">{paket.mapel}</h1>
      <p className="lead">{paket.jenjang} · {paket.fase} · {paket.kelas} · Semester {paket.semester} · {paket.tahunAjaran}</p>

      <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 220 }}><strong>Kemajuan{' '}{prog}/4.</strong> Selesaikan berurutan — tiap dokumen menjadi acuan dokumen berikutnya.</span>
        <div className="progress" style={{ flex: 1, minWidth: 140 }}><div className="progress-fill" style={{ width: (prog / 4 * 100) + '%' }} /></div>
      </div>

      {!stepKey && (
        <>
          {ALUR_PERENCANAAN.map((s) => {
            const need = BUTUH[s.key];
            const locked = need && !docs[need];
            const done = !!docs[s.key];
            const needName = need ? DOC_TYPES[need].nama : '';
            return (
              <div className={'card step-card' + (done ? ' done' : '')} key={s.key}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div className="step-num">{s.langkah}</div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <h3 style={{ margin: '0 0 4px' }}>{s.nama}</h3>
                    <p style={{ margin: 0, fontSize: 14 }}>{s.desc}</p>
                    {locked && <div className="hint" style={{ color: '#a33' }}>Selesaikan <strong>{needName}</strong> dulu — {s.nama}{' '}diturunkan darinya.</div>}
                    {done && <div className="hint" style={{ color: '#1a7a3a', fontWeight: 700 }}>Sudah disusun ✓</div>}
                  </div>
                  <div className="btn-row" style={{ margin: 0 }}>
                    {done && <button className="btn btn-sm" onClick={() => onOpenDoc(docs[s.key])}>Lihat</button>}
                    <button className="btn btn-sm btn-primary" disabled={!!locked} onClick={() => setStepKey(s.key)}>
                      {done ? 'Susun Ulang' : locked ? 'Terkunci' : 'Susun'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="btn-row">
            <button className="btn" onClick={() => { setPaketId(null); setPaket(null); refresh(); }}>Semua Paket</button>
            {docs.atp && (
              <button className="btn btn-primary" onClick={() => onBuatModul && onBuatModul(paket.id)}>
                Buat Modul Ajar dari Paket Ini
              </button>
            )}
          </div>
          {docs.atp && (
            <div className="hint" style={{ marginTop: 8 }}>
              Modul Ajar akan disusun dengan merujuk CP, ATP, Prota, dan Prosem paket ini — TP dan materi mengikuti acuan, bukan karangan AI.
            </div>
          )}
        </>
      )}

      {stepKey && (
        <StepWorkspace
          paket={paket}
          stepKey={stepKey}
          onClose={() => { setStepKey(null); refresh(); }}
          onOpenDoc={onOpenDoc}
        />
      )}
    </div>
  );
}

function StepWorkspace({ paket, stepKey, onClose, onOpenDoc }) {
  const dt = DOC_TYPES[stepKey];
  const need = BUTUH[stepKey];
  const [teks, setTeks] = useState('');       // CP resmi (tempel) / materi tambahan
  const [sumber, setSumber] = useState('');     // markdown dokumen acuan
  const [sumberJudul, setSumberJudul] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState('');
  const [finalMd, setFinalMd] = useState('');

  useEffect(() => {
    (async () => {
      if (need && paket.docs[need]) {
        const d = await getModul(paket.docs[need]);
        if (d) { setSumber(d.markdown || ''); setSumberJudul(d.judul || DOC_TYPES[need].nama); }
      }
    })();
  }, [paket, need, stepKey]);

  const profile = getProfile();
  const info = {
    nama: profile.nama, sekolah: profile.sekolah, tahunAjaran: paket.tahunAjaran || profile.tahunAjaran,
    jenjang: paket.jenjang, fase: paket.fase, kelas: paket.kelas, semester: paket.semester, mapel: paket.mapel,
  };

  async function handleGenerate() {
    setError(''); setBusy(true); setStage(0);
    const iv = setInterval(() => setStage((s) => Math.min(s + 1, GEN_STAGE.length - 1)), 8000);
    try {
      // CP: teks tempelan resmi jadi materi utama. Lainnya: sumber = dokumen acuan sebelumnya.
      const md = await generateDoc(stepKey, info, teks, stepKey === 'cp' ? '' : sumber);
      setMarkdown(md); setFinalMd(md);
    } catch (e) { setError(e.message); }
    finally { clearInterval(iv); setBusy(false); }
  }

  async function handleSave() {
    const judul = extractTitle(finalMd);
    const payload = {
      docType: stepKey, judul,
      jenjang: paket.jenjang, fase: paket.fase, kelas: paket.kelas, semester: paket.semester,
      mapel: paket.mapel, topik: '', nama: profile.nama, sekolah: profile.sekolah,
      tahunAjaran: paket.tahunAjaran || profile.tahunAjaran,
      markdown: finalMd, images: [], paketId: paket.id,
    };
    let docId = paket.docs[stepKey];
    if (docId) { await updateModul(docId, payload); }
    else { docId = await saveModul(payload); }
    await updatePaket(paket.id, { docs: { ...(paket.docs || {}), [stepKey]: docId } });
    onClose();
  }

  const isCp = stepKey === 'cp';

  return (
    <div className="card">
      <span className="kicker">Langkah {ALUR_PERENCANAAN.find((s) => s.key === stepKey).langkah}</span>
      <h2 style={{ margin: '4px 0 8px' }}>{dt.nama}</h2>

      {!markdown && !busy && (
        <>
          {isCp ? (
            <>
              <div className="alert alert-info">
                <strong>Sumber kredibel dulu.</strong> Tempel teks CP resmi (dari dokumen Kemendikdasmen / buku guru) di bawah.
                AI akan menyusunnya menjadi draf rapi <em>tanpa menambah kompetensi baru</em> di luar teks tersebut.
              </div>
              <div className="field">
                <label>Teks CP Resmi (tempel di sini)</label>
                <textarea rows={8} placeholder="Tempel teks Capaian Pembelajaran resmi untuk fase & mapel ini…" value={teks} onChange={(e) => setTeks(e.target.value)} />
                <div className="hint">{teks.length} karakter {teks.length === 0 && '— boleh kosong, AI akan menyusun draf dari kerangka nasional (tetap perlu diverifikasi guru)'}</div>
              </div>
            </>
          ) : (
            <>
              <div className="alert alert-info">
                <strong>Acuan:</strong> {sumberJudul || DOC_TYPES[need].nama}.{' '}{dt.nama}{' '}akan <strong>diturunkan langsung</strong> dari acuan ini — AI dilarang mengarang di luar acuan.
              </div>
              {sumber && (
                <details style={{ marginBottom: 14 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Lihat isi acuan</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, maxHeight: 220, overflow: 'auto', background: '#f4f2ec', padding: 12, border: '2px solid #1a1a1a' }}>{sumber.slice(0, 4000)}{sumber.length > 4000 ? '\n…' : ''}</pre>
                </details>
              )}
              <div className="field">
                <label>Catatan tambahan (opsional)</label>
                <textarea rows={3} placeholder="cth: fokus pada materi X, alokasi khusus…" value={teks} onChange={(e) => setTeks(e.target.value)} />
              </div>
            </>
          )}
          {error && <div className="alert alert-error">{error}</div>}
          <div className="btn-row">
            <button className="btn" onClick={onClose}>Kembali</button>
            <button className="btn btn-primary" onClick={handleGenerate}>Susun {dt.nama} dengan AI</button>
          </div>
        </>
      )}

      {busy && (
        <div className="loader-wrap">
          <div className="spinner" />
          <h2 style={{ margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Menyusun {dt.nama}…</h2>
          <div className="stage">{GEN_STAGE[stage]}</div>
        </div>
      )}

      {markdown && !busy && (
        <>
          <div className="toolbar no-print">
            <span className="kicker" style={{ margin: 0 }}>Editor Blok</span>
            <span className="draft-note">Periksa hasil AI — edit langsung bila perlu</span>
          </div>
          <DocEditor
            initialMarkdown={markdown}
            images={[]}
            docType={dt.nama}
            docTitle={extractTitle(markdown)}
            topic={paket.mapel}
            onChange={(md) => setFinalMd(md)}
          />
          {error && <div className="alert alert-error">{error}</div>}
          <div className="btn-row no-print">
            <button className="btn" onClick={() => { setMarkdown(''); setFinalMd(''); }}>Generate Ulang</button>
            <button className="btn btn-primary" onClick={handleSave}>Simpan ke Paket</button>
          </div>
        </>
      )}
    </div>
  );
}
