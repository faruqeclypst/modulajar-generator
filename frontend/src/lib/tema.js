// Pilihan tema tampilan dokumen. Tema memengaruhi pratinjau (DocPaper),
// ekspor Word (docxExport), dan cetak/PDF (CSS print). Pilihan disimpan
// per perangkat di localStorage, bukan di data dokumen.
export const TEMA_DOKUMEN = [
  { key: 'hangat', nama: 'Kertas Hangat', desc: 'Tampilan bawaan yang hangat' },
  { key: 'resmi', nama: 'Resmi', desc: 'Formal, siap diserahkan ke sekolah' },
  { key: 'modern', nama: 'Modern', desc: 'Bersih untuk dibaca di layar' },
];

const LS_KEY = 'ma-tema-dokumen';
const VALID = new Set(TEMA_DOKUMEN.map((t) => t.key));

export function bacaTemaDokumen() {
  try {
    const v = localStorage.getItem(LS_KEY);
    return VALID.has(v) ? v : 'hangat';
  } catch {
    return 'hangat';
  }
}

export function simpanTemaDokumen(tema) {
  if (!VALID.has(tema)) return;
  try {
    localStorage.setItem(LS_KEY, tema);
  } catch {
    /* penyimpanan tidak tersedia, abaikan */
  }
}
