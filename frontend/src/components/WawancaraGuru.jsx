import { useEffect, useRef, useState } from 'react';
import { getToken } from '../lib/supabase';

// Wawancara Guru: gali persona & tipe guru sebelum AI menyusun perangkat ajar.
// Gaya AutoPRD — semua pertanyaan dalam satu halaman scroll, pilihan sebagai chip,
// tombol "Lewati" per pertanyaan. Pertanyaan bisa disesuaikan AI lewat
// POST /api/persona/pertanyaan; bila gagal/timeout, pakai daftar statis di bawah.
// Hasil: objek persona yang dikompilasi menjadi teks untuk prompt AI.
const PERTANYAAN = [
  {
    key: 'gaya',
    tanya: 'Bagaimana gaya mengajar Bapak/Ibu sehari-hari?',
    tipe: 'radio',
    opsi: [
      'Ceramah & penjelasan langsung',
      'Diskusi & kolaboratif',
      'Praktik & hands-on',
      'Campuran seimbang',
    ],
  },
  {
    key: 'siswa',
    tanya: 'Bagaimana karakteristik siswa di kelas?',
    tipe: 'radio',
    opsi: [
      'Aktif & antusias',
      'Pasif, perlu dipancing partisipasi',
      'Heterogen (kemampuan beragam)',
      'Kelas besar (lebih dari 32 siswa)',
    ],
  },
  {
    key: 'fasilitas',
    tanya: 'Fasilitas apa yang tersedia di kelas?',
    tipe: 'cek',
    opsi: [
      'Proyektor / LCD',
      'Internet / WiFi',
      'Lab / Perpustakaan',
      'Hanya papan tulis & spidol',
    ],
  },
  {
    key: 'preferensi',
    tanya: 'Modul seperti apa yang Bapak/Ibu harapkan?',
    tipe: 'radio',
    opsi: [
      'Detail & lengkap — siap pakai tanpa banyak persiapan',
      'Ringkas & fleksibel — kerangka saja, saya kembangkan sendiri',
      'Fokus aktivitas — banyak praktik & kerja kelompok',
      'Fokus materi — penjelasan konsep yang mendalam',
    ],
  },
  {
    key: 'pengalaman',
    tanya: 'Sudah berapa lama mengajar?',
    tipe: 'radio',
    opsi: [
      'Kurang dari 5 tahun',
      '5–10 tahun',
      'Lebih dari 10 tahun',
    ],
  },
  {
    key: 'catatan',
    tanya: 'Ada hal lain yang perlu AI tahu tentang gaya mengajar Bapak/Ibu? (opsional)',
    tipe: 'teks',
  },
];

const LABEL_STATIS = {
  gaya: 'Gaya mengajar',
  siswa: 'Karakteristik siswa',
  fasilitas: 'Fasilitas',
  preferensi: 'Preferensi modul',
  pengalaman: 'Pengalaman mengajar',
  catatan: 'Catatan khusus',
};

// Samakan bentuk pertanyaan dari API agar tahan terhadap variasi field.
function normalisasiPertanyaan(item) {
  if (!item || typeof item !== 'object') return null;
  const key = item.key || item.id;
  const tanya = item.tanya || item.pertanyaan || item.teks;
  if (!key || !tanya) return null;
  const tipeRaw = String(item.tipe || 'radio').toLowerCase();
  const tipe = tipeRaw === 'cek' || tipeRaw === 'multi' || tipeRaw === 'checkbox' || tipeRaw === 'ganda'
    ? 'cek'
    : tipeRaw === 'teks' || tipeRaw === 'isian' || tipeRaw === 'textarea' || tipeRaw === 'terbuka'
      ? 'teks'
      : 'radio';
  const opsi = Array.isArray(item.opsi) ? item.opsi
    : Array.isArray(item.pilihan) ? item.pilihan
    : Array.isArray(item.options) ? item.options : [];
  return { key: String(key), tanya: String(tanya), tipe, opsi: opsi.map(String), label: item.label ? String(item.label) : undefined };
}

// Pastikan selalu ada satu pertanyaan isian bebas di akhir (untuk catatan).
function pastikanIsian(daftar) {
  if (daftar.some((p) => p.tipe === 'teks')) return daftar;
  return [...daftar, { key: 'catatan', tanya: 'Ada hal lain yang perlu AI tahu? (opsional)', tipe: 'teks', opsi: [] }];
}

// Kompilasi persona untuk prompt AI. Tahan terhadap daftar pertanyaan dinamis:
// label diambil dari peta statis, lalu p.label dari API, terakhir key mentah.
export function kompilasiPersona(jawaban, catatan, daftarTanya) {
  const bagian = [];
  const daftar = Array.isArray(daftarTanya) && daftarTanya.length
    ? daftarTanya
    : Object.keys(jawaban || {}).map((k) => ({ key: k }));
  const sudah = new Set();
  for (const p of daftar) {
    const j = (jawaban || {})[p.key];
    if (j === undefined || j === null || j === '' || (Array.isArray(j) && !j.length)) continue;
    const v = Array.isArray(j) ? j.join(', ') : String(j);
    if (!v.trim()) continue;
    const nama = LABEL_STATIS[p.key] || p.label || p.key;
    bagian.push(`- ${nama}: ${v.trim()}`);
    sudah.add(p.key);
  }
  if (catatan && String(catatan).trim() && !sudah.has('catatan')) {
    bagian.push(`- Catatan khusus: ${String(catatan).trim()}`);
  }
  if (!bagian.length) return '';
  return `PROFIL GURU (sesuaikan nada, detail, dan aktivitas modul dengan profil ini):\n${bagian.join('\n')}`;
}

// Versi ramah pengguna untuk ringkasan di UI (tanpa instruksi prompt).
export function ringkasanPersona(jawaban, catatan) {
  const baris = [];
  for (const [k, v] of Object.entries(jawaban || {})) {
    if (k === 'catatan') continue; // sudah dicakup param `catatan` di bawah
    const teks = Array.isArray(v) ? v.join(', ') : String(v || '');
    if (teks.trim()) baris.push(`- ${LABEL_STATIS[k] || k}: ${teks.trim()}`);
  }
  if (catatan?.trim()) baris.push(`- Catatan khusus: ${catatan.trim()}`);
  return baris.join('\n');
}

export default function WawancaraGuru({ awal, konteks, onSelesai, onLewati }) {
  const [daftar, setDaftar] = useState(null); // null = memuat
  const [jawaban, setJawaban] = useState(awal?.jawaban || {});
  const [dilewati, setDilewati] = useState({});
  const [pakaiAI, setPakaiAI] = useState(false);
  const [tulisBuka, setTulisBuka] = useState({}); // key -> input "tulis sendiri" terbuka
  const [tulisTeks, setTulisTeks] = useState({}); // key -> teks jawaban sendiri
  const batal = useRef(false);

  // Muat pertanyaan yang disesuaikan AI; gagal/timeout -> daftar statis.
  useEffect(() => {
    batal.current = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    (async () => {
      try {
        const token = await getToken().catch(() => '');
        const r = await fetch('/api/persona/pertanyaan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
          body: JSON.stringify({ ...(konteks || {}) }),
          signal: ctrl.signal,
        });
        const d = await r.json().catch(() => ({}));
        const mentah = Array.isArray(d) ? d : d.pertanyaan || d.items || [];
        const bersih = mentah.map(normalisasiPertanyaan).filter(Boolean);
        if (!batal.current) {
          if (bersih.length) {
            setDaftar(pastikanIsian(bersih));
            setPakaiAI(true);
          } else {
            setDaftar(PERTANYAAN);
          }
        }
      } catch {
        if (!batal.current) setDaftar(PERTANYAAN);
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => { batal.current = true; ctrl.abort(); clearTimeout(timer); };
  }, []);

  function pilihRadio(key, val) {
    setJawaban((prev) => ({ ...prev, [key]: val }));
    setDilewati((prev) => ({ ...prev, [key]: false }));
  }
  function toggleCek(key, val) {
    setJawaban((prev) => {
      const arr = prev[key] || [];
      const ada = arr.includes(val);
      return { ...prev, [key]: ada ? arr.filter((x) => x !== val) : [...arr, val] };
    });
    setDilewati((prev) => ({ ...prev, [key]: false }));
  }
  function isiTeks(key, val) {
    setJawaban((prev) => ({ ...prev, [key]: val }));
    setDilewati((prev) => ({ ...prev, [key]: false }));
  }
  function toggleLewati(key) {
    setDilewati((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (next[key]) {
        setJawaban((pj) => {
          const pjBaru = { ...pj };
          delete pjBaru[key];
          return pjBaru;
        });
        setTulisTeks((pt) => {
          const baru = { ...pt };
          delete baru[key];
          return baru;
        });
        setTulisBuka((pb) => ({ ...pb, [key]: false }));
      }
      return next;
    });
  }

  // Gabungkan jawaban "tulis sendiri" ke jawaban: radio -> menggantikan chip,
  // cek -> ditambahkan ke daftar pilihan.
  function gabungTulisSendiri(jwb) {
    const hasil = { ...jwb };
    for (const [k, t] of Object.entries(tulisTeks)) {
      const teks = (t || '').trim();
      if (!teks) continue;
      const cur = hasil[k];
      if (Array.isArray(cur)) {
        if (!cur.includes(teks)) hasil[k] = [...cur, teks];
      } else {
        hasil[k] = teks;
      }
    }
    return hasil;
  }

  const terjawab = (daftar || []).filter((p) => {
    if (dilewati[p.key]) return true;
    if ((tulisTeks[p.key] || '').trim()) return true;
    const j = jawaban[p.key];
    if (Array.isArray(j)) return j.length > 0;
    return j !== undefined && j !== null && String(j).trim() !== '';
  }).length;

  function selesai() {
    const j = gabungTulisSendiri(jawaban);
    const catatan = j.catatan ? String(j.catatan) : '';
    onSelesai({ jawaban: j, catatan, daftarTanya: daftar || PERTANYAAN });
  }

  return (
    <div className="card">
      <style>{`
        .wg-blok { border-top: 2px dashed var(--ink); padding: 16px 0; }
        .wg-blok:first-of-type { border-top: 0; padding-top: 4px; }
        .wg-kepala { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; }
        .wg-nomor { flex: 0 0 auto; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
          background: var(--ink); color: var(--paper); font-weight: 800; font-size: 13px; }
        .wg-tanya { flex: 1; font-weight: 700; font-size: 15px; line-height: 1.5; margin: 2px 0 0; }
        .wg-lewati { flex: 0 0 auto; background: none; border: 0; padding: 4px 2px; cursor: pointer;
          font: inherit; font-size: 12px; font-weight: 700; color: var(--red); text-decoration: underline;
          text-underline-offset: 3px; }
        .wg-lewati:hover { opacity: .75; }
        .wg-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .wg-chip { font: inherit; font-size: 13px; font-weight: 600; line-height: 1.4; text-align: left;
          background: var(--paper-2); color: var(--ink); border: 2px solid var(--ink); border-radius: 999px;
          padding: 7px 14px; cursor: pointer; }
        .wg-chip:hover { background: var(--paper); }
        .wg-chip.aktif { background: var(--ink); color: var(--paper); }
        .wg-chip.wg-tulis { border-style: dashed; background: var(--paper); }
        .wg-chip.wg-tulis.aktif { background: var(--ink); color: var(--paper); border-style: solid; }
        .wg-chip:focus-visible, .wg-lewati:focus-visible { outline: 3px solid var(--red); outline-offset: 2px; }
        .wg-blok.dilewati .wg-kepala, .wg-blok.dilewati .wg-chip-row { opacity: .45; }
        .wg-status { display: inline-block; margin-top: 8px; font-size: 11px; font-weight: 800;
          text-transform: uppercase; letter-spacing: .8px; color: var(--paper-2); }
        .wg-status span { background: var(--ink); padding: 3px 10px; border-radius: 999px; }
        .wg-teks { width: 100%; font: inherit; font-size: 14px; line-height: 1.6; color: var(--ink);
          background: var(--paper-2); border: 2px solid var(--ink); padding: 10px 12px; min-height: 84px; resize: vertical; }
        .wg-teks:focus { outline: 3px solid var(--red); outline-offset: 1px; background: var(--paper); }
        .wg-skeleton { border: 2px solid var(--ink); background: var(--paper-2); margin-bottom: 12px; }
        .wg-kerangka { animation: wg-pulsa 1.2s ease-in-out infinite; }
        @keyframes wg-pulsa { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
        @media (prefers-reduced-motion: reduce) { .wg-kerangka { animation: none; } }
      `}</style>

      <span className="kicker">Kenali Guru</span>
      <h2 style={{ margin: '4px 0 2px' }}>Beberapa pertanyaan</h2>
      <p className="hint" style={{ margin: '0 0 4px' }}>
        Biar modul ajar lebih akurat. Jawab semua pertanyaan di bawah.
        {daftar && (
          <> <b>{terjawab}/{daftar.length} terjawab</b>{pakaiAI && ' · disesuaikan AI'}</>
        )}
      </p>

      {daftar === null ? (
        <div className="wg-kerangka" aria-label="Memuat pertanyaan" role="status">
          {[0, 1, 2].map((i) => (
            <div key={i} className="wg-skeleton" style={{ padding: 14 }}>
              <div style={{ height: 14, width: '70%', background: 'var(--ink)', opacity: .25, marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[0, 1, 2].map((j) => (
                  <div key={j} style={{ height: 30, width: 110, borderRadius: 999, background: 'var(--ink)', opacity: .15 }} />
                ))}
              </div>
            </div>
          ))}
          <p className="hint">AI sedang menyiapkan pertanyaan yang sesuai dengan konteks mengajar…</p>
        </div>
      ) : (
        <>
          {daftar.map((p, i) => {
            const lewati = !!dilewati[p.key];
            const j = jawaban[p.key];
            return (
              <div key={p.key} className={'wg-blok' + (lewati ? ' dilewati' : '')}>
                <div className="wg-kepala">
                  <span className="wg-nomor" aria-hidden="true">{i + 1}</span>
                  <p className="wg-tanya" id={'wg-tanya-' + p.key}>{p.tanya}</p>
                  <button
                    type="button" className="wg-lewati"
                    onClick={() => toggleLewati(p.key)}
                    aria-label={(lewati ? 'Batalkan lewati pertanyaan: ' : 'Lewati pertanyaan: ') + p.tanya}
                  >
                    {lewati ? 'Batalkan' : 'Lewati'}
                  </button>
                </div>

                {!lewati && p.tipe === 'teks' && (
                  <textarea
                    id={'wg-isi-' + p.key}
                    className="wg-teks"
                    aria-labelledby={'wg-tanya-' + p.key}
                    rows={3}
                    value={j || ''}
                    onChange={(e) => isiTeks(p.key, e.target.value)}
                    placeholder="Tulis jawaban di sini…"
                  />
                )}

                {!lewati && p.tipe !== 'teks' && (
                  <>
                    <div
                      className="wg-chip-row"
                      role={p.tipe === 'radio' ? 'radiogroup' : 'group'}
                      aria-labelledby={'wg-tanya-' + p.key}
                    >
                      {(p.opsi || []).map((o) => {
                        const aktif = p.tipe === 'radio' ? j === o : (j || []).includes(o);
                        return (
                          <button
                            key={o}
                            type="button"
                            className={'wg-chip' + (aktif ? ' aktif' : '')}
                            aria-pressed={aktif}
                            onClick={() => (p.tipe === 'radio' ? pilihRadio(p.key, o) : toggleCek(p.key, o))}
                          >
                            {o}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className={'wg-chip wg-tulis' + (tulisBuka[p.key] ? ' aktif' : '')}
                        aria-pressed={!!tulisBuka[p.key]}
                        aria-expanded={!!tulisBuka[p.key]}
                        onClick={() => {
                          setTulisBuka((s) => ({ ...s, [p.key]: !s[p.key] }));
                          setDilewati((s) => ({ ...s, [p.key]: false }));
                        }}
                      >
                        ✏️ Tulis sendiri
                      </button>
                    </div>
                    {tulisBuka[p.key] && (
                      <textarea
                        className="wg-teks"
                        rows={2}
                        style={{ marginTop: 8 }}
                        value={tulisTeks[p.key] || ''}
                        onChange={(e) => {
                          setTulisTeks((s) => ({ ...s, [p.key]: e.target.value }));
                          setDilewati((s) => ({ ...s, [p.key]: false }));
                        }}
                        placeholder={p.tipe === 'radio'
                          ? 'Tulis jawaban sendiri — menggantikan pilihan chip di atas…'
                          : 'Tulis jawaban sendiri — ditambahkan ke pilihan chip di atas…'}
                        aria-label={'Jawaban sendiri untuk: ' + p.tanya}
                      />
                    )}
                  </>
                )}

                {lewati && (
                  <div className="wg-status"><span>Dilewati</span></div>
                )}
              </div>
            );
          })}

          <div className="btn-row" style={{ marginTop: 20 }}>
            <button type="button" className="btn" onClick={onLewati}>
              ← Kembali
            </button>
            <button type="button" className="btn btn-primary" onClick={selesai}>
              Selesai — lanjutkan
            </button>
          </div>
        </>
      )}
    </div>
  );
}
