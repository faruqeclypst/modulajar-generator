import { useEffect } from 'react';
import { DOC_TYPES } from '../lib/docs';
import FeedbackForm from './FeedbackForm';

// Landing page ModulAjar (menggantikan fungsi Landing di App.jsx).
// Prop: onStart (wajib, membuka aplikasi), onDocs (opsional, membuka halaman
// panduan; tautan Panduan hanya tampil bila prop ini diberikan), waLink
// (opsional, tautan WhatsApp untuk paket berbayar; tombol disembunyikan bila
// tidak diberikan).
//
// Keputusan desain (R-31):
// - Rantai dokumen vertikal (bukan grid kartu seragam): alur CP→modul→soal
//   adalah cerita produknya, jadi strukturnya mengikuti alur itu.
// - Satu kartu harga jujur (bukan 3 kolom template): memang hanya ada satu
//   skema gratis + opsi BYOK/WA.
// - Tanpa statistik/testimoni: tidak ada data terverifikasi (R-17, R-18).
const RANTAI = [
  {
    grup: 'Perencanaan',
    ket: 'Disusun berurutan. Tiap dokumen menjadi acuan dokumen berikutnya, bukan karangan.',
    kunci: ['cp', 'atp', 'minggu_efektif', 'prota', 'prosem'],
  },
  {
    grup: 'Pelaksanaan',
    ket: 'Diturunkan dari perencanaanmu. Materi, kegiatan, dan asesmen saling merujuk.',
    kunci: ['modul', 'lkpd'],
  },
  {
    grup: 'Penilaian',
    ket: 'Alat ukur yang selaras dengan tujuan pembelajaran di modul.',
    kunci: ['soal', 'kktp'],
  },
];

const CARA_KERJA = [
  ['01', 'Buat proyek', 'Satu proyek untuk satu mata pelajaran. Semua dokumen, dari CP sampai bank soal, terkumpul rapi di satu tempat.'],
  ['02', 'Susun perencanaan', 'CP, ATP, Prota, Prosem di Ruang Perencanaan. Belum punya? AI menyusun drafnya dari data jenjang, fase, dan mapel.'],
  ['03', 'Generate', 'Pilih satu dokumen, atau paket satu klik untuk satu semester sekaligus. Tulisan AI bisa dilihat langsung saat disusun.'],
  ['04', 'Periksa, edit, unduh', 'Edit per blok, tulis ulang bagian dengan AI, sisipkan gambar, lalu unduh sebagai Word atau cetak PDF.'],
];

const FAQ = [
  ['Apakah ModulAjar gratis?',
    'Ya. Setiap akun mendapat 20 kredit gratis setiap hari, diperbarui tiap jam 15:00 WIB. Satu dokumen yang selesai dibuat memakai 1 kredit. Tidak ada kartu kredit, tidak ada masa coba yang tiba-tiba menagih.'],
  ['Dokumen apa saja yang bisa dibuat?',
    'CP, ATP, Minggu Efektif, Prota, Prosem, Modul Ajar (lengkap dengan materi, bank soal, rubrik, dan lembar pengesahan), LKPD, Bank Soal, dan KKTP. Semuanya mengikuti alur Kurikulum Merdeka.'],
  ['Apakah saya harus menyusun CP dan ATP dulu?',
    'Tidak wajib. Kalau sudah punya, tempel atau pilih sebagai acuan agar hasilnya selaras. Kalau belum, AI menyusun drafnya dari data yang kamu isi, lalu kamu periksa dan sesuaikan.'],
  ['Bagaimana paket satu klik bekerja?',
    'Pilih mode Paket Lengkap, isi data sekali, tekan buat. Server menyusun CP sampai bank soal berurutan di belakang layar. Browser boleh ditutup; pantau lagi nanti dari Generator Paket. Kalau satu langkah gagal, ulangi langkah itu saja tanpa mengulang dari awal.'],
  ['Bisakah saya memakai API key AI sendiri?',
    'Bisa. Di Pengaturan ada "Kunci AI Sendiri": isi base URL dan API key milikmu. Selama aktif, generate memakai kuncimu dan tidak memotong kredit harian.'],
  ['Format apa yang bisa diunduh?',
    'Word (.docx) yang rapi dan PDF lewat tombol Cetak. Keduanya menyertakan lembar pengesahan resmi: kolom tanda tangan Kepala Sekolah dan Guru beserta NIP.'],
  ['Di mana dokumen saya tersimpan?',
    'Di akunmu (login Google). Buka dari perangkat mana pun, datanya tetap ada. Hanya kamu yang bisa membukanya.'],
];

export default function Landing({ onStart, onDocs, waLink }) {
  // Tangkap kode referral dari URL (?ref=KODE) untuk diklaim setelah login.
  useEffect(() => {
    try {
      const kode = new URLSearchParams(window.location.search).get('ref');
      if (kode && kode.trim()) localStorage.setItem('ma-ref', kode.trim().slice(0, 32));
    } catch { /* abaikan: penyimpanan tidak tersedia */ }
  }, []);

  return (
    <div className="wrap">
      <section className="hero-land">
        <span className="kicker">Untuk Guru Indonesia</span>
        <h1>Perangkat Ajar<br />Lengkap dalam<br /><span className="accent">Hitungan Menit.</span></h1>
        <p>
          Dari CP sampai modul ajar, LKPD, dan bank soal. AI menyusun mengikuti
          alur Kurikulum Merdeka yang runtut dan acuan yang kamu pilih.
          Kamu yang memeriksa, mengedit, dan mengesahkan.
        </p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onStart}>Mulai Membuat</button>
          <a className="btn" href="#cara-kerja">Lihat Cara Kerja</a>
        </div>
        <p className="hero-note">Gratis 20 kredit setiap hari. Tanpa kartu kredit.</p>
      </section>


      <section id="alur" style={{ marginTop: 56 }}>
        <span className="kicker">Alur Dokumen</span>
        <h2 className="sec-title">Satu alur,<br />sembilan perangkat.</h2>
        <p className="lead" style={{ maxWidth: '62ch' }}>
          Perangkat ajar yang baik tersusun berurutan: perencanaan dulu, baru
          pelaksanaan, lalu penilaian. ModulAjar menjaga urutan itu di setiap
          dokumen yang dibuat.
        </p>
        <ol className="land-chain">
          {RANTAI.map((g) => (
            <li key={g.grup} className="land-chain-group">
              <div className="land-chain-head">
                <span className="land-chain-num" aria-hidden="true">{g.grup}</span>
                <p>{g.ket}</p>
              </div>
              <ul className="land-chain-docs">
                {g.kunci.map((k) => (
                  <li key={k}>
                    <span className="chip red">{DOC_TYPES[k].tag}</span>
                    <b>{DOC_TYPES[k].nama}</b>
                    <span>{DOC_TYPES[k].desc}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section id="cara-kerja" style={{ marginTop: 56 }}>
        <span className="kicker">Cara Kerja</span>
        <h2 className="sec-title">Dari ide ke dokumen<br />siap cetak.</h2>
        <ol className="land-steps">
          {CARA_KERJA.map(([n, t, d]) => (
            <li key={n} className="card land-step">
              <b aria-hidden="true">{n}</b>
              <div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="harga" style={{ marginTop: 56 }}>
        <span className="kicker">Harga</span>
        <h2 className="sec-title">Gratis untuk<br />kebutuhan harian.</h2>
        <div className="card land-price">
          <div className="land-price-main">
            <b className="land-price-num">20</b>
            <div>
              <b>kredit gratis setiap hari</b>
              <p>Diperbarui tiap jam 15:00 WIB. Satu dokumen yang selesai dibuat memakai 1 kredit. Cukup untuk perangkat satu kelas.</p>
            </div>
          </div>
          <ul className="land-price-list">
            <li><b>Kunci AI sendiri.</b> Punya API key? Isi di Pengaturan. Selama aktif, generate tidak memotong kredit harian.</li>
            <li><b>Bagikan, dapat bonus.</b> Tiap teman yang bergabung lewat link-mu memberimu +3 kredit (maks 5 per 3 hari).</li>
            {waLink && <li><b>Butuh lebih banyak?</b> <a href={waLink} target="_blank" rel="noreferrer">Hubungi kami via WhatsApp</a> untuk paket khusus sekolah.</li>}
          </ul>
        </div>
      </section>

      <section id="faq" style={{ marginTop: 56 }}>
        <span className="kicker">Tanya Jawab</span>
        <h2 className="sec-title">Yang sering<br />ditanyakan.</h2>
        <div className="land-faq">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card land-faq-item">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="kontak" style={{ marginTop: 56 }}>
        <span className="kicker">Kontak</span>
        <h2 className="sec-title">Ada masukan<br />atau kendala?</h2>
        <p className="lead" style={{ maxWidth: '62ch' }}>
          Ceritakan lewat formulir ini. Dibaca langsung oleh pengembang, bukan bot.
        </p>
        <FeedbackForm mode="kontak" />
      </section>

      <section className="card cta-band">
        <h2>Siap menyusun perangkat ajarmu?</h2>
        <p>Masuk dengan Google, langsung jalan di browser. Tanpa instal apa pun.</p>
        <button className="btn btn-primary" onClick={onStart}>Buat Dokumen Sekarang</button>
      </section>

      <footer className="land-footer">
        <div className="land-footer-brand">
          <span className="logo-box" aria-hidden="true">M</span>
          <div>
            <b>ModulAjar</b>
            <span>Perangkat ajar untuk guru Indonesia.</span>
          </div>
        </div>
        <nav aria-label="Tautan bawah">
          {onDocs && <button type="button" className="linklike" onClick={onDocs}>Panduan</button>}
          <a href="#harga">Harga</a>
          <a href="#faq">Tanya Jawab</a>
          <a href="#kontak">Kontak</a>
        </nav>
        <p className="land-copy">© 2026 ModulAjar.</p>
      </footer>
    </div>
  );
}
