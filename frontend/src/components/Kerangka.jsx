// Kerangka (skeleton) loading — placeholder berdenyut selagi data dari DB dimuat,
// supaya layar tidak terasa "delay" dengan teks Memuat… polos.
export function Skel({ tinggi = 14, lebar = '100%', gaya }) {
  return <div className="skel" aria-hidden="true" style={{ height: tinggi, width: lebar, ...gaya }} />;
}

export function SkelStat({ jumlah = 6 }) {
  return (
    <div className="admin-stats" role="status" aria-label="Memuat ringkasan">
      {Array.from({ length: jumlah }).map((_, i) => (
        <div className="admin-stat" key={i} aria-hidden="true">
          <Skel tinggi={12} lebar="60%" gaya={{ marginBottom: 10 }} />
          <Skel tinggi={26} lebar="45%" />
        </div>
      ))}
    </div>
  );
}

export function SkelTabel({ baris = 5, kolom = 4 }) {
  return (
    <div className="admin-tabel-wrap" role="status" aria-label="Memuat data">
      <table className="admin-tabel" aria-hidden="true">
        <tbody>
          {Array.from({ length: baris }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: kolom }).map((_, j) => (
                <td key={j}><Skel tinggi={14} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkelKartu({ jumlah = 3 }) {
  return (
    <div className="modul-grid" role="status" aria-label="Memuat daftar">
      {Array.from({ length: jumlah }).map((_, i) => (
        <div className="card" key={i} aria-hidden="true">
          <Skel tinggi={16} lebar="45%" gaya={{ marginBottom: 12 }} />
          <Skel tinggi={22} lebar="80%" gaya={{ marginBottom: 10 }} />
          <Skel tinggi={14} lebar="100%" gaya={{ marginBottom: 6 }} />
          <Skel tinggi={14} lebar="70%" />
        </div>
      ))}
    </div>
  );
}

export function SkelForm({ baris = 4 }) {
  return (
    <div role="status" aria-label="Memuat formulir">
      {Array.from({ length: baris }).map((_, i) => (
        <div key={i} aria-hidden="true" style={{ marginBottom: 16 }}>
          <Skel tinggi={12} lebar="30%" gaya={{ marginBottom: 8 }} />
          <Skel tinggi={44} lebar="100%" />
        </div>
      ))}
    </div>
  );
}
