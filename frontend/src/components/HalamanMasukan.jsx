import FeedbackForm from './FeedbackForm';

// Halaman tersendiri untuk masukan & kontak (sebelumnya menempel di landing).
// Prop: onBack (kembali), mode ('kontak' untuk pengunjung, 'saran' untuk pengguna login).
export default function HalamanMasukan({ onBack, mode = 'kontak' }) {
  return (
    <div className="wrap">
      <span className="kicker">Masukan</span>
      <h1 className="page">Sampaikan Masukanmu</h1>
      <p className="lead" style={{ maxWidth: '62ch' }}>
        Ide fitur, laporan kendala, atau hal yang membingungkan — ceritakan di sini.
        Dibaca langsung oleh pengembang, bukan bot.
      </p>
      <div className="col-form">
        <FeedbackForm mode={mode} />
      </div>
      <div className="btn-row" style={{ marginTop: 20 }}>
        <button type="button" className="btn" onClick={onBack}>← Kembali</button>
      </div>
    </div>
  );
}
