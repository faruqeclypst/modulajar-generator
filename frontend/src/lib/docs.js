// Definisi jenis perangkat ajar (Kurikulum Merdeka)
export const DOC_TYPES = {
  modul: {
    nama: 'Modul Ajar', tag: 'Inti',
    desc: 'Modul ajar Kurikulum Merdeka lengkap: CP, TP, kegiatan, asesmen, lampiran.',
    fields: ['jenjang', 'fase', 'kelas', 'semester', 'mapel', 'topik', 'alokasi', 'model'],
    materi: true, gambar: true,
  },
  cp: {
    nama: 'Capaian Pembelajaran', tag: 'Perencanaan',
    desc: 'Draf CP per elemen untuk fase dan mata pelajaran.',
    fields: ['jenjang', 'fase', 'mapel'],
    materi: false, gambar: false,
  },
  analisis_cp: {
    nama: 'Analisis CP', tag: 'Perencanaan',
    desc: 'Bedah CP per elemen menjadi komponen operasional siap dirumuskan jadi TP.',
    fields: ['jenjang', 'fase', 'mapel'],
    materi: false, gambar: false,
  },
  tp: {
    nama: 'Tujuan Pembelajaran', tag: 'Perencanaan',
    desc: 'Daftar TP operasional dan terukur yang diturunkan dari CP.',
    fields: ['jenjang', 'fase', 'kelas', 'semester', 'mapel'],
    materi: false, gambar: false,
  },
  atp: {
    nama: 'ATP', tag: 'Perencanaan',
    desc: 'Alur Tujuan Pembelajaran per semester dalam tabel terstruktur.',
    fields: ['jenjang', 'fase', 'kelas', 'semester', 'mapel', 'topik'],
    materi: true, gambar: false,
  },
  minggu_efektif: {
    nama: 'Minggu Efektif', tag: 'Perencanaan',
    desc: 'Analisis minggu efektif satu semester: acuan alokasi Prota, Prosem, dan modul.',
    fields: ['jenjang', 'fase', 'kelas', 'semester', 'mapel'],
    materi: false, gambar: false,
  },
  distribusi_jp: {
    nama: 'Distribusi Alokasi JP', tag: 'Perencanaan',
    desc: 'Pembagian jam pelajaran per materi pokok selama satu semester.',
    fields: ['jenjang', 'fase', 'kelas', 'semester', 'mapel'],
    materi: false, gambar: false,
  },
  prota: {
    nama: 'Program Tahunan', tag: 'Perencanaan',
    desc: 'Distribusi materi pokok selama satu tahun ajaran.',
    fields: ['jenjang', 'fase', 'kelas', 'mapel'],
    materi: false, gambar: false,
  },
  prosem: {
    nama: 'Prosem', tag: 'Perencanaan',
    desc: 'Rincian mingguan materi, TP, dan asesmen per semester.',
    fields: ['jenjang', 'fase', 'kelas', 'semester', 'mapel'],
    materi: false, gambar: false,
  },
  lkpd: {
    nama: 'LKPD', tag: 'Kegiatan',
    desc: 'Lembar kerja siap cetak dengan bahasa ramah siswa + rubrik.',
    fields: ['jenjang', 'fase', 'kelas', 'semester', 'mapel', 'topik', 'alokasi', 'model'],
    materi: true, gambar: true,
  },
  bahan_ajar: {
    nama: 'Bahan Ajar', tag: 'Kegiatan',
    desc: 'Materi bacaan/ringkasan selaras modul ajar, siap dibagikan ke siswa.',
    fields: ['jenjang', 'fase', 'kelas', 'semester', 'mapel', 'topik'],
    materi: true, gambar: true,
  },
  asesmen: {
    nama: 'Asesmen & Rubrik', tag: 'Asesmen',
    desc: 'Asesmen diagnostik, formatif, sumatif + rubrik, selaras dengan modul ajar.',
    fields: ['jenjang', 'fase', 'kelas', 'semester', 'mapel', 'topik'],
    materi: true, gambar: false,
  },
  soal: {
    nama: 'Bank Soal', tag: 'Asesmen',
    desc: 'Kisi-kisi, soal PG & uraian, kunci jawaban, dan pedoman penskoran.',
    fields: ['jenjang', 'fase', 'kelas', 'semester', 'mapel', 'topik', 'jmlPG', 'jmlUraian'],
    materi: true, gambar: false,
  },
  kktp: {
    nama: 'KKTP', tag: 'Asesmen',
    desc: 'Kriteria Ketercapaian Tujuan Pembelajaran: tolok ukur penilaian per TP.',
    fields: ['jenjang', 'fase', 'kelas', 'semester', 'mapel', 'topik'],
    materi: true, gambar: false,
  },
};

// Urutan baku penyusunan perangkat ajar (Ruang Perencanaan)
export const ALUR_PERENCANAAN = [
  { key: 'cp', langkah: '01', nama: 'Capaian Pembelajaran', desc: 'Tempel teks CP resmi, jadikan fondasi seluruh perangkat.' },
  { key: 'analisis_cp', langkah: '02', nama: 'Analisis CP', desc: 'Bedah CP per elemen jadi komponen operasional siap dirumuskan jadi TP.' },
  { key: 'tp', langkah: '03', nama: 'Tujuan Pembelajaran', desc: 'Rumuskan TP operasional dan terukur dari hasil analisis CP.' },
  { key: 'atp', langkah: '04', nama: 'ATP', desc: 'Alur Tujuan Pembelajaran diturunkan dari TP.' },
  { key: 'minggu_efektif', langkah: '05', nama: 'Minggu Efektif', desc: 'Hitung minggu efektif semester ini sebagai acuan alokasi.' },
  { key: 'distribusi_jp', langkah: '06', nama: 'Distribusi Alokasi JP', desc: 'Bagi JP per materi pokok selama satu semester.' },
  { key: 'prota', langkah: '07', nama: 'Program Tahunan', desc: 'Distribusi materi setahun mengikuti ATP dan minggu efektif.' },
  { key: 'prosem', langkah: '08', nama: 'Prosem', desc: 'Rincian mingguan mengikuti Prota dan minggu efektif.' },
];

export const FIELD_LABEL = {
  jenjang: 'Jenjang', fase: 'Fase', kelas: 'Kelas', semester: 'Semester',
  mapel: 'Mata Pelajaran', topik: 'Materi Pokok / Topik', alokasi: 'Alokasi Waktu',
  model: 'Model Pembelajaran', jmlPG: 'Jumlah Soal PG', jmlUraian: 'Jumlah Soal Uraian',
};

export const SEMESTER = ['Ganjil', 'Genap', 'Ganjil + Genap (1 tahun ajaran)'];
