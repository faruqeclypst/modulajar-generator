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
