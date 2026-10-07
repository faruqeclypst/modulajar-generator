import { Reveal, Parallax, CountUp } from './Reveal';
import { AlurBlok } from './AlurBlok';
import { useEffect } from 'react';
import { DOC_TYPES } from '../lib/docs';
import { kunciAkun } from '../lib/akunLokal';

// Landing page ModulAjar (menggantikan fungsi Landing di App.jsx).
// Prop: onStart (wajib, membuka aplikasi), onDocs (opsional, membuka halaman
// panduan; tautan Panduan hanya tampil bila prop ini diberikan), onMasukan
// (opsional, membuka halaman masukan terpisah), waLink
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
  ['01', 'Pilih caramu', 'Mau beres sekaligus atau dipandu tahap demi tahap? Dua-duanya bisa — AI yang menyusun, kamu yang memeriksa.'],
  ['02', 'AI menyusun', 'Tulisan AI terlihat langsung saat disusun. Perencanaan jadi fondasi, lalu modul, LKPD, sampai bank soal mengikuti.'],
  ['03', 'Periksa, edit, unduh', 'Klik dua kali untuk mengedit langsung, tulis ulang bagian dengan AI, sisipkan gambar, lalu unduh Word atau cetak PDF.'],
];

const DUA_CARA = [
  ['Sekaligus otomatis',
   'Isi satu formulir, satu klik. AI buatkan seluruh perangkat satu semester: perencanaan, modul ajar, LKPD, sampai bank soal. Cocok kalau mau cepat beres.',
   'Generator Paket', 'paket'],
  ['Dipandu langkah demi langkah',
   'Disetir tahap per tahap — CP, ATP, Prota, Prosem, baru modul. Tiap tahap terkunci sampai sebelumnya selesai, jadi urutannya selalu benar.',
   'Ruang Perencanaan', 'ruang'],
];

const FAQ = [
  ['Apakah ModulAjar gratis?',
    'Ya. Setiap akun mendapat 10 kredit gratis setiap minggu, diperbarui setiap Minggu jam 15:00 WIB. Satu dokumen yang selesai dibuat memakai 1 kredit. Tidak ada kartu kredit, tidak ada masa coba yang tiba-tiba menagih.'],
  ['Dokumen apa saja yang bisa dibuat?',
    'CP, Analisis CP, TP, ATP, Minggu Efektif, Distribusi JP, Prota, Prosem, Modul Ajar, Asesmen & Rubrik, LKPD, Bahan Ajar, Bank Soal, dan KKTP. Semuanya mengikuti alur Kurikulum Merdeka.'],
  ['Apakah saya harus menyusun CP dan ATP dulu?',
    'Tidak wajib. Kalau sudah punya, tempel atau pilih sebagai acuan agar hasilnya selaras. Kalau belum, AI menyusun drafnya dari data yang kamu isi, lalu kamu periksa dan sesuaikan.'],
  ['Bagaimana paket satu klik bekerja?',
    'Pilih mode Paket Lengkap, isi data sekali, tekan buat. Server menyusun CP sampai bank soal berurutan di belakang layar. Browser boleh ditutup; pantau lagi nanti dari Generator Paket. Kalau satu langkah gagal, ulangi langkah itu saja tanpa mengulang dari awal.'],
  ['Bisakah saya memakai API key AI sendiri?',
    'Bisa. Di Pengaturan ada "Kunci AI Sendiri": isi base URL dan API key milikmu. Selama aktif, generate memakai kuncimu dan tidak memotong kredit mingguan.'],
  ['Format apa yang bisa diunduh?',
    'Word (.docx) yang rapi dan PDF lewat tombol Cetak. Keduanya menyertakan lembar pengesahan resmi: kolom tanda tangan Kepala Sekolah dan Guru beserta NIP.'],
  ['Di mana dokumen saya tersimpan?',
    'Di akunmu (login Google). Buka dari perangkat mana pun, datanya tetap ada. Hanya kamu yang bisa membukanya.'],
];

export default function Landing({ onStart, onDocs, onMasukan, waLink, onLogin }) {
  // Tangkap kode referral dari URL (?ref=KODE) untuk diklaim setelah login.
  useEffect(() => {
    try {
      const kode = new URLSearchParams(window.location.search).get('ref');
      if (kode && kode.trim()) localStorage.setItem(kunciAkun('ma-ref'), kode.trim().slice(0, 32));
    } catch { /* abaikan: penyimpanan tidak tersedia */ }
  }, []);

  return (
    <div className="wrap">
      <section className="hero-land">
        <div className="hero-grid">
          <div className="hero-teks">
            <img src="/logo.svg" alt="Logo ModulAjar" className="hero-logo" width="76" height="76" />
            <span className="kicker kicker-light">Untuk Guru Indonesia</span>
            <h1>Perangkat Ajar<br />Lengkap dalam<br /><span className="accent">Hitungan Menit.</span></h1>
            <p>
              Dari CP sampai modul ajar, LKPD, dan bank soal. AI menyusun mengikuti
              alur Kurikulum Merdeka yang runtut dan acuan yang kamu pilih.
              Kamu yang memeriksa, mengedit, dan mengesahkan.
            </p>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => onStart()}>Mulai Gratis</button>
              <a className="btn btn-ghost-light" href="#cara-kerja">Lihat Cara Kerja</a>
            </div>
            <p className="hero-note">Gratis 10 kredit setiap minggu. Tanpa kartu kredit. Masuk dengan akun Google — diarahkan ke Google lalu kembali otomatis.</p>
            {onLogin && (
              <p className="hero-login">Sudah punya akun? <button type="button" onClick={onLogin}>Masuk</button></p>
            )}
          </div>
          <Parallax speed={0.14} className="hero-maskot">
            <img className="maskot-splash" src="/splash.svg" alt="" aria-hidden="true" />
            <img className="maskot-img" src="/maskot.png" alt="Maskot guru ModulAjar menunjuk ke atas sambil memegang tablet" width="640" height="600" loading="eager" />
          </Parallax>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {Array(2).fill('MODUL AJAR · ATP · CP · PROTA · PROSEM · LKPD · BANK SOAL · KKTP · ').map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>

      <section id="alur" style={{ marginTop: 56 }}>
        <Reveal>
          <span className="kicker">Alur Dokumen</span>
          <h2 className="sec-title">Satu alur,<br />sembilan perangkat.</h2>
          <p className="lead" style={{ maxWidth: '62ch' }}>
            Perangkat ajar yang baik tersusun berurutan: perencanaan dulu, baru
            pelaksanaan, lalu penilaian — dan hasilnya melingkar kembali:
            asesmen dan refleksi menjadi bahan perbaikan perencanaan berikutnya.
            ModulAjar menjaga urutan itu di setiap dokumen yang dibuat.
          </p>
        </Reveal>
        <Reveal delayMs={80}>
          <AlurBlok rantai={RANTAI} />
        </Reveal>
      </section>

      <section id="cara-kerja" style={{ marginTop: 56 }}>
        <Reveal>
          <span className="kicker">Cara Kerja</span>
          <h2 className="sec-title">Pilih caramu,<br />AI yang menyusun.</h2>
          <p className="lead" style={{ maxWidth: '62ch' }}>
            Dua jalan menuju dokumen jadi — pilih yang sesuai gayamu.
            Semua hasil tersimpan rapi per mata pelajaran di <b>Proyek Saya</b>,
            bisa dibuka, diedit, dan diunduh kapan saja.
          </p>
        </Reveal>
        <div className="land-dua-cara">
          {DUA_CARA.map(([t, d, tag, target], i) => (
            <Reveal key={t} className="card land-cara" delayMs={i * 120}>
              <span className="chip red">{tag}</span>
              <h3>{t}</h3>
              <p>{d}</p>
              <button type="button" className="btn btn-primary" onClick={() => onStart(target)}>
                {target === 'paket' ? 'Coba Generator Paket' : 'Coba Ruang Perencanaan'}
              </button>
            </Reveal>
          ))}
        </div>
        <ol className="land-steps" style={{ marginTop: 32 }}>
          {CARA_KERJA.map(([n, t, d], i) => (
            <Reveal as="li" key={n} className="card land-step" delayMs={i * 120}>
              <b aria-hidden="true">{n}</b>
              <div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      <section id="harga" style={{ marginTop: 56 }}>
        <Reveal>
          <span className="kicker">Harga</span>
          <h2 className="sec-title">Gratis untuk<br />kebutuhan mingguan.</h2>
        </Reveal>
        <Reveal delayMs={120} className="card land-price">
          <div className="land-price-main">
            <b className="land-price-num"><CountUp sampai={10} /></b>
            <div>
              <b>kredit gratis setiap minggu</b>
              <p>Diperbarui setiap Minggu jam 15:00 WIB. Satu dokumen yang selesai dibuat memakai 1 kredit. Cukup untuk perangkat satu kelas.</p>
            </div>
          </div>
          <ul className="land-price-list">
            <li><b>Kunci AI sendiri.</b> Punya API key? Isi di Pengaturan. Selama aktif, generate tidak memotong kredit mingguan.</li>
            <li><b>Bagikan, dapat bonus.</b> Tiap teman yang bergabung lewat link-mu: kamu +3 kredit, temanmu +3 kredit (maks 5 per minggu).</li>
            {waLink && <li><b>Butuh lebih banyak?</b> <a href={waLink} target="_blank" rel="noreferrer">Hubungi kami via WhatsApp</a> untuk paket khusus sekolah.</li>}
          </ul>
        </Reveal>
      </section>

      <section id="faq" style={{ marginTop: 56 }}>
        <Reveal>
          <span className="kicker">Tanya Jawab</span>
          <h2 className="sec-title">Yang sering<br />ditanyakan.</h2>
        </Reveal>
        <div className="land-faq">
          {FAQ.map(([q, a], i) => (
            <Reveal key={q} as="details" className="card land-faq-item" delayMs={i * 80}>
              <summary>{q}</summary>
              <p><span>{a}</span></p>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal className="cta-band" delayMs={60}>
        <h2>Siap menyusun perangkat ajarmu?</h2>
        <p>Masuk dengan Google, langsung jalan di browser. Tanpa instal apa pun.</p>
        <button className="btn btn-primary" onClick={onStart}>Buat Dokumen Sekarang</button>
      </Reveal>

      <footer className="land-footer">
        <div className="land-footer-grid">
          <div className="land-footer-brand">
            <img src="/logo.svg" alt="Logo ModulAjar" className="land-footer-logo" width="60" height="60" />
            <div>
              <b>ModulAjar</b>
              <span>Perangkat Ajar AI untuk Guru Indonesia</span>
            </div>
            <p>Dari CP sampai bank soal — tersusun berurutan mengikuti Kurikulum Merdeka. Gratis 10 kredit setiap minggu.</p>
          </div>
          <nav aria-label="Produk">
            <b>Produk</b>
            <a href="#alur">Alur Dokumen</a>
            <a href="#cara-kerja">Cara Kerja</a>
            <a href="#harga">Harga</a>
            <a href="#faq">Tanya Jawab</a>
          </nav>
          <nav aria-label="Bantuan">
            <b>Bantuan</b>
            {onMasukan && <button type="button" className="linklike" onClick={onMasukan}>Kirim Masukan</button>}
            {waLink && <a href={waLink} target="_blank" rel="noreferrer">Chat WhatsApp</a>}
            {onDocs && <button type="button" className="linklike" onClick={onDocs}>Panduan</button>}
          </nav>
        </div>
        <div className="land-footer-bottom">
          <p className="land-copy">© 2026 ModulAjar · Oleh Alfaruq Asri, S.Pd.</p>
          <p className="land-copy">Dibuat dengan bangga untuk guru Indonesia.</p>
        </div>
      </footer>
    </div>
  );
}
