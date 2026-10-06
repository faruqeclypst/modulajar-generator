import { useState } from 'react';

// Wawancara Guru: gali persona & tipe guru sebelum AI menyusun modul.
// Seperti PRD — AI perlu paham siapa gurunya agar modul sesuai gaya & konteks.
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
    tanya: 'Fasilitas apa yang tersedia di kelas? (boleh pilih lebih dari satu)',
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
];

export function kompilasiPersona(jawaban, catatan) {
  const bagian = [];
  const label = {
    gaya: 'Gaya mengajar', siswa: 'Karakteristik siswa',
    fasilitas: 'Fasilitas', preferensi: 'Preferensi modul',
    pengalaman: 'Pengalaman mengajar',
  };
  for (const p of PERTANYAAN) {
    const j = jawaban[p.key];
    if (!j || (Array.isArray(j) && !j.length)) continue;
    const v = Array.isArray(j) ? j.join(', ') : j;
    bagian.push(`- ${label[p.key]}: ${v}`);
  }
  if (catatan?.trim()) bagian.push(`- Catatan khusus: ${catatan.trim()}`);
  if (!bagian.length) return '';
  return `PROFIL GURU (sesuaikan nada, detail, dan aktivitas modul dengan profil ini):\n${bagian.join('\n')}`;
}

// Versi ramah pengguna untuk ringkasan di UI (tanpa instruksi prompt).
export function ringkasanPersona(jawaban, catatan) {
  const label = {
    gayaMengajar: 'Gaya mengajar', karakteristikSiswa: 'Karakteristik siswa',
    fasilitas: 'Fasilitas kelas', preferensiModul: 'Preferensi modul',
    pengalaman: 'Pengalaman mengajar',
  };
  const baris = [];
  for (const [k, v] of Object.entries(jawaban || {})) {
    if (v && String(v).trim()) baris.push(`- ${label[k] || k}: ${String(v).trim()}`);
  }
  if (catatan?.trim()) baris.push(`- Catatan khusus: ${catatan.trim()}`);
  return baris.join('\n');
}

export default function WawancaraGuru({ awal, onSelesai, onLewati }) {
  const [jawaban, setJawaban] = useState(awal?.jawaban || {});
  const [catatan, setCatatan] = useState(awal?.catatan || '');
  const [step, setStep] = useState(0);

  function pilih(key, val) {
    setJawaban((prev) => ({ ...prev, [key]: val }));
  }
  function toggleCek(key, val) {
    setJawaban((prev) => {
      const arr = prev[key] || [];
      const ada = arr.includes(val);
      return { ...prev, [key]: ada ? arr.filter((x) => x !== val) : [...arr, val] };
    });
  }

  const p = PERTANYAAN[step];
  const terakhir = step === PERTANYAAN.length;
  const bisaLanjut = terakhir || jawaban[p.key]?.length > 0;

  return (
    <div className="card">
      <span className="kicker">Kenali Guru {step + 1}/{PERTANYAAN.length + 1}</span>
      <h2 style={{ margin: '4px 0 8px' }}>
        {terakhir ? 'Ada hal lain yang perlu AI tahu?' : p.tanya}
      </h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Jawaban ini membentuk persona guru — AI menyesuaikan gaya bahasa, tingkat detail,
        dan jenis aktivitas modul. Semakin jujur, semakin pas hasilnya.
      </p>

      {!terakhir && p.tipe === 'radio' && (
        <div role="radiogroup" aria-label={p.tanya}>
          {p.opsi.map((o) => (
            <label key={o} className={'opsi-kartu' + (jawaban[p.key] === o ? ' aktif' : '')}>
              <input
                type="radio" name={p.key} checked={jawaban[p.key] === o}
                onChange={() => pilih(p.key, o)}
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
      )}

      {!terakhir && p.tipe === 'cek' && (
        <div>
          {p.opsi.map((o) => (
            <label key={o} className={'opsi-kartu' + ((jawaban[p.key] || []).includes(o) ? ' aktif' : '')}>
              <input
                type="checkbox" checked={(jawaban[p.key] || []).includes(o)}
                onChange={() => toggleCek(p.key, o)}
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
      )}

      {terakhir && (
        <div className="field">
          <label htmlFor="catatan-guru">Catatan khusus (opsional)</label>
          <textarea
            id="catatan-guru" rows={4}
            value={catatan} onChange={(e) => setCatatan(e.target.value)}
            placeholder="Contoh: siswa saya suka belajar sambil praktik di luar kelas; saya kurang nyaman dengan teknologi; dst."
          />
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 16 }}>
        {step > 0 && (
          <button type="button" className="btn" onClick={() => setStep(step - 1)}>
            Kembali
          </button>
        )}
        <button type="button" className="btn" onClick={onLewati}>
          Lewati semua
        </button>
        {!terakhir ? (
          <button
            type="button" className="btn btn-primary"
            onClick={() => setStep(step + 1)} disabled={!bisaLanjut}
          >
            Lanjut
          </button>
        ) : (
          <button
            type="button" className="btn btn-primary"
            onClick={() => onSelesai({ jawaban, catatan })}
          >
            Selesai — mulai atur topik
          </button>
        )}
      </div>

      {terakhir && Object.keys(jawaban).length > 0 && (
        <div className="card" style={{ marginTop: 16, background: 'var(--paper-2)' }}>
          <b>Ringkasan persona:</b>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: '8px 0 0' }}>
            {ringkasanPersona(jawaban, catatan)}
          </pre>
        </div>
      )}
    </div>
  );
}
