// Halaman dokumentasi/panduan ModulAjar (prop: onBack, onMasukan).
// Keputusan desain (R-31): sidebar daftar isi + satu kolom baca, karena
// pembacanya guru yang mencari jawaban cepat, bukan membaca berurutan.
const DAFTAR_ISI = [
  ['mulai', 'Mulai Cepat'],
  ['proyek', 'Proyek'],
  ['satuan', 'Membuat Dokumen Satuan'],
  ['paket', 'Generator Paket'],
  ['ruang', 'Ruang Perencanaan'],
  ['kredit', 'Kredit & Langganan'],
  ['byok', 'Kunci AI Sendiri'],
  ['bonus', 'Bagikan & Bonus'],
  ['ekspor', 'Ekspor & Tanda Tangan'],
  ['faq', 'Tanya Jawab'],
  ['masukan', 'Kirim Masukan'],
];

function S({ id, kicker, judul, children }) {
  return (
    <section id={id} className="docs-sec" aria-labelledby={id + '-t'}>
      <span className="kicker">{kicker}</span>
      <h2 id={id + '-t'}>{judul}</h2>
      {children}
    </section>
  );
}

export default function DocsView({ onBack, onMasukan }) {
  return (
    <div className="wrap">
      <button className="btn btn-sm" onClick={onBack} style={{ margin: '18px 0 6px' }}>← Kembali</button>
      <span className="kicker">Panduan</span>
      <h1 className="page">Cara memakai ModulAjar</h1>
      <p className="lead" style={{ maxWidth: '64ch' }}>
        Panduan ringkas untuk guru. Kalau ada yang belum jelas setelah membaca,
        kirim masukan lewat formulir di bawah halaman ini.
      </p>
      <details className="docs-toc-m">
        <summary>Daftar Isi Panduan</summary>
        <nav aria-label="Daftar isi panduan">
          <ul>
            {DAFTAR_ISI.map(([id, label]) => (
              <li key={id}>
                <a href={'#' + id} onClick={(e) => { const d = e.target.closest('details'); if (d) d.removeAttribute('open'); }}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </details>
      <div className="docs-layout">
        <nav className="docs-nav" aria-label="Daftar isi panduan">
          <b>Daftar Isi</b>
          <ul>
            {DAFTAR_ISI.map(([id, label]) => (
              <li key={id}><a href={'#' + id}>{label}</a></li>
            ))}
          </ul>
        </nav>
        <div className="docs-body">
          <S id="mulai" kicker="Langkah 01" judul="Mulai Cepat">
            <ol>
              <li><b>Masuk</b> dengan akun Google.</li>
              <li><b>Buat proyek</b> untuk mata pelajaranmu (mis. "IPA Kelas 7").</li>
              <li>Pilih: susun <b>perencanaan</b> dulu, generate <b>satu dokumen</b>, atau <b>paket satu klik</b> untuk satu semester.</li>
              <li><b>Periksa dan edit</b> hasilnya, lalu <b>unduh</b> sebagai Word atau cetak PDF.</li>
            </ol>
            <p className="hint">AI menyusun draf. Keputusan akhir selalu di tanganmu: periksa kesesuaian dengan kondisi kelasmu sebelum dipakai.</p>
          </S>

          <S id="proyek" kicker="Konsep Inti" judul="Proyek">
            <p>
              Satu <b>proyek</b> untuk satu <b>mata pelajaran</b> (lengkap dengan
              kelas, semester, dan tahun ajaran). Semua dokumenmu, dari CP sampai
              bank soal, terkumpul rapi di dalam proyeknya masing-masing.
            </p>
            <p>
              Saat generate di dalam proyek, AI otomatis memakai dokumen
              perencanaan proyek itu sebagai acuan. Tidak perlu memilih acuan
              satu per satu.
            </p>
          </S>

          <S id="satuan" kicker="Wizard" judul="Membuat Dokumen Satuan">
            <p>Untuk satu dokumen (mis. satu Modul Ajar atau satu LKPD), pakai alur 5 langkah:</p>
            <ol>
              <li><b>Dokumen:</b> pilih jenis dokumen dan proyeknya.</li>
              <li><b>Informasi:</b> isi data pembelajaran (nama, sekolah, jenjang, mapel, topik, alokasi). Boleh ditulis santai, AI memahami maksudnya.</li>
              <li><b>Materi:</b> tempel teks acuan bila ada. Boleh dikosongkan.</li>
              <li><b>Generate:</b> pilih sumber acuan (paket perencanaan, dokumen tersimpan, atau keduanya), lalu tekan Generate. Tulisan AI bisa dilihat langsung saat disusun.</li>
              <li><b>Editor:</b> edit per blok, tulis ulang bagian dengan AI, sisipkan gambar, lalu simpan.</li>
            </ol>
          </S>

          <S id="paket" kicker="Otomatisasi" judul="Generator Paket">
            <p>Tiga mode paket:</p>
            <ul>
              <li><b>Paket Lengkap:</b> CP, ATP, Minggu Efektif, Prota, Prosem, KKTP, lalu Modul + LKPD per topik dan satu Bank Soal. Satu klik, tanpa jeda.</li>
              <li><b>Paket Perencanaan:</b> hanya 6 dokumen perencanaan, pas untuk awal semester.</li>
              <li><b>Paket Pelaksanaan:</b> Modul + LKPD per topik dan Bank Soal. Dokumen acuan (ATP/Prosem) opsional: tempel yang sudah ada, susun dulu dengan tombol <b>Susun dengan AI</b>, atau kosongkan — AI menyusun draf acuannya otomatis saat paket berjalan.</li>
            </ul>
            <p>
              Paket dikerjakan <b>server</b>: browser boleh ditutup, pekerjaan tetap
              jalan. Pantau lagi nanti dari Generator Paket. Kalau satu langkah
              gagal, tekan <b>Ulangi langkah ini</b>; yang sudah selesai tidak diulang.
            </p>
          </S>

          <S id="ruang" kicker="Fondasi" judul="Ruang Perencanaan">
            <p>Lima langkah berurutan, tiap dokumen menjadi acuan berikutnya:</p>
            <ol>
              <li><b>CP</b> (Capaian Pembelajaran): tempel teks CP resmi bila ada.</li>
              <li><b>ATP</b> (Alur Tujuan Pembelajaran): diturunkan dari CP.</li>
              <li><b>Minggu Efektif:</b> hitung minggu efektif semester ini.</li>
              <li><b>Prota</b> (Program Tahunan): distribusi materi satu tahun ajaran.</li>
              <li><b>Prosem</b> (Program Semester): rincian mingguan materi, TP, dan asesmen.</li>
            </ol>
          </S>

          <S id="kredit" kicker="Kuota" judul="Kredit & Langganan">
            <ul>
              <li>Setiap akun mendapat <b>20 kredit gratis per minggu</b>, diperbarui setiap <b>Minggu jam 15:00 WIB</b>.</li>
              <li>Satu dokumen yang selesai dibuat memakai <b>1 kredit</b>. Paket mengecek kecukupan di awal.</li>
              <li>Sisa kredit tampil di bilah atas, halaman Pengaturan, dan di samping tombol Generate.</li>
              <li>Kredit habis? Paket berbayar tersedia via WhatsApp, atau pakai kunci AI sendiri (di bawah).</li>
            </ul>
          </S>

          <S id="byok" kicker="Opsional" judul="Kunci AI Sendiri (BYOK)">
            <p>
              Di <b>Pengaturan → Kunci AI Sendiri</b>, kamu bisa memakai base URL
              dan API key milikmu sendiri. Selama aktif, seluruh generate memakai
              kuncimu dan <b>tidak memotong kuota mingguan</b>. Cocok untuk sekolah
              yang sudah punya langganan API sendiri.
            </p>
          </S>

          <S id="bonus" kicker="Bonus" judul="Bagikan & Bonus">
            <p>
              Di <b>Pengaturan → Bagikan & Bonus</b> ada link referral pribadimu.
              Tiap teman yang bergabung lewat link itu memberimu <b>+3 kredit bonus</b>
              (maks 5 teman per periode). Bonus dihitung ulang tiap <b>3 hari</b>.
            </p>
          </S>

          <S id="ekspor" kicker="Hasil Akhir" judul="Ekspor & Tanda Tangan">
            <ul>
              <li><b>Word (.docx):</b> tombol Unduh Word menghasilkan dokumen rapi: heading berjenjang, tabel berbingkai, gambar ber-caption, nomor halaman.</li>
              <li><b>PDF:</b> tombol Cetak / PDF membuka pratinjau cetak A4 profesional. Simpan sebagai PDF dari dialog cetak browser.</li>
              <li><b>Lembar pengesahan resmi</b> otomatis di akhir Modul Ajar: kolom tanda tangan <b>Kepala Sekolah</b> dan <b>Guru Mata Pelajaran</b> beserta NIP, tempat, dan tanggal. Isi nama dan NIP di formulir (tersimpan otomatis untuk dokumen berikutnya).</li>
            </ul>
          </S>

          <S id="faq" kicker="Ringkas" judul="Tanya Jawab">
            <div className="land-faq">
              <details className="card land-faq-item">
                <summary>Hasil AI boleh langsung dipakai mengajar?</summary>
                <p>Periksa dulu. AI menyusun draf yang runtut, tapi kamu yang paling tahu kondisi kelasmu. Sesuaikan contoh, kedalaman materi, dan alokasi waktu sebelum dokumen dipakai atau ditandatangani.</p>
              </details>
              <details className="card land-faq-item">
                <summary>Generate gagal di tengah jalan, kredit saya hilang?</summary>
                <p>Tidak. Kredit dipotong saat dokumen selesai dibuat. Kalau generate gagal, tidak ada kredit yang terpakai. Untuk paket, ulangi langkah yang gagal saja.</p>
              </details>
              <details className="card land-faq-item">
                <summary>Bisakah dokumen diedit setelah jadi?</summary>
                <p>Bisa. Buka dokumen, edit per blok (teks, tabel, gambar), atau minta AI menulis ulang satu blok tertentu tanpa mengubah sisanya.</p>
              </details>
              <details className="card land-faq-item">
                <summary>Apakah bisa dipakai untuk jenjang SD/SMA?</summary>
                <p>Bisa. Pilih jenjang dan fase di formulir; AI menyesuaikan bahasa, kedalaman, dan struktur dokumennya.</p>
              </details>
            </div>
          </S>

          <S id="masukan" kicker="Kontak" judul="Kirim Masukan">
            <p>
              Menemukan yang kurang pas, punya ide fitur, atau butuh bantuan?
              Sampaikan lewat halaman masukan — dibaca langsung oleh pengembang.
            </p>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={onMasukan}>Buka Halaman Masukan</button>
            </div>
          </S>
        </div>
      </div>
    </div>
  );
}
