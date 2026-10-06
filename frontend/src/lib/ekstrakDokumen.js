import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const BATAS_BYTE = 15 * 1024 * 1024;
const MAKS_HALAMAN = 60;

// Ekstrak teks dari file yang diunggah guru (PDF/DOCX/TXT/MD/XLSX/XLS),
// hasilnya dipakai sebagai materi sumber / teks acuan untuk AI.
export async function ekstrakTeks(file) {
  if (!file) throw new Error('Tidak ada file yang dipilih.');
  if (file.size > BATAS_BYTE) throw new Error('Ukuran file maksimal 15 MB.');
  const nama = (file.name || '').toLowerCase();

  if (nama.endsWith('.txt') || nama.endsWith('.md') || nama.endsWith('.markdown')) {
    return await file.text();
  }
  if (nama.endsWith('.docx')) {
    const buf = await file.arrayBuffer();
    const hasil = await mammoth.extractRawText({ arrayBuffer: buf });
    return hasil.value || '';
  }
  if (nama.endsWith('.xlsx') || nama.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const bagian = [];
    for (const nmSheet of wb.SheetNames) {
      const ws = wb.Sheets[nmSheet];
      const teks = XLSX.utils.sheet_to_txt(ws).trim();
      if (teks) bagian.push(`[Sheet: ${nmSheet}]\n${teks}`);
    }
    return bagian.join('\n\n');
  }
  if (nama.endsWith('.pdf')) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const bagian = [];
    const n = Math.min(pdf.numPages, MAKS_HALAMAN);
    for (let i = 1; i <= n; i++) {
      const halaman = await pdf.getPage(i);
      const konten = await halaman.getTextContent();
      bagian.push(konten.items.map((it) => it.str || '').join(' '));
    }
    await pdf.destroy();
    return bagian.join('\n\n');
  }
  throw new Error('Format belum didukung. Unggah PDF, DOCX, XLSX, atau TXT.');
}
