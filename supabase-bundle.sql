-- ============================================================
-- ModulAjar: BUNDLE SQL SEKALI JALAN (pagi 2026-10-06)
-- Cara pakai: Supabase Dashboard → SQL Editor → New query →
--             paste SELURUH file ini → Run.
-- Aman dijalankan ulang (semua pakai IF NOT EXISTS / DROP IF EXISTS).
-- Backend mengakses tabel ini via service_role (melewati RLS).
-- ============================================================

-- 4) Kuota harian per user (1 dokumen selesai = 1 kuota; reset harian WIB)
--    Cara pakai: jalankan section ini di Supabase Dashboard → SQL Editor.
--    Backend menambah/membaca baris hari ini via service-role (melewati RLS).
create table if not exists kuota_harian (
  user_id uuid not null references auth.users(id) on delete cascade,
  tanggal date not null,
  dipakai int not null default 0,
  primary key (user_id, tanggal)
);

alter table kuota_harian enable row level security;
drop policy if exists "own_kuota" on kuota_harian;
create policy "own_kuota" on kuota_harian for select
  using (auth.uid() = user_id);

-- ModulAjar: tabel pricing (BYOK + referral + bonus kuota)
-- Cara pakai: jalankan SELURUH file ini di Supabase Dashboard → SQL Editor → Run.
-- Backend mengakses tabel-tabel ini via service_role (melewati RLS),
-- jadi RLS dinyalakan TANPA policy untuk user biasa.
-- Catatan: gen_random_uuid() butuh ekstensi pgcrypto (aktif bawaan di Supabase).

-- 1) Kunci AI milik user (BYOK: base URL + API key + model opsional)
create table if not exists kunci_ai (
  user_id uuid primary key references auth.users(id) on delete cascade,
  base_url text not null,
  api_key text not null,
  model text,
  updated_at timestamptz not null default now()
);
alter table kunci_ai enable row level security;

-- 2) Kode referral: satu kode per user, satu kode hanya bisa diklaim satu kali
create table if not exists referal (
  id uuid primary key default gen_random_uuid(),
  kode text unique not null,
  pemilik_id uuid not null references auth.users(id) on delete cascade,
  dipakai_oleh_id uuid unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table referal enable row level security;

-- 3) Bonus kuota referral per window 3-hari (window_start = tanggal awal window)
create table if not exists bonus_kuota (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start date not null,
  bonus int not null default 0,
  primary key (user_id, window_start)
);
alter table bonus_kuota enable row level security;

-- Tabel masukan: saran dari user login & pesan kontak dari pengunjung landing.
-- Dibaca/dikelola lewat dashboard admin (endpoint /api/admin/*, service-role).
-- Cara pakai: jalankan file ini di Supabase Dashboard → SQL Editor.
-- (Boleh digabung dengan supabase-schema.sql / supabase-pricing.sql; idempoten.)

create table if not exists masukan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  jenis text not null check (jenis in ('saran', 'kontak')),
  nama text,
  email text,
  pesan text not null,
  dibaca boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists masukan_dibuat_idx on masukan(created_at desc);

alter table masukan enable row level security;
-- Sengaja tanpa policy untuk user: hanya service_role (backend) yang baca/tulis.

-- 6) Pengaturan AI global (diatur admin via Dashboard Admin)
--    Satu baris (id=1): toggle AI bawaan + key umum + key khusus admin.
create table if not exists pengaturan_ai (
  id int primary key,
  bawaan_aktif boolean not null default true,
  umum_base_url text not null default 'https://kenari.id/v1',
  umum_api_key text not null default '',
  umum_model text not null default 'agnes-3-0-flash:free',
  admin_base_url text not null default 'https://kenari.id/v1',
  admin_api_key text not null default '',
  admin_model text not null default 'agnes-3-0-flash:free',
  updated_at timestamptz not null default now(),
  constraint pengaturan_ai_satu_baris check (id = 1)
);
insert into pengaturan_ai (id) values (1) on conflict (id) do nothing;
alter table pengaturan_ai enable row level security;
-- Sengaja tanpa policy untuk user: hanya service_role (backend) yang baca/tulis.

-- 7) Pilihan AI per user: pakai AI bawaan web atau kunci sendiri (BYOK)
alter table kunci_ai add column if not exists pakai_bawaan boolean not null default true;

-- 8) Daftar AI tersimpan (preset provider): admin simpan beberapa konfigurasi
--    AI dan pilih mana yang aktif dipakai untuk umum / admin.
create table if not exists daftar_ai (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  base_url text not null,
  api_key text not null,
  model text not null default '',
  untuk text not null default 'umum' check (untuk in ('umum', 'admin')),
  aktif boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists daftar_ai_untuk_idx on daftar_ai(untuk);
alter table daftar_ai enable row level security;
-- Sengaja tanpa policy untuk user: hanya service_role (backend) yang baca/tulis.

-- 9) Transaksi pembayaran (fondasi payment gateway)
--    Satu baris per upaya bayar; gateway callback update status via referensi.
create table if not exists transaksi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  paket text not null default '',
  jumlah integer not null default 0,          -- nominal rupiah
  metode text,                                 -- qris | transfer | ewallet | ...
  status text not null default 'pending' check (status in ('pending','berhasil','gagal','kadaluarsa')),
  referensi text unique,                       -- order_id dari gateway (idempotensi callback)
  kredit integer not null default 0,           -- kredit yang diberikan bila berhasil
  meta jsonb not null default '{}'::jsonb,     -- payload mentah gateway (snap token, dsb)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transaksi_user_idx on transaksi(user_id);
create index if not exists transaksi_status_idx on transaksi(status);
create index if not exists transaksi_referensi_idx on transaksi(referensi);
alter table transaksi enable row level security;
-- Sengaja tanpa policy untuk user: hanya service_role (backend) yang baca/tulis.

-- 10) Tabel inti: dokumen & jobs (disalin dari supabase-schema.sql agar
--     bundle ini benar-benar sekali jalan untuk setup baru)
create table if not exists dokumen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null,
  judul text not null,
  markdown text not null default '',
  meta jsonb not null default '{}',
  images jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dokumen_user_idx on dokumen(user_id, updated_at desc);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  status text not null default 'antri'
    check (status in ('antri','berjalan','menunggu_review','selesai','gagal','dibatalkan')),
  config jsonb not null default '{}',
  progress jsonb not null default '{}',
  hasil jsonb not null default '[]',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_user_idx on jobs(user_id, created_at desc);

alter table dokumen enable row level security;
alter table jobs enable row level security;
drop policy if exists "own_dokumen" on dokumen;
create policy "own_dokumen" on dokumen for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own_jobs" on jobs;
create policy "own_jobs" on jobs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 11) Klaim referral per teman (mendukung multi-klaim: satu kode bisa diklaim
--     banyak user berbeda, satu baris per klaim)
create table if not exists klaim_referal (
  id uuid primary key default gen_random_uuid(),
  kode text not null,
  pemilik_id uuid not null,
  oleh_id uuid not null,
  created_at timestamptz default now(),
  unique(kode, oleh_id)
);
create index if not exists klaim_referal_pemilik_idx on klaim_referal(pemilik_id, created_at);
alter table klaim_referal enable row level security;
-- Sengaja tanpa policy untuk user: hanya service_role (backend) yang baca/tulis.

-- 12) Proyek (1 proyek = 1 mapel/kelas): ikut akun, lintas perangkat.
--     id berupa teks agar kompatibel dengan id proyek lama di localStorage.
create table if not exists proyek (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nama text not null default '',
  mapel text not null default '',
  jenjang text not null default '',
  fase text not null default '',
  kelas text not null default '',
  semester text not null default '',
  tahun_ajaran text not null default '',
  paket_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proyek_user_idx on proyek(user_id, updated_at desc);
alter table proyek enable row level security;
drop policy if exists "own_proyek" on proyek;
create policy "own_proyek" on proyek for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- 12b) Arsip proyek: proyek yang diarsipkan disembunyikan dari daftar & select.
alter table proyek add column if not exists arsip boolean not null default false;

-- 13) Profil guru: ikut akun, lintas perangkat (sebelumnya localStorage).
create table if not exists profil_guru (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table profil_guru enable row level security;
drop policy if exists "own_profil_guru" on profil_guru;
create policy "own_profil_guru" on profil_guru for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Galeri Publik: dokumen yang dipublikasikan bisa dibaca siapa saja
alter table dokumen add column if not exists publik boolean not null default false;
alter table dokumen add column if not exists slug text;
alter table dokumen add column if not exists diterbitkan_pada timestamptz;
create unique index if not exists dokumen_slug_unik on dokumen(slug) where slug is not null;
create index if not exists dokumen_publik_idx on dokumen(publik, diterbitkan_pada desc) where publik = true;

-- Galeri Publik: siapa saja (termasuk anon) boleh BACA dokumen yang dipublikasikan
drop policy if exists "baca_dokumen_publik" on dokumen;
create policy "baca_dokumen_publik" on dokumen for select
  using (publik = true);
