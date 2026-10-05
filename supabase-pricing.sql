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
