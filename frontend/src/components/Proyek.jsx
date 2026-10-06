import { useEffect, useState } from 'react';
import { DOC_TYPES, ALUR_PERENCANAAN } from '../lib/docs';
import { saveProject, updateProject, deleteProject, getPaket, deleteModul } from '../lib/db';
import FormulirDasar from './FormulirDasar';

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function labelProyek(p) {
  return [p.mapel, p.kelas].filter(Boolean).join(' ') || p.nama || 'Proyek';
}

function FormProyek({ awal, onSimpan, onBatal, busy }) {
  const [f, setF] = useState({
    nama: awal?.nama || '',
    jenjang: awal?.jenjang || 'SMA/MA',
    fase: awal?.fase || '',
    kelas: awal?.kelas || '',
    semester: awal?.semester || 'Ganjil',
    mapel: awal?.mapel || '',
    tahunAjaran: awal?.tahunAjaran || '',
  });
  const [err, setErr] = useState('');
  const saran = [f.mapel, f.kelas].filter(Boolean).join(' ');
  function simpan() {
    if (!f.mapel) { setErr('Pilih mata pelajaran dulu.'); return; }
    setErr('');
    onSimpan({ ...f, nama: f.nama.trim() || saran });
  }
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>{awal ? 'Ubah Proyek' : 'Proyek Baru'}</h3>
      <p className="hint" style={{ marginTop: 0 }}>Satu proyek untuk satu mata pelajaran + kelas + semester.</p>
      <div className="grid2">
        <div className="field"><label htmlFor="fp-nama">Nama Proyek</label>
          <input id="fp-nama" value={f.nama} onChange={(e) => setF((p) => ({ ...p, nama: e.target.value }))} placeholder={saran || 'cth: IPA 7'} /></div>
        <FormulirDasar
          nilai={f}
          onUbah={(patch) => { setF((p) => ({ ...p, ...patch })); setErr(''); }}
          fields={['jenjang', 'fase', 'kelas', 'semester', 'mapel', 'tahunAjaran']}
          wajib={['mapel']}
          galat={err ? { mapel: err } : {}}
          prefix="fp"
        />
      </div>
      <div className="btn-row">
        <button className="btn" onClick={onBatal}>Batal</button>
        <button className="btn btn-primary" onClick={simpan} disabled={busy}>{awal ? 'Simpan Perubahan' : 'Buat Proyek'}</button>
      </div>
    </div>
  );
}

export function hitungDokumen(projects, docs) {
  const hitung = {};
  for (const p of projects) hitung[p.id] = 0;
  for (const d of docs) {
    const pid = d.projectId ? String(d.projectId) : '';
    if (pid && hitung[pid] !== undefined) hitung[pid]++;
  }
  return hitung;
}

export function ProyekList({ projects, docs, onOpen, onOpenDoc, onChanged }) {
  const [showBaru, setShowBaru] = useState(false);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  const hitung = hitungDokumen(projects, docs);
  const tanpaProyek = docs.filter((d) => !d.projectId);

  async function buat(data) {
    setBusy(true);
    try { await saveProject(data); setShowBaru(false); onChanged && onChanged(); }
    finally { setBusy(false); }
  }
  async function ubah(id, data) {
    setBusy(true);
    try { await updateProject(id, data); setEditId(null); onChanged && onChanged(); }
    finally { setBusy(false); }
  }
  async function hapus(p) {
    if (!confirm(`Hapus proyek "${labelProyek(p)}"? Dokumennya tidak ikut terhapus, pindah ke Tanpa proyek.`)) return;
    setBusy(true);
    try { await deleteProject(p.id); onChanged && onChanged(); }
    finally { setBusy(false); }
  }
  async function hapusDokumen(m) {
    const nama = (DOC_TYPES[m.docType] || {}).nama || 'Dokumen';
    if (!confirm(`Hapus ${nama} "${m.judul}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setBusy(true);
    try { await deleteModul(m.id); onChanged && onChanged(); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 4px', flexWrap: 'wrap' }}>
        <div className="flow-num sm" aria-hidden="true">02</div>
        <h2 className="sec" style={{ margin: 0, flex: 1 }}>Proyek Saya</h2>
        <button className="btn btn-sm btn-primary" onClick={() => { setShowBaru(!showBaru); setEditId(null); }}>
          {showBaru ? 'Tutup' : '+ Proyek Baru'}
        </button>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>Satu proyek untuk satu mata pelajaran. Klik untuk melihat semua dokumennya.</p>

      {showBaru && <FormProyek onSimpan={buat} onBatal={() => setShowBaru(false)} busy={busy} />}

      {projects.length === 0 && !showBaru ? (
        <div className="empty">
          <h3>Belum ada proyek</h3>
          <p>Buat satu proyek per mata pelajaran, mis. IPA kelas 7. Semua dokumenmu terkumpul di sana.</p>
          <button className="btn btn-primary" onClick={() => setShowBaru(true)}>Buat Proyek Pertama</button>
        </div>
      ) : (
        <div className="modul-grid">
          {projects.map((p) => (
            <div className="card modul-card" key={p.id}>
              {editId === p.id ? (
                <FormProyek awal={p} onSimpan={(d) => ubah(p.id, d)} onBatal={() => setEditId(null)} busy={busy} />
              ) : (
                <>
                  <span className="chip red" style={{ alignSelf: 'flex-start' }}>
                    {hitung[p.id] || 0} dokumen
                  </span>
                  <h3>{labelProyek(p)}</h3>
                  <div className="meta">
                    {p.jenjang && <span className="chip fill">{p.jenjang}</span>}
                    {p.kelas && <span className="chip">{p.kelas}</span>}
                    {p.semester && <span className="chip">{p.semester}</span>}
                  </div>
                  {p.tahunAjaran && <time>Tahun ajaran {p.tahunAjaran}</time>}
                  <div className="actions">
                    <button className="btn btn-sm btn-ink" onClick={() => onOpen(p.id)}>Buka</button>
                    <button className="btn btn-sm" onClick={() => { setEditId(p.id); setShowBaru(false); }}>Ubah</button>
                    <button className="btn btn-sm" onClick={() => hapus(p)}>Hapus</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {tanpaProyek.length > 0 && (
        <>
          <h2 className="sec" style={{ marginTop: 36 }}>Tanpa Proyek</h2>
          <p className="hint" style={{ marginTop: 0 }}>Dokumen yang belum dimasukkan ke proyek mana pun.</p>
          <div className="modul-grid">
            {tanpaProyek.map((m) => {
              const tn = (DOC_TYPES[m.docType] || {}).nama || 'Dokumen';
              return (
                <div className="card modul-card" key={m.id}>
                  <span className="chip red" style={{ alignSelf: 'flex-start' }}>{tn}</span>
                  <h3>{m.judul}</h3>
                  <div className="meta">
                    {m.jenjang && <span className="chip fill">{m.jenjang}</span>}
                    {m.mapel && <span className="chip">{m.mapel}</span>}
                  </div>
                  <time>Diperbarui {fmtDate(m.updatedAt)}</time>
                  <div className="actions">
                    <button className="btn btn-sm btn-ink" onClick={() => onOpenDoc(m.id)}>Buka</button>
                    <button className="btn btn-sm btn-danger" onClick={() => hapusDokumen(m)} disabled={busy}>Hapus</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

const GRUP_DETAIL = [
  { key: 'modul', judul: 'Modul Ajar', types: ['modul'] },
  { key: 'lkpd', judul: 'LKPD', types: ['lkpd'] },
  { key: 'penilaian', judul: 'Penilaian', types: ['soal', 'kktp'] },
];

export function ProyekDetail({ project, docs, onBack, onOpenDoc, onRuang, onBuatModul, onChanged }) {
  const [paketDocs, setPaketDocs] = useState(null);
  const [editNama, setEditNama] = useState(false);
  const [namaBaru, setNamaBaru] = useState(project.nama || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setNamaBaru(project.nama || ''); }, [project.id, project.nama]);
  // Muat dokumen perencanaan dari paket tertaut (bila ada)
  useEffect(() => {
    let stop = false;
    (async () => {
      if (project.paketId) {
        const p = await getPaket(project.paketId).catch(() => null);
        if (!stop) setPaketDocs((p && p.docs) || {});
      } else if (!stop) setPaketDocs({});
    })();
    return () => { stop = true; };
  }, [project.paketId, project.id]);

  const dokProyek = docs.filter((d) => String(d.projectId || '') === String(project.id));
  const dokPerJenis = {};
  for (const d of dokProyek) {
    const t = d.docType || 'modul';
    (dokPerJenis[t] = dokPerJenis[t] || []).push(d);
  }
  function dokLangkah(key) {
    if (paketDocs && paketDocs[key]) return { id: paketDocs[key] };
    return (dokPerJenis[key] || [])[0] || null;
  }

  async function simpanNama() {
    const nama = namaBaru.trim();
    if (!nama) return;
    setBusy(true);
    try { await updateProject(project.id, { nama }); setEditNama(false); onChanged && onChanged(); }
    finally { setBusy(false); }
  }

  async function hapusDokumen(m) {
    const nama = (DOC_TYPES[m.docType] || {}).nama || 'Dokumen';
    if (!confirm(`Hapus ${nama} "${m.judul}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setBusy(true);
    try { await deleteModul(m.id); onChanged && onChanged(); }
    finally { setBusy(false); }
  }

  return (
    <div className="wrap">
      <button className="btn btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>← Semua Proyek</button>
      <span className="kicker">Proyek</span>
      {editNama ? (
        <div className="field" style={{ maxWidth: 420 }}>
          <label>Nama proyek</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={namaBaru} onChange={(e) => setNamaBaru(e.target.value)} />
            <button className="btn btn-sm btn-primary" onClick={simpanNama} disabled={busy}>Simpan</button>
            <button className="btn btn-sm" onClick={() => setEditNama(false)}>Batal</button>
          </div>
        </div>
      ) : (
        <h1 className="page">{labelProyek(project)}{' '}
          <button className="btn btn-sm" onClick={() => setEditNama(true)} aria-label="Ubah nama proyek">Ubah</button>
        </h1>
      )}
      <div className="meta" style={{ marginBottom: 8 }}>
        {[project.jenjang, project.fase, project.kelas ? 'Kelas ' + project.kelas : '', project.semester ? 'Semester ' + project.semester : '', project.tahunAjaran].filter(Boolean).map((c) => (
          <span className="chip" key={c}>{c}</span>
        ))}
      </div>
      <div className="btn-row" style={{ marginBottom: 8 }}>
        <button className="btn btn-primary" onClick={onRuang}>Buka Ruang Perencanaan</button>
        <button className="btn" onClick={onBuatModul}>Buat Modul Ajar</button>
      </div>

      <h2 className="sec" style={{ marginTop: 28 }}>Perencanaan</h2>
      <p className="hint" style={{ marginTop: 0 }}>CP, ATP, Prota, Prosem disusun berurutan dan menjadi acuan dokumen lain.</p>
      {ALUR_PERENCANAAN.map((s) => {
        const dok = dokLangkah(s.key);
        return (
          <div className={'card step-card' + (dok ? ' done' : '')} key={s.key}>
            <div className="step-row">
              <div className="step-num" aria-hidden="true">{s.langkah}</div>
              <div className="step-body">
                <h3>{s.nama}</h3>
                {dok ? <div className="hint" style={{ color: 'var(--ok)', fontWeight: 700 }}>Sudah disusun ✓</div> : <p>{s.desc}</p>}
              </div>
              <div className="btn-row" style={{ margin: 0 }}>
                {dok && <button className="btn btn-sm" onClick={() => onOpenDoc(dok.id)}>Lihat</button>}
                <button className="btn btn-sm btn-primary" onClick={onRuang}>{dok ? 'Susun Ulang' : 'Susun'}</button>
              </div>
            </div>
          </div>
        );
      })}

      {GRUP_DETAIL.map((g) => {
        const isi = (dokProyek || []).filter((d) => g.types.includes(d.docType));
        if (isi.length === 0) return null;
        return (
          <div key={g.key}>
            <h2 className="sec" style={{ marginTop: 28 }}>{g.judul} <span className="hint">({isi.length})</span></h2>
            <div className="modul-grid">
              {isi.map((m) => (
                <div className="card modul-card" key={m.id}>
                  <span className="chip red" style={{ alignSelf: 'flex-start' }}>{(DOC_TYPES[m.docType] || {}).nama || 'Dokumen'}</span>
                  <h3>{m.judul}</h3>
                  {m.topik && <div style={{ fontSize: 13.5, color: 'var(--slate)' }}>{m.topik}</div>}
                  <time>Diperbarui {fmtDate(m.updatedAt)}</time>
                  <div className="actions">
                    <button className="btn btn-sm btn-ink" onClick={() => onOpenDoc(m.id)}>Buka</button>
                    <button className="btn btn-sm btn-danger" onClick={() => hapusDokumen(m)} disabled={busy}>Hapus</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {dokProyek.length === 0 && (
        <div className="empty" style={{ marginTop: 24 }}>
          <h3>Proyek ini masih kosong</h3>
          <p>Mulai dari Ruang Perencanaan, atau langsung buat Modul Ajar.</p>
        </div>
      )}
    </div>
  );
}
