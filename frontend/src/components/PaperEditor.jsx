import { useState } from 'react';
import { marked } from 'marked';
import { mdToBlocks, blocksToMd, figToImage, BLOCK_LABEL } from '../lib/blocks';
import { regenBlock, gambarAI } from '../lib/api';
import { buangJudulGanda, rapikanIdentitas } from '../lib/api';
import ImagePicker from './ImagePicker';
import './PaperEditor.css';

let uid = 1;
const nid = () => 'p' + (uid++) + Date.now().toString(36);

const TEXT_TYPES = ['title', 'h2', 'h3', 'h4', 'p'];
const LIST_TYPES = ['ul', 'ol', 'ol-alpha'];
const EDIT_INLINE = [...TEXT_TYPES, ...LIST_TYPES]; // bisa diubah langsung
const BISA_AI = [...TEXT_TYPES, ...LIST_TYPES, 'table']; // bisa diperbaiki AI

const srcBlok = (b) => {
  if (TEXT_TYPES.includes(b.type)) return b.text || '';
  if (LIST_TYPES.includes(b.type)) return (b.items || []).map((it) => '  '.repeat(it.depth || 0) + it.text).join('\n');
  if (b.type === 'table') return blocksToMd([b]).trim();
  return '';
};

const parseBaris = (val) => val.split('\n').map((l) => {
  const m = l.match(/^(\s*)(.*)$/);
  return { depth: Math.min(2, Math.floor((m[1] || '').length / 2)), text: (m[2] || '').trim() };
}).filter((it) => it.text);

const mdKeBaris = (md) => md.split('\n').map((l) => l.trim())
  .filter((l) => /^\|.*\|$/.test(l))
  .map((l) => l.slice(1, -1).split('|').map((c) => c.trim()))
  .filter((cells) => !/^-+$/.test((cells[0] || '').replace(/:/g, '')));

// Render satu blok persis seperti mode pratinjau (kertas asli).
function renderBlok(b) {
  if (b.type === 'fig') {
    return (
      <figure className="figure" style={{ maxWidth: (b.dsize || 560) + 'px', marginLeft: 'auto', marginRight: 'auto' }}>
        <img src={b.thumbUrl} alt={b.caption || b.title || 'Gambar'} loading="lazy" />
        {(b.caption || b.title) && (
          <figcaption>
            <b>{b.caption || b.title}</b>
            {b.ai && <div className="credit">Dibuat dengan AI</div>}
          </figcaption>
        )}
      </figure>
    );
  }
  if (b.type === 'img') {
    return (
      <figure className="figure" style={{ maxWidth: '560px', marginLeft: 'auto', marginRight: 'auto' }}>
        <img src={b.url} alt={b.caption || 'Gambar'} loading="lazy" />
        {b.caption && <figcaption><b>{b.caption}</b></figcaption>}
      </figure>
    );
  }
  return <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(blocksToMd([b])) }} />;
}

// Panel sisip gambar: manual (Wikimedia / URL) atau buat dengan AI.
function PanelGambar({ onSisip, onBatal, topic, images }) {
  const [tab, setTab] = useState('ai');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasil, setHasil] = useState(null);
  const [err, setErr] = useState('');
  const [fresh, setFresh] = useState([]);
  const [urlM, setUrlM] = useState('');
  const [capM, setCapM] = useState('');

  async function buat() {
    setErr(''); setHasil(null);
    if (prompt.trim().length < 5) { setErr('Deskripsi minimal 5 karakter.'); return; }
    setLoading(true);
    try {
      const url = await gambarAI(prompt.trim());
      setHasil(url);
    } catch (e) { setErr(e.message || 'Gagal membuat gambar.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="pblk-panel no-print" role="group" aria-label="Sisipkan gambar">
      <div className="pblk-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'ai'} className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>Buat dengan AI</button>
        <button type="button" role="tab" aria-selected={tab === 'manual'} className={tab === 'manual' ? 'on' : ''} onClick={() => setTab('manual')}>Manual</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm" onClick={onBatal}>Tutup</button>
      </div>

      {tab === 'ai' && (
        <div>
          <label>Deskripsi gambar yang ingin dibuat</label>
          <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="mis. diagram lapisan atmosfer bumi untuk siswa SMA, gaya ilustrasi buku teks" />
          {err && <div className="alert alert-error" style={{ marginTop: 8 }}>{err}</div>}
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={buat} disabled={loading}>
              {loading ? 'Membuat…' : hasil ? 'Buat ulang' : 'Buat gambar'}
            </button>
          </div>
          {hasil && (
            <div style={{ marginTop: 10 }}>
              <img src={hasil} alt="Hasil AI" style={{ maxWidth: 320, border: '2px solid var(--ink)' }} />
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-sm btn-ink" onClick={() => onSisip({ type: 'fig', thumbUrl: hasil, caption: prompt.trim().slice(0, 80), dsize: 560, ai: true })}>
                  Sisipkan gambar ini
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'manual' && (
        <div>
          <p className="hint" style={{ marginTop: 0 }}>Pilih dari Wikimedia Commons:</p>
          <ImagePicker query={topic} initial={[]} onChange={setFresh} max={3} />
          {fresh.length > 0 && (
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-sm btn-primary"
                onClick={() => { const g = fresh[0]; onSisip({ type: 'fig', ...figToImage(g), dsize: 560 }); }}>
                Sisipkan {fresh.length} gambar
              </button>
            </div>
          )}
          <div className="field" style={{ marginTop: 12 }}>
            <label>Atau tempel URL gambar</label>
            <input value={urlM} onChange={(e) => setUrlM(e.target.value)} placeholder="https://…" autoComplete="off" spellCheck={false} />
          </div>
          <div className="field">
            <label>Keterangan</label>
            <input value={capM} onChange={(e) => setCapM(e.target.value)} placeholder="Keterangan gambar (opsional)" />
          </div>
          <div className="btn-row" style={{ marginBottom: 0 }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={!urlM.trim()}
              onClick={() => onSisip({ type: 'img', url: urlM.trim(), caption: capM.trim() })}>
              Sisipkan URL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaperEditor({ initialMarkdown, images: imagesAwal = [], docType, docTitle, topic, tema = 'hangat', typeName, onChange }) {
  const [blocks, setBlocks] = useState(() => mdToBlocks(buangJudulGanda(rapikanIdentitas(initialMarkdown || ''), docTitle || ''), imagesAwal));
  const [images, setImages] = useState(imagesAwal);
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [aiId, setAiId] = useState(null);
  const [aiTeks, setAiTeks] = useState('');
  const [regenId, setRegenId] = useState(null);
  const [regenErr, setRegenErr] = useState('');
  const [imgAt, setImgAt] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  const titleIx = blocks.findIndex((b) => b.type === 'title');
  const titleBlok = titleIx >= 0 ? blocks[titleIx] : null;
  const blokIsi = titleIx >= 0 ? blocks.filter((_, i) => i !== titleIx) : blocks;

  function commit(nb, nimgs) {
    const nim = nimgs !== undefined ? nimgs : images;
    setBlocks(nb); setImages(nim);
    onChange && onChange(blocksToMd(nb), nim);
  }
  const ganti = (id, patch) => commit(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const hapus = (id) => commit(blocks.filter((b) => b.id !== id));
  const sisipSetelah = (id, baru) => {
    const ix = blocks.findIndex((b) => b.id === id);
    const nb = [...blocks];
    nb.splice(ix + 1, 0, { ...baru, id: nid() });
    commit(nb);
  };
  const pindah = (id, arah) => {
    const ix = blocks.findIndex((b) => b.id === id);
    const jx = ix + arah;
    if (ix < 0 || jx < 0 || jx >= blocks.length) return;
    const nb = [...blocks];
    const [b] = nb.splice(ix, 1);
    nb.splice(jx, 0, b);
    commit(nb);
  };

  function mulaiUbah(b) { setAiId(null); setImgAt(null); setEditVal(srcBlok(b)); setEditingId(b.id); }
  function simpanUbah() {
    const b = blocks.find((x) => x.id === editingId);
    if (!b) { setEditingId(null); return; }
    if (TEXT_TYPES.includes(b.type)) ganti(b.id, { text: editVal });
    else if (LIST_TYPES.includes(b.type)) {
      const items = parseBaris(editVal);
      if (items.length) ganti(b.id, { items });
    }
    setEditingId(null); setEditVal('');
  }

  async function jalanAI(b, instruksi) {
    setRegenErr(''); setRegenId(b.id);
    try {
      const out = await regenBlock(docType, BLOCK_LABEL[b.type] || b.type, srcBlok(b), docTitle, topic, instruksi || '');
      if (TEXT_TYPES.includes(b.type)) ganti(b.id, { text: out.trim() });
      else if (LIST_TYPES.includes(b.type)) {
        const items = out.split('\n').map((l) => l.replace(/^(\s*[-*\d.)a-z]+\s+)/, '').trim()).filter(Boolean)
          .map((t) => ({ depth: 0, text: t }));
        if (items.length) ganti(b.id, { items });
      } else if (b.type === 'table') {
        const rows = mdKeBaris(out);
        if (rows.length >= 2) ganti(b.id, { rows });
        else throw new Error('AI tidak mengembalikan tabel yang valid.');
      }
      setAiId(null); setAiTeks('');
    } catch (e) { setRegenErr(e.message || 'Gagal.'); }
    finally { setRegenId(null); }
  }

  function sisipGambar(afterId, fig) {
    const baru = fig.type === 'fig'
      ? { id: nid(), type: 'fig', thumbUrl: fig.thumbUrl, caption: fig.caption || '', dsize: fig.dsize || 560, ai: !!fig.ai, title: fig.title, fullUrl: fig.fullUrl, artist: fig.artist, license: fig.license, pageUrl: fig.pageUrl }
      : { id: nid(), type: 'img', url: fig.url, caption: fig.caption || '' };
    const ix = blocks.findIndex((b) => b.id === afterId);
    const nb = [...blocks];
    nb.splice(ix + 1, 0, baru);
    const nim = fig.type === 'fig' && fig.thumbUrl
      ? [...images, { thumbUrl: fig.thumbUrl, caption: fig.caption || '', ai: !!fig.ai, title: fig.title, artist: fig.artist, license: fig.license, pageUrl: fig.pageUrl }]
      : images;
    setBlocks(nb); setImages(nim);
    onChange && onChange(blocksToMd(nb), nim);
    setImgAt(null);
  }

  const toolbar = (b, opts = {}) => (
    <div className="pblk-tools no-print" role="toolbar" aria-label={'Aksi bagian: ' + (BLOCK_LABEL[b.type] || b.type)}>
      {!opts.tanpaGeser && (
        <button
          type="button" className="ptool" title="Geser: tahan & tarik, atau Alt+↑/↓"
          draggable
          onDragStart={(e) => { setDragId(b.id); e.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={() => { setDragId(null); setOverId(null); }}
          onKeyDown={(e) => {
            if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); pindah(b.id, -1); }
            if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); pindah(b.id, 1); }
          }}
        >⠿</button>
      )}
      {EDIT_INLINE.includes(b.type) && (
        <button type="button" className="ptool" title="Ubah langsung" onClick={() => mulaiUbah(b)}>✎</button>
      )}
      {BISA_AI.includes(b.type) && (
        <button type="button" className="ptool" title="Perbaiki dengan AI"
          onClick={() => { setEditingId(null); setImgAt(null); setAiId(aiId === b.id ? null : b.id); setAiTeks(''); setRegenErr(''); }}>✨</button>
      )}
      {!opts.tanpaGambar && (
        <button type="button" className="ptool" title="Sisipkan gambar di bawah bagian ini"
          onClick={() => { setEditingId(null); setAiId(null); setImgAt(imgAt === b.id ? null : b.id); }}>🖼</button>
      )}
      {!opts.tanpaTambah && (
        <button type="button" className="ptool" title="Tambah paragraf di bawah"
          onClick={() => sisipSetelah(b.id, { type: 'p', text: '' })}>＋</button>
      )}
      {!opts.tanpaHapus && (
        <button type="button" className="ptool danger" title="Hapus bagian"
          onClick={() => { if (window.confirm('Hapus bagian ini?')) hapus(b.id); }}>🗑</button>
      )}
    </div>
  );

  const panelAI = (b) => aiId === b.id && (
    <div className="pblk-panel no-print" role="group" aria-label="Perbaiki dengan AI">
      <label>Perintah untuk AI</label>
      <textarea rows={2} value={aiTeks} onChange={(e) => setAiTeks(e.target.value)}
        placeholder="mis. buat lebih rinci dengan contoh konkret; sederhanakan bahasanya… (kosongkan untuk tulis ulang biasa)" />
      {regenErr && <div className="alert alert-error" style={{ marginTop: 8 }}>{regenErr}</div>}
      <div className="btn-row" style={{ marginTop: 8, marginBottom: 0 }}>
        <button type="button" className="btn btn-sm btn-primary" disabled={regenId === b.id}
          onClick={() => jalanAI(b, aiTeks)}>
          {regenId === b.id ? 'Memperbaiki…' : 'Perbaiki dengan AI'}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => { setAiId(null); setAiTeks(''); }}>Batal</button>
      </div>
    </div>
  );

  const editorBlok = (b, besar) => editingId === b.id && (
    <div className="pblk-edit no-print">
      <textarea
        className={besar ? 'pblk-h1edit' : ''}
        value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus
        rows={besar ? 2 : Math.min(12, Math.max(3, editVal.split('\n').length + 1))}
        onKeyDown={(e) => { if (e.key === 'Escape') { setEditingId(null); setEditVal(''); } }}
      />
      <div className="btn-row" style={{ marginTop: 8, marginBottom: 0 }}>
        <button type="button" className="btn btn-sm btn-primary" onClick={simpanUbah}>Simpan</button>
        <button type="button" className="btn btn-sm" onClick={() => { setEditingId(null); setEditVal(''); }}>Batal</button>
      </div>
      {LIST_TYPES.includes(b.type) && <p className="hint" style={{ marginBottom: 0 }}>Satu poin per baris.</p>}
    </div>
  );

  return (
    <div className={'paper tema-' + tema + ' pedit'}>
      <div className="paper-head">
        <div className="doclabel">{typeName} · Kurikulum Merdeka</div>
        {titleBlok ? (
          <div className="pblk">
            {editingId === titleBlok.id ? editorBlok(titleBlok, true) : (
              <h1 onDoubleClick={() => mulaiUbah(titleBlok)} title="Klik dua kali untuk mengubah">{titleBlok.text}</h1>
            )}
            {panelAI(titleBlok)}
            {toolbar(titleBlok, { tanpaGeser: true, tanpaGambar: true, tanpaTambah: true, tanpaHapus: true })}
          </div>
        ) : (
          <h1>{docTitle}</h1>
        )}
      </div>

      {blokIsi.map((b) => (
        <div
          key={b.id}
          className={'pblk' + (overId === b.id ? ' over' : '') + (dragId === b.id ? ' dragging' : '')}
          onDragOver={(e) => { if (dragId && dragId !== b.id) { e.preventDefault(); setOverId(b.id); } }}
          onDrop={(e) => {
            e.preventDefault();
            if (!dragId || dragId === b.id) return;
            const from = blocks.findIndex((x) => x.id === dragId);
            const to = blocks.findIndex((x) => x.id === b.id);
            if (from < 0 || to < 0) return;
            const nb = [...blocks];
            const [m] = nb.splice(from, 1);
            nb.splice(to, 0, m);
            commit(nb);
            setDragId(null); setOverId(null);
          }}
        >
          {editingId === b.id ? editorBlok(b) : (
            <div onDoubleClick={() => { if (EDIT_INLINE.includes(b.type)) mulaiUbah(b); }}>
              {renderBlok(b)}
            </div>
          )}
          {panelAI(b)}
          {imgAt === b.id && (
            <PanelGambar
              topic={topic} images={images}
              onBatal={() => setImgAt(null)}
              onSisip={(fig) => sisipGambar(b.id, fig)}
            />
          )}
          {toolbar(b)}
        </div>
      ))}

      {blokIsi.length === 0 && (
        <div className="pblk">
          <p className="hint">Dokumen kosong.</p>
          {toolbar({ id: 'root', type: 'p' }, { tanpaGeser: true, tanpaHapus: true, tanpaGambar: true })}
        </div>
      )}
    </div>
  );
}
