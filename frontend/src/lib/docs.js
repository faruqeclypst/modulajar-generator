// Definisi 8 jenis perangkat ajar
export const DOC_TYPES = {
  modul: {
    nama: 'Modul Ajar', tag: 'Inti',
    desc: 'Modul ajar Kurikulum Merdeka lengkap: CP, TP, kegiatan, asesmen, lampiran.',
    fields: ['jenjang', 'fase', 'kelas', 'semester', 'mapel', 'topik', 'alokasi', 'model'],
    materi: true, gambar: true,
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
  cp: {
    nama: 'Capaian Pembelajaran', tag: 'Perencanaan',
    desc: 'Draf CP per elemen untuk fase dan mata pelajaran.',
    fields: ['jenjang', 'fase', 'mapel'],
    materi: false, gambar: false,
  },
  prota: {
    nama: 'Program Tahunan', tag: 'Perencanaan',
    desc: 'Distribusi materi pokok selama satu tahun ajaran.',
    fields: ['jenjang', 'fase', 'kelas', 'mapel'],
    materi: false, gambar: false,
  },
  prosem: {
    nama: 'Program Semester', tag: 'Perencanaan',
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
  { key: 'atp', langkah: '02', nama: 'ATP', desc: 'Alur Tujuan Pembelajaran diturunkan langsung dari CP.' },
  { key: 'minggu_efektif', langkah: '03', nama: 'Minggu Efektif', desc: 'Hitung minggu efektif semester ini sebagai acuan alokasi Prota, Prosem, dan modul.' },
  { key: 'prota', langkah: '04', nama: 'Program Tahunan', desc: 'Distribusi materi setahun mengikuti ATP dan minggu efektif.' },
  { key: 'prosem', langkah: '05', nama: 'Program Semester', desc: 'Rincian mingguan mengikuti Prota dan minggu efektif.' },
];

export const FIELD_LABEL = {
  jenjang: 'Jenjang', fase: 'Fase', kelas: 'Kelas', semester: 'Semester',
  mapel: 'Mata Pelajaran', topik: 'Materi Pokok / Topik', alokasi: 'Alokasi Waktu',
  model: 'Model Pembelajaran', jmlPG: 'Jumlah Soal PG', jmlUraian: 'Jumlah Soal Uraian',
};

export const SEMESTER = ['Ganjil', 'Genap', 'Ganjil + Genap (1 tahun ajaran)'];
