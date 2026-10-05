import { marked } from 'marked';
import { splitInfoUmum, extractTitle, buangJudulGanda, rapikanIdentitas } from '../lib/api';
import { ekstrakPengesahan, buangPengesahan } from '../lib/pengesahan';
import { DOC_TYPES } from '../lib/docs';
import Pengesahan from './Pengesahan';

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Render dokumen sebagai "kertas" rapi:
// - kepala dokumen + tabel Informasi Umum
// - isi markdown (termasuk tabel dan gambar inline)
// - galeri gambar referensi yang belum disisipkan di isi
// Prop `tema`: 'hangat' (bawaan) | 'resmi' | 'modern'. Mengatur class tema-*
export default function DocPaper({ doc, tema = 'hangat' }) {
  const judul = doc.judul || extractTitle(doc.markdown || '');
  const { infoRows, rest } = splitInfoUmum(rapikanIdentitas(doc.markdown || ''));
  const sah = ekstrakPengesahan(rest);
  const body = buangJudulGanda(sah ? buangPengesahan(rest) : rest, judul);
  const images = doc.images || [];
  const typeName = (DOC_TYPES[doc.docType] || {}).nama || 'Dokumen Ajar';

  const inlineUrls = new Set();
  const withFig = (body || '').replace(/!\[([^\]]*)\]\(fig:([^)]+)\)/g, (m, cap, raw) => {
    const [url, w] = raw.split('#w=');
    const dsize = parseInt(w, 10) || 560;
    inlineUrls.add(url);
    const g = images.find((x) => x.thumbUrl === url) || {};
    const caption = cap || g.caption || g.title || 'Gambar referensi';
    const credit = `Sumber: Wikimedia Commons${g.artist ? ', ' + g.artist : ''} (${g.license || 'CC'})`;
    return `<figure class="figure" style="max-width:${dsize}px;margin-left:auto;margin-right:auto"><img src="${esc(url)}" alt="${esc(caption)}" loading="lazy"/>`
      + `<figcaption><b>${esc(caption)}</b><div class="credit">${esc(credit)}</div></figcaption></figure>`;
  });
  const gallery = images.filter((g) => !inlineUrls.has(g.thumbUrl));

  return (
    <div className={'paper tema-' + tema}>
      <div className="paper-head">
        <div className="doclabel">{typeName} &middot; Kurikulum Merdeka</div>
        <h1>{judul}</h1>
        {infoRows.length > 0 && (
          <table className="info-table">
            <tbody>
              {infoRows.map(([k, v], i) => (
                <tr key={i}><th>{k}</th><td>{v || '-'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(withFig) }} />

      {gallery.length > 0 && (
        <>
          <div className="md"><h2>Gambar Referensi</h2></div>
          {gallery.map((g, i) => (
            <figure className="figure" key={i}>
              <img src={g.thumbUrl} alt={g.caption || g.title} loading="lazy" />
              <figcaption>
                <b>Gambar {i + 1}. {g.caption || g.title}</b>
                <div className="credit">
                  Sumber: Wikimedia Commons{g.artist ? ', ' + g.artist : ''} ({g.license || 'CC'})
                  {' '}<a href={g.pageUrl} target="_blank" rel="noreferrer">lihat lisensi</a>
                </div>
              </figcaption>
            </figure>
          ))}
        </>
      )}

      {sah && <Pengesahan data={sah} />}
    </div>
  );
}
