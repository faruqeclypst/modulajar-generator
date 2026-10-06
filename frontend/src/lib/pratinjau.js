import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import DocPaper from '../components/DocPaper';

// Stylesheet mandiri untuk tab pratinjau (gaya Warm Paper, ringkas).
const CSS_PRATINJAU = `
*{box-sizing:border-box}
body{margin:0;background:#e8e2d4;font-family:Archivo,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;line-height:1.7}
.pratinjau-bar{background:#1a1a1a;color:#f4f1e8;padding:10px 20px;font-size:13px;font-weight:700;letter-spacing:1px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:10}
.pratinjau-bar button{background:#B5362A;color:#fff;border:none;font:inherit;font-weight:800;padding:8px 16px;cursor:pointer}
.paper{max-width:820px;margin:28px auto;background:#faf7ef;padding:56px 60px;box-shadow:0 4px 24px rgba(0,0,0,.18);border:1px solid #d8d0ba}
@media(max-width:640px){.paper{padding:28px 20px;margin:12px}}
.paper-head{border-bottom:3px solid #1a1a1a;padding-bottom:20px;margin-bottom:28px}
.doclabel{font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#B5362A;margin-bottom:8px}
.paper-head h1{font-size:30px;line-height:1.25;margin:0 0 6px;letter-spacing:-.5px}
.info-table{width:100%;border-collapse:collapse;margin:18px 0;font-size:14px}
.info-table th,.info-table td{border:1px solid #c9c0a6;padding:8px 12px;text-align:left;vertical-align:top}
.info-table th{background:#f0ebdb;width:32%;font-weight:800}
.md h2{font-size:22px;margin:32px 0 12px;letter-spacing:-.3px;border-bottom:2px solid #1a1a1a;padding-bottom:6px}
.md h3{font-size:18px;margin:26px 0 10px}
.md h4{font-size:16px;margin:20px 0 8px}
.md p{margin:0 0 14px;text-align:justify}
.md ul,.md ol{margin:0 0 14px;padding-left:26px}
.md li{margin-bottom:6px}
.md table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
.md th,.md td{border:1px solid #c9c0a6;padding:8px 10px;text-align:left}
.md th{background:#f0ebdb;font-weight:800}
.md blockquote{border-left:4px solid #B5362A;margin:16px 0;padding:8px 16px;background:#f4efe0;font-style:italic}
.md hr{border:none;border-top:2px solid #c9c0a6;margin:28px 0}
.md strong{font-weight:800}
.figure{margin:22px 0;text-align:center}
.figure img{max-width:100%;height:auto;border:1px solid #c9c0a6}
.figure figcaption{font-size:13px;margin-top:8px}
.figure .credit{color:#6b6250;font-size:12px}
.pengesahan{margin-top:48px;page-break-before:always}
.sah-judul{text-align:center;font-size:20px;letter-spacing:2px;margin-bottom:24px}
.ttd-wrap{display:flex;gap:40px;justify-content:space-between;margin-top:16px}
.ttd-col{flex:1;text-align:center}
.ttd-ruang{height:90px}
.ttd-nama{font-weight:800;text-decoration:underline;margin:0}
.ttd-nip{margin:4px 0 0;font-size:14px}
@media print{.pratinjau-bar{display:none}.paper{box-shadow:none;margin:0;max-width:none}}
`;

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Buka pratinjau dokumen di tab baru (untuk layar kecil / Android).
// me-render DocPaper yang sama seperti di aplikasi, dibungkus HTML mandiri.
export function bukaPratinjauBaru({ judul, markdown, images = [], docType = 'modul' }) {
  const html = renderToStaticMarkup(
    React.createElement(DocPaper, { doc: { judul, markdown, images, docType }, tema: 'hangat' })
  );
  const page = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/>`
    + `<meta name="viewport" content="width=device-width, initial-scale=1"/>`
    + `<title>Pratinjau — ${esc(judul) || 'Dokumen'}</title>`
    + `<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;700;800&display=swap" rel="stylesheet"/>`
    + `<style>${CSS_PRATINJAU}</style></head><body>`
    + `<div class="pratinjau-bar"><span>PRATINJAU DOKUMEN</span>`
    + `<button onclick="window.print()">Cetak / Simpan PDF</button></div>`
    + html
    + `</body></html>`;
  const blob = new Blob([page], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener');
  if (!w) {
    // popup diblokir: unduh sebagai file
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pratinjau-dokumen.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
