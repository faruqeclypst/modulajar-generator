// Paginasi gaya Warm Paper: tombol Sebelumnya/Berikutnya + nomor halaman.
export default function Paginasi({ page, total, perPage = 20, onPindah }) {
  const totalHal = Math.max(1, Math.ceil((total || 0) / perPage));
  if (totalHal <= 1) return null;

  // Jendela nomor: 1 … p-1 p p+1 … N
  const angka = [];
  for (let n = 1; n <= totalHal; n++) {
    if (n === 1 || n === totalHal || Math.abs(n - page) <= 1) angka.push(n);
    else if (angka[angka.length - 1] !== '…') angka.push('…');
  }

  return (
    <nav className="paginasi" aria-label="Navigasi halaman">
      <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => onPindah(page - 1)}>
        ‹ Sebelumnya
      </button>
      {angka.map((n, i) => n === '…' ? (
        <span key={'e' + i} className="paginasi-elipsis" aria-hidden="true">…</span>
      ) : (
        <button
          key={n} type="button" className="btn btn-sm" aria-current={n === page ? 'page' : undefined}
          aria-label={'Halaman ' + n} onClick={() => onPindah(n)} disabled={n === page}
        >
          {n}
        </button>
      ))}
      <button type="button" className="btn btn-sm" disabled={page >= totalHal} onClick={() => onPindah(page + 1)}>
        Berikutnya ›
      </button>
      <span className="paginasi-info">Hal {page} dari {totalHal} · {total} data</span>
    </nav>
  );
}
