import { useEffect, useRef, useState } from 'react';
import './DocEditor.css';
import { mdToBlocks, blocksToMd, figToImage, BLOCK_LABEL } from '../lib/blocks';
import { regenBlock } from '../lib/api';
import { bukaPratinjauBaru } from '../lib/pratinjau';
import DocPaper from './DocPaper';
import ImagePicker from './ImagePicker';

let uid = 1;
const nid = () => 'n' + (uid++) + Date.now().toString(36);

function AutoTA({ value, onChange, className, placeholder, onKeyDown }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      rows={1}
    />
  );
}

// Jumlahkan alokasi "(X menit)" pada item list -> tampilkan total di bilah blok
function sumMenit(items) {
  let total = 0, found = false;
  for (const it of items || []) {
    const m = String(it.text || '').match(/(\d+)\s*menit/i);
    if (m) { total += parseInt(m[1], 10); found = true; }
  }
  return found ? total : null;
}

const TEXT_TYPES = ['title', 'h2', 'h3', 'h4', 'p'];
const LIST_TYPES = ['ul', 'ol', 'ol-alpha'];

const ADD_ITEMS = [
  ['p', 'Paragraf', 'Tulis teks biasa'],
  ['h2', 'Heading 2', 'Judul bagian besar'],
  ['h3', 'Heading 3', 'Judul bagian kecil'],
  ['ul', 'Bullet list', 'Daftar poin-poin'],
  ['ol', 'Numbering', 'Daftar bernomor'],
  ['table', 'Tabel', 'Baris dan kolom'],
  ['fig', 'Gambar', 'Cari di Wikimedia Commons'],
  ['hr', 'Pemisah', 'Garis horizontal'],
];

const SLASH_ITEMS = [
  ['p', 'Paragraf'],
  ['h2', 'Heading 2'],
  ['h3', 'Heading 3'],
  ['ul', 'Bullet list'],
  ['ol', 'Numbering'],
  ['hr', 'Pemisah'],
];

export default function DocEditor({ initialMarkdown, images = [], docType, docTitle, topic, onChange }) {
  const [blocks, setBlocks] = useState(() => mdToBlocks(initialMarkdown, images));
  const [regenId, setRegenId] = useState(null);
  const [regenErr, setRegenErr] = useState('');
  const [instruksiId, setInstruksiId] = useState(null); // blok yang sedang diberi perintah AI
  const [instruksiTeks, setInstruksiTeks] = useState('');
  const [menu, setMenu] = useState(null); // { id, kind: 'add' | 'block' }
  const [imgAt, setImgAt] = useState(null); // index tempat panel sisip gambar terbuka
  const [slashId, setSlashId] = useState(null); // id blok teks yang menu "/" nya terbuka
  const [pratinjau, setPratinjau] = useState(false); // mode pratinjau side-by-side
  const rowRefs = useRef({});

  const mdPratinjau = blocksToMd(blocks);
  const imgsPratinjau = blocks.filter((b) => b.type === 'fig').map(figToImage);

  function togglePratinjau() {
    // Layar kecil (HP/Android): buka pratinjau di tab baru. Layar lebar: side-by-side.
    if (!pratinjau && window.matchMedia('(max-width: 900px)').matches) {
      bukaPratinjauBaru({ judul: docTitle, markdown: mdPratinjau, images: imgsPratinjau, docType });
      return;
    }
    setPratinjau((v) => !v);
  }

  // sinkron ke parent
  useEffect(() => {
    const md = blocksToMd(blocks);
    const imgs = blocks.filter((b) => b.type === 'fig').map(figToImage);
    onChange(md, imgs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  // tutup menu saat klik di luar / tekan Escape
  useEffect(() => {
    if (!menu && !slashId && imgAt == null) return;
    const onDown = (e) => {
      if (e.target.closest('[data-nmenu]') || e.target.closest('[data-ntrigger]')) return;
      setMenu(null);
      setSlashId(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setMenu(null); setSlashId(null); setImgAt(null); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu, slashId, imgAt]);

  const update = (id, patch) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  function focusBlock(id) {
    requestAnimationFrame(() => {
      const el = rowRefs.current[id] && rowRefs.current[id].querySelector('textarea, input');
      if (el) {
        el.focus();
        const n = (el.value || '').length;
        try { el.setSelectionRange(n, n); } catch { /* abaikan */ }
      }
    });
  }

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
    const nb = type === 'p' ? { ...base, text: '' }
      : type === 'ul' ? { ...base, items: [{ depth: 0, text: '' }] }
      : type === 'ol' ? { ...base, items: [{ depth: 0, text: '' }] }
      : type === 'table' ? { ...base, rows: [['Kolom 1', 'Kolom 2'], ['', '']] }
      : type === 'hr' ? base
      : { ...base, text: '' };
    setBlocks((bs) => { const n = [...bs]; n.splice(at, 0, nb); return n; });
    setMenu(null);
    focusBlock(nb.id);
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
    setMenu(null);
  }

  function pickBlock(type, at) {
    if (type === 'fig') { setImgAt(at); setMenu(null); return; }
    addBlock(type, at);
  }

  function toggleMenu(id, kind) {
    setMenu((m) => (m && m.id === id && m.kind === kind ? null : { id, kind }));
  }

  // ketik "/" di awal blok teks -> tawarkan ganti jenis blok
  function onText(id, v) {
    update(id, { text: v });
    if (v.charAt(0) === '/') { if (slashId !== id) setSlashId(id); }
    else if (slashId === id) setSlashId(null);
  }

  function convertBlock(id, to) {
    setBlocks((bs) => bs.map((b) => {
      if (b.id !== id) return b;
      const text = String(b.text || '').replace(/^\//, '');
      if (to === 'hr') return { id: b.id, type: 'hr' };
      if (to === 'ul' || to === 'ol') {
        const items = text.split('\n').map((t) => ({ depth: 0, text: t.trim() })).filter((it) => it.text);
        return { id: b.id, type: to, items: items.length ? items : [{ depth: 0, text: '' }] };
      }
      return { id: b.id, type: to, text };
    }));
    setSlashId(null);
    focusBlock(id);
  }

  async function regen(b, instruksi = '') {
    setRegenErr('');
    setRegenId(b.id);
    try {
      let src = '';
      if (TEXT_TYPES.includes(b.type)) src = b.text;
      else if (LIST_TYPES.includes(b.type)) src = b.items.map((it) => '- ' + it.text).join('\n');
      else return;
      const out = await regenBlock(docType, BLOCK_LABEL[b.type], src, docTitle, topic, instruksi);
      if (TEXT_TYPES.includes(b.type)) update(b.id, { text: out });
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

  const canRegen = (t) => [...TEXT_TYPES, ...LIST_TYPES].includes(t);

  function textProps(b) {
    return {
      value: b.text,
      onChange: (v) => onText(b.id, v),
      onKeyDown: (e) => {
        if (e.key === 'Escape' && slashId === b.id) { setSlashId(null); e.stopPropagation(); }
      },
    };
  }

  function renderBlock(b) {
    switch (b.type) {
      case 'title': return <AutoTA className="blk-edit blk-title" placeholder="Judul dokumen" {...textProps(b)} />;
      case 'h2': return <AutoTA className="blk-edit blk-h2" placeholder="Heading 2" {...textProps(b)} />;
      case 'h3': return <AutoTA className="blk-edit blk-h3" placeholder="Heading 3" {...textProps(b)} />;
      case 'h4': return <AutoTA className="blk-edit blk-h4" placeholder="Heading 4" {...textProps(b)} />;
      case 'p': return <AutoTA className="blk-edit blk-p" placeholder="Tulis di sini, atau ketik / untuk ganti jenis blok" {...textProps(b)} />;
      case 'hr': return <hr className="blk-hr" />;
      case 'ul': case 'ol': case 'ol-alpha': {
        const val = b.items.map((it) => '  '.repeat(it.depth) + it.text).join('\n');
        return <AutoTA className="blk-edit blk-list" placeholder="Satu baris satu poin" value={val} onChange={(v) => {
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
        const addCol = () => update(b.id, { rows: b.rows.map((r) => [...r, '']) });
        return (
          <div>
            <div className="ntable-wrap">
              <table className="blk-table">
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={ri} className={ri === 0 ? 'head' : ''}>
                      {r.map((c, ci) => (
                        <td key={ci}><input value={c} aria-label={'Sel baris ' + (ri + 1) + ' kolom ' + (ci + 1)} onChange={(e) => setCell(ri, ci, e.target.value)} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-sm" onClick={addRow}>+ Baris</button>
              <button type="button" className="btn btn-sm" onClick={addCol}>+ Kolom</button>
            </div>
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
                  <button key={w} type="button" className={'btn btn-sm' + ((b.dsize || 560) === w ? ' btn-ink' : '')}
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
            <figcaption><AutoTA className="blk-edit" value={b.caption || ''} placeholder="Keterangan gambar…"
              onChange={(v) => update(b.id, { caption: v })} /></figcaption>
          </figure>
        );
      default: return null;
    }
  }

  const slashQuery = (b) => String(b.text || '').slice(1).split(/\s/)[0];

  return (
    <div className="doceditor-wrap">
      <div className="doceditor-toolbar no-print">
        <span className="kicker" style={{ margin: 0 }}>Editor Blok</span>
        <div className="btn-row" style={{ margin: 0 }}>
          <button
            type="button" className={'btn btn-sm' + (pratinjau ? ' btn-ink' : '')}
            onClick={togglePratinjau} aria-pressed={pratinjau}
            title="Lihat bentuk jadi dokumen"
          >
            {pratinjau ? 'Tutup pratinjau' : 'Pratinjau'}
          </button>
          {pratinjau && (
            <button
              type="button" className="btn btn-sm"
              onClick={() => bukaPratinjauBaru({ judul: docTitle, markdown: mdPratinjau, images: imgsPratinjau, docType })}
              title="Buka pratinjau di tab baru"
            >
              Tab baru
            </button>
          )}
        </div>
      </div>
      <div className={'doceditor-cols' + (pratinjau ? ' side' : '')}>
        <div className="doceditor-col-edit">
          <div className="doceditor">
      {regenErr && <div className="alert alert-error">{regenErr}</div>}
      {imgAt === 0 && (
        <ImgInsertPanel picked={images} query={topic} onInsert={(imgs) => addFigBlocks(imgs, 0)} onCancel={() => setImgAt(null)} />
      )}
      {blocks.map((b, ix) => (
        <div key={b.id} className={'nblk nblk-' + b.type + (regenId === b.id ? ' busy' : '')}>
          <div className="nblk-gutter">
            <button
              type="button" className="nblk-handle" data-ntrigger
              title="Tambah blok di bawah" aria-label="Tambah blok di bawah"
              aria-expanded={!!(menu && menu.id === b.id && menu.kind === 'add')}
              onClick={() => toggleMenu(b.id, 'add')}
            >＋</button>
            <button
              type="button" className="nblk-handle" data-ntrigger
              title="Menu blok" aria-label={'Menu blok ' + (BLOCK_LABEL[b.type] || b.type)} aria-haspopup="menu"
              aria-expanded={!!(menu && menu.id === b.id && menu.kind === 'block')}
              onClick={() => toggleMenu(b.id, 'block')}
            >⋮⋮</button>
            {menu && menu.id === b.id && menu.kind === 'add' && (
              <div className="nmenu" data-nmenu role="menu" aria-label="Tambah blok">
                {ADD_ITEMS.map(([t, label, desc]) => (
                  <button key={t} type="button" role="menuitem" className="nmenu-item" onClick={() => pickBlock(t, ix + 1)}>
                    <b>{label}</b><span>{desc}</span>
                  </button>
                ))}
              </div>
            )}
            {menu && menu.id === b.id && menu.kind === 'block' && (
              <div className="nmenu" data-nmenu role="menu" aria-label="Aksi blok">
                <button type="button" role="menuitem" className="nmenu-item" disabled={ix === 0}
                  onClick={() => { move(b.id, -1); setMenu(null); }}>
                  <b>Pindah ke atas</b>
                </button>
                <button type="button" role="menuitem" className="nmenu-item" disabled={ix === blocks.length - 1}
                  onClick={() => { move(b.id, 1); setMenu(null); }}>
                  <b>Pindah ke bawah</b>
                </button>
                {canRegen(b.type) && (
                  <button type="button" role="menuitem" className="nmenu-item"
                    onClick={() => { setMenu(null); setInstruksiId(b.id); setInstruksiTeks(''); }}>
                    <b>Perbaiki dengan AI</b>
                    <span>Tulis ulang blok ini sesuai perintahmu</span>
                  </button>
                )}
                <hr className="nmenu-sep" />
                <button type="button" role="menuitem" className="nmenu-item danger"
                  onClick={() => { setMenu(null); remove(b.id); }}>
                  <b>Hapus blok</b>
                </button>
              </div>
            )}
          </div>
          <div
            className="nblk-body"
            ref={(el) => { if (el) rowRefs.current[b.id] = el; else delete rowRefs.current[b.id]; }}
          >
            {(LIST_TYPES.includes(b.type) && sumMenit(b.items) != null) || regenId === b.id ? (
              <div className="nblk-meta">
                {LIST_TYPES.includes(b.type) && sumMenit(b.items) != null && (
                  <span className="nblk-total" title="Total alokasi waktu langkah-langkah ini">Σ {sumMenit(b.items)} mnt</span>
                )}
                {regenId === b.id && <span className="nblk-busy">Memperbaiki dengan AI…</span>}
              </div>
            ) : null}
            {renderBlock(b)}
            {instruksiId === b.id && (
              <div className="nblk-ai" role="group" aria-label="Perbaiki blok dengan AI">
                <label htmlFor={'nblk-ai-' + b.id}>Perintah perbaikan untuk blok ini</label>
                <textarea
                  id={'nblk-ai-' + b.id}
                  rows={2}
                  value={instruksiTeks}
                  onChange={(e) => setInstruksiTeks(e.target.value)}
                  placeholder="mis. buat lebih rinci dengan contoh konkret; sederhanakan bahasanya; tambah langkah apersepsi… (kosongkan untuk tulis ulang biasa)"
                />
                <div className="btn-row" style={{ margin: '8px 0 0' }}>
                  <button
                    type="button" className="btn btn-sm btn-primary"
                    disabled={regenId === b.id}
                    onClick={() => { const t = instruksiTeks; setInstruksiId(null); setInstruksiTeks(''); regen(b, t); }}
                  >
                    {regenId === b.id ? 'Memperbaiki…' : 'Perbaiki dengan AI'}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => { setInstruksiId(null); setInstruksiTeks(''); }}>
                    Batal
                  </button>
                </div>
              </div>
            )}
            {slashId === b.id && (
              <SlashMenu query={slashQuery(b)} onPick={(t) => convertBlock(b.id, t)} />
            )}
          </div>
          {imgAt === ix + 1 && (
            <div className="nblk-full">
              <ImgInsertPanel picked={images} query={topic} onInsert={(imgs) => addFigBlocks(imgs, ix + 1)} onCancel={() => setImgAt(null)} />
            </div>
          )}
        </div>
      ))}
      {blocks.length === 0 && (
        <div className="nblk-empty">
          <p><b>Dokumen kosong.</b> Tambahkan blok untuk mulai menulis.</p>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => addBlock('p', 0)}>Tambah blok pertama</button>
        </div>
      )}
          </div>
        </div>
        {pratinjau && (
          <div className="doceditor-col-preview">
            <div className="doceditor-preview-inner">
              <DocPaper doc={{ judul: docTitle, markdown: mdPratinjau, images: imgsPratinjau, docType }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SlashMenu({ query, onPick }) {
  const q = String(query || '').toLowerCase();
  const items = SLASH_ITEMS.filter(([t, l]) => !q || l.toLowerCase().includes(q) || t === q);
  if (!items.length) return null;
  return (
    <div className="nmenu nmenu-slash" data-nmenu role="menu" aria-label="Ubah jenis blok">
      {items.map(([t, l]) => (
        <button
          key={t} type="button" role="menuitem" className="nmenu-item"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(t)}
        >
          <b>{l}</b>
        </button>
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
        <button type="button" className="btn btn-sm" onClick={onCancel}>Tutup</button>
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
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onInsert(fresh)}>
            Sisipkan {fresh.length} Gambar di Sini
          </button>
        </div>
      )}
    </div>
  );
}
