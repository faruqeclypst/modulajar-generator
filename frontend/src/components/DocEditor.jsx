import { useEffect, useRef, useState } from 'react';
import { mdToBlocks, blocksToMd, figToImage, BLOCK_LABEL } from '../lib/blocks';
import { regenBlock } from '../lib/api';
import ImagePicker from './ImagePicker';

let uid = 1;
const nid = () => 'n' + (uid++) + Date.now().toString(36);

function AutoTA({ value, onChange, className, placeholder }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }, [value]);
  return <textarea ref={ref} className={className} value={value} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)} rows={1} />;
}

const BTN = ({ title, onClick, children, danger }) => (
  <button className={'blk-btn' + (danger ? ' danger' : '')} title={title} onClick={(e) => { e.stopPropagation(); onClick(); }}>
    {children}
  </button>
);

// Jumlahkan alokasi "(X menit)" pada item list -> tampilkan total di bilah blok
function sumMenit(items) {
  let total = 0, found = false;
  for (const it of items || []) {
    const m = String(it.text || '').match(/(\d+)\s*menit/i);
    if (m) { total += parseInt(m[1], 10); found = true; }
  }
  return found ? total : null;
}

export default function DocEditor({ initialMarkdown, images = [], docType, docTitle, topic, onChange }) {
  const [blocks, setBlocks] = useState(() => mdToBlocks(initialMarkdown, images));
  const [regenId, setRegenId] = useState(null);
  const [regenErr, setRegenErr] = useState('');
  const [addAt, setAddAt] = useState(null); // index tempat menu tambah blok terbuka
  const [imgAt, setImgAt] = useState(null); // index tempat panel sisip gambar terbuka

  // sinkron ke parent
  useEffect(() => {
    const md = blocksToMd(blocks);
    const imgs = blocks.filter((b) => b.type === 'fig').map(figToImage);
    onChange(md, imgs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  const update = (id, patch) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  function move(id, dir) {
    setBlocks((bs) => {
      const ix = bs.findIndex((b) => b.id === id);
      const jx = ix + dir;
      if (ix < 0 || jx < 0 || jx >= bs.length) return bs;
      const n = [...bs];
      [n[ix], n[jx]] = [n[jx], n[ix]];
      return n;
    });
  }

  function remove(id) {
    if (!confirm('Hapus blok ini?')) return;
    setBlocks((bs) => bs.filter((b) => b.id !== id));
  }

  function addBlock(type, at) {
    const base = { id: nid(), type };
    const nb = type === 'p' ? { ...base, text: 'Tulis paragraf baru…' }
      : type === 'ul' ? { ...base, items: [{ depth: 0, text: 'Item baru' }] }
      : type === 'ol' ? { ...base, items: [{ depth: 0, text: 'Item baru' }] }
      : type === 'table' ? { ...base, rows: [['Kolom 1', 'Kolom 2'], ['', '']] }
      : type === 'hr' ? base
      : { ...base, text: 'Heading baru' };
    setBlocks((bs) => { const n = [...bs]; n.splice(at, 0, nb); return n; });
    setAddAt(null);
  }

  function addFigBlocks(imgs, at) {
    const nbs = imgs.map((g) => ({
      id: nid(), type: 'fig',
      title: g.title, thumbUrl: g.thumbUrl, fullUrl: g.fullUrl,
      width: g.width, height: g.height, caption: g.caption || g.title,
      artist: g.artist, license: g.license, pageUrl: g.pageUrl, dsize: 560,
    }));
    setBlocks((bs) => { const n = [...bs]; n.splice(at, 0, ...nbs); return n; });
    setImgAt(null);
    setAddAt(null);
  }

  function pickBlock(type, at) {
    if (type === 'fig') { setImgAt(at); setAddAt(null); return; }
    addBlock(type, at);
  }

  async function regen(b) {
    setRegenErr('');
    setRegenId(b.id);
    try {
      let src = '';
      if (['title', 'h2', 'h3', 'h4', 'p'].includes(b.type)) src = b.text;
      else if (['ul', 'ol', 'ol-alpha'].includes(b.type)) src = b.items.map((it) => '- ' + it.text).join('\n');
      else return;
      const out = await regenBlock(docType, BLOCK_LABEL[b.type], src, docTitle, topic);
      if (['title', 'h2', 'h3', 'h4', 'p'].includes(b.type)) update(b.id, { text: out });
      else {
        const items = out.split('\n').map((l) => l.replace(/^(\s*[-*\d.)a-z]+\s+)/, '').trim()).filter(Boolean)
          .map((t) => ({ depth: 0, text: t }));
        if (items.length) update(b.id, { items });
      }
    } catch (e) {
      setRegenErr(e.message);
    } finally {
      setRegenId(null);
    }
  }

  const canRegen = (t) => ['title', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'ol-alpha'].includes(t);

  function renderBlock(b) {
    const busy = regenId === b.id;
    switch (b.type) {
      case 'title': return <AutoTA className="blk-edit blk-title" value={b.text} onChange={(v) => update(b.id, { text: v })} />;
      case 'h2': return <AutoTA className="blk-edit blk-h2" value={b.text} onChange={(v) => update(b.id, { text: v })} />;
      case 'h3': return <AutoTA className="blk-edit blk-h3" value={b.text} onChange={(v) => update(b.id, { text: v })} />;
      case 'h4': return <AutoTA className="blk-edit blk-h4" value={b.text} onChange={(v) => update(b.id, { text: v })} />;
      case 'p': return <AutoTA className="blk-edit blk-p" value={b.text} onChange={(v) => update(b.id, { text: v })} />;
      case 'hr': return <hr className="blk-hr" />;
      case 'ul': case 'ol': case 'ol-alpha': {
        const val = b.items.map((it) => '  '.repeat(it.depth) + it.text).join('\n');
        return <AutoTA className="blk-edit blk-list" value={val} onChange={(v) => {
          const items = v.split('\n').filter((l) => l.trim()).map((l) => {
            const m = l.match(/^(\s*)/);
            return { depth: Math.min(2, Math.floor(m[1].length / 2)), text: l.trim() };
          });
          update(b.id, { items });
        }} />;
      }
      case 'table': {
        const setCell = (ri, ci, v) => {
          const rows = b.rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r));
          update(b.id, { rows });
        };
        const addRow = () => update(b.id, { rows: [...b.rows, b.rows[0].map(() => '')] });
        return (
          <div>
            <table className="blk-table">
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri} className={ri === 0 ? 'head' : ''}>
                    {r.map((c, ci) => (
                      <td key={ci}><input value={c} onChange={(e) => setCell(ri, ci, e.target.value)} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => addRow()}>+ Baris</button>
          </div>
        );
      }
      case 'fig': {
        const SIZES = [[360, 'Kecil'], [560, 'Sedang'], [760, 'Besar']];
        return (
          <figure className="figure" style={{ margin: 0, maxWidth: (b.dsize || 560) + 'px' }}>
            <img src={b.thumbUrl} alt={b.caption || b.title} />
            <figcaption>
              <AutoTA className="blk-edit" value={b.caption || ''} placeholder="Keterangan gambar…"
                onChange={(v) => update(b.id, { caption: v })} />
              <div className="credit">Sumber: Wikimedia Commons{b.artist ? ', ' + b.artist : ''} ({b.license || 'CC'})</div>
              <div className="fig-size">
                <span>Ukuran:</span>
                {SIZES.map(([w, label]) => (
                  <button key={w} className={'btn btn-sm' + ((b.dsize || 560) === w ? ' btn-ink' : '')}
                    onClick={() => update(b.id, { dsize: w })}>{label}</button>
                ))}
              </div>
            </figcaption>
          </figure>
        );
      }
      case 'img':
        return (
          <figure className="figure" style={{ margin: 0 }}>
            <img src={b.url} alt={b.caption} />
            <figcaption><AutoTA className="blk-edit" value={b.caption || ''} onChange={(v) => update(b.id, { caption: v })} /></figcaption>
          </figure>
        );
      default: return null;
    }
  }

  return (
    <div className="doceditor">
      {regenErr && <div className="alert alert-error">{regenErr}</div>}
      <div className="blk-add-row">
        <button className="btn btn-sm" onClick={() => { setAddAt(addAt === 0 ? null : 0); setImgAt(null); }}>+ Tambah blok di atas</button>
        {addAt === 0 && <AddMenu onPick={(t) => pickBlock(t, 0)} />}
      </div>
      {imgAt === 0 && <ImgInsertPanel picked={images} query={topic} onInsert={(imgs) => addFigBlocks(imgs, 0)} onCancel={() => setImgAt(null)} />}
      {blocks.map((b, ix) => (
        <div key={b.id}>
          <div className={'blk blk-' + b.type + (regenId === b.id ? ' busy' : '')}>
            <div className="blk-bar">
              <span className="blk-tag">{BLOCK_LABEL[b.type] || b.type}</span>
              {['ul', 'ol', 'ol-alpha'].includes(b.type) && sumMenit(b.items) != null && (
                <span className="blk-total" title="Total alokasi waktu langkah-langkah ini">Σ {sumMenit(b.items)} mnt</span>
              )}
              <span className="blk-tools">
                <BTN title="Pindah ke atas" onClick={() => move(b.id, -1)}>↑</BTN>
                <BTN title="Pindah ke bawah" onClick={() => move(b.id, 1)}>↓</BTN>
                {canRegen(b.type) && (
                  <BTN title="Tulis ulang blok ini dengan AI" onClick={() => regen(b)}>
                    {regenId === b.id ? '…' : 'AI'}
                  </BTN>
                )}
                <BTN title="Hapus blok" danger onClick={() => remove(b.id)}>×</BTN>
              </span>
            </div>
            <div className="blk-body">{renderBlock(b)}</div>
          </div>
          <div className="blk-add-row">
            <button className="blk-add-btn" title="Tambah blok di sini" onClick={() => { setAddAt(addAt === ix + 1 ? null : ix + 1); setImgAt(null); }}>+</button>
            {addAt === ix + 1 && <AddMenu onPick={(t) => pickBlock(t, ix + 1)} />}
          </div>
          {imgAt === ix + 1 && <ImgInsertPanel picked={images} query={topic} onInsert={(imgs) => addFigBlocks(imgs, ix + 1)} onCancel={() => setImgAt(null)} />}
        </div>
      ))}
      {blocks.length === 0 && <div className="alert alert-info">Dokumen kosong. Tambahkan blok untuk mulai menulis.</div>}
    </div>
  );
}

function AddMenu({ onPick }) {
  const items = [
    ['p', 'Paragraf'], ['h2', 'Heading 2'], ['h3', 'Heading 3'],
    ['ul', 'Bullet list'], ['ol', 'Numbering'], ['table', 'Tabel'], ['hr', 'Pemisah'],
    ['fig', 'Gambar'],
  ];
  return (
    <div className="blk-addmenu">
      {items.map(([t, l]) => (
        <button key={t} className="btn btn-sm" onClick={() => onPick(t)}>{l}</button>
      ))}
    </div>
  );
}

// Panel sisip gambar di posisi tertentu: pakai yang sudah dipilih, atau cari baru
function ImgInsertPanel({ picked = [], query, onInsert, onCancel }) {
  const [fresh, setFresh] = useState([]);
  const available = picked.filter((p) => p.thumbUrl);

  return (
    <div className="card" style={{ margin: '8px 0', background: '#fbf9f4' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ flex: 1 }}>Sisipkan Gambar di Sini</strong>
        <button className="btn btn-sm" onClick={onCancel}>Tutup</button>
      </div>
      {available.length > 0 && (
        <>
          <div className="hint" style={{ marginBottom: 8 }}>Klik untuk langsung sisipkan:</div>
          <div className="thumbstrip" style={{ marginBottom: 12 }}>
            {available.map((g) => (
              <img key={g.thumbUrl} src={g.thumbUrl} alt={g.caption || g.title}
                title={g.caption || g.title} loading="lazy"
                style={{ cursor: 'pointer' }} onClick={() => onInsert([g])} />
            ))}
          </div>
        </>
      )}
      <div className="hint" style={{ marginBottom: 8 }}>Atau cari gambar baru dari Wikimedia Commons:</div>
      <ImagePicker query={query} initial={[]} onChange={setFresh} max={3} />
      {fresh.length > 0 && (
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn btn-sm btn-primary" onClick={() => onInsert(fresh)}>
            Sisipkan {fresh.length} Gambar di Sini
          </button>
        </div>
      )}
    </div>
  );
}
