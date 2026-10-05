import { JENJANG, FASE, MAPEL } from '../lib/referensi';
import { SEMESTER } from '../lib/docs';

// FormulirDasar: field identitas pembelajaran yang SAMA di semua jalur
// generate (Wizard, Generator Paket, Ruang Perencanaan, form proyek).
// Urutan, label, placeholder, dan perilaku (ganti jenjang me-reset fase
// dan mapel) selalu sama; yang beda hanya field mana yang ditampilkan.
//
// Props:
//   nilai  : object nilai form
//   onUbah : (patch) => void, digabung ke nilai
//   fields : array key yang ditampilkan, sesuai urutan FIELD_DASAR_SEMUA
//   wajib  : array key yang ditandai wajib (*)
//   galat  : { key: pesan } untuk error validasi per field
//   prefix : awalan id agar label terhubung unik bila dipakai >1x per halaman
export const FIELD_DASAR_SEMUA = [
  'nama', 'nip', 'sekolah', 'tahunAjaran',
  'jenjang', 'fase', 'kelas', 'semester', 'mapel',
];

const TEKS = {
  nama: { label: 'Nama Guru', ph: 'cth: Alfaruq Asri, S.Pd.' },
  nip: { label: 'NIP Guru', ph: 'cth: 198001012005011001', hint: 'Opsional. Tercetak di Lembar Pengesahan bila diisi.' },
  sekolah: { label: 'Sekolah', ph: 'cth: SMAN Modal Bangsa' },
  tahunAjaran: { label: 'Tahun Ajaran', ph: 'cth: 2026/2027' },
  kelas: { label: 'Kelas', ph: 'cth: 7' },
};

export default function FormulirDasar({ nilai = {}, onUbah, fields = FIELD_DASAR_SEMUA, wajib = [], galat = {}, prefix = 'fd' }) {
  const wajibSet = new Set(wajib);
  const ubah = (patch) => onUbah({ ...patch });
  const labelUntuk = (k, teks) => (
    <label htmlFor={`${prefix}-${k}`}>
      {teks}{wajibSet.has(k) && <span className="req" aria-hidden="true"> *</span>}
    </label>
  );
  const errUntuk = (k) => galat[k] && <p className="err">{galat[k]}</p>;

  return (
    <>
      {fields.map((k) => {
        const v = nilai[k] ?? '';
        if (TEKS[k]) {
          const t = TEKS[k];
          return (
            <div className="field" key={k}>
              {labelUntuk(k, t.label)}
              <input
                id={`${prefix}-${k}`}
                value={v}
                onChange={(e) => ubah({ [k]: e.target.value })}
                placeholder={t.ph}
                aria-describedby={t.hint ? `${prefix}-${k}-hint` : undefined}
              />
              {t.hint && <p className="hint" id={`${prefix}-${k}-hint`}>{t.hint}</p>}
              {errUntuk(k)}
            </div>
          );
        }
        if (k === 'jenjang') {
          return (
            <div className="field" key={k}>
              {labelUntuk(k, 'Jenjang')}
              <select
                id={`${prefix}-${k}`}
                value={v}
                onChange={(e) => ubah({ jenjang: e.target.value, fase: (FASE[e.target.value] || [])[0] || '', mapel: '' })}
              >
                {JENJANG.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>
              {errUntuk(k)}
            </div>
          );
        }
        if (k === 'fase') {
          return (
            <div className="field" key={k}>
              {labelUntuk(k, 'Fase')}
              <select id={`${prefix}-${k}`} value={v} onChange={(e) => ubah({ fase: e.target.value })}>
                {(FASE[nilai.jenjang] || []).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              {errUntuk(k)}
            </div>
          );
        }
        if (k === 'semester') {
          return (
            <div className="field" key={k}>
              {labelUntuk(k, 'Semester')}
              <select id={`${prefix}-${k}`} value={v} onChange={(e) => ubah({ semester: e.target.value })}>
                {SEMESTER.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {errUntuk(k)}
            </div>
          );
        }
        if (k === 'mapel') {
          return (
            <div className="field" key={k}>
              {labelUntuk(k, 'Mata Pelajaran')}
              <select
                id={`${prefix}-${k}`}
                value={v}
                onChange={(e) => ubah({ mapel: e.target.value })}
              >
                <option value="">Pilih</option>
                {(MAPEL[nilai.jenjang] || []).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {errUntuk(k)}
            </div>
          );
        }
        return null;
      })}
    </>
  );
}
