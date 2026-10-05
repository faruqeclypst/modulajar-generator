// Blok "Lembar Pengesahan" resmi: dua kolom sejajar
// (Mengetahui/Kepala Sekolah | tempat-tanggal/Guru Mapel)
// dengan ruang tanda tangan, nama jelas, dan NIP.
export default function Pengesahan({ data }) {
  if (!data) return null;
  const Kolom = ({ d }) => (
    <div className="ttd-col">
      {d.atas && <p className="ttd-atas">{d.atas}</p>}
      {d.jabatan && <p className="ttd-jabatan">{d.jabatan}</p>}
      <div className="ttd-ruang" aria-hidden="true" />
      {d.nama && <p className="ttd-nama">{d.nama}</p>}
      {d.nip && <p className="ttd-nip">{d.nip}</p>}
    </div>
  );
  return (
    <section className="pengesahan" aria-label="Lembar Pengesahan">
      <h2 className="sah-judul">{data.judul || 'Lembar Pengesahan'}</h2>
      {data.intro && <p className="sah-intro">{data.intro}</p>}
      {data.sekolah && (
        <p className="sah-sekolah"><strong>Sekolah</strong>: {data.sekolah}</p>
      )}
      <div className="ttd-grid">
        <Kolom d={data.kiri} />
        <Kolom d={data.kanan} />
      </div>
    </section>
  );
}
