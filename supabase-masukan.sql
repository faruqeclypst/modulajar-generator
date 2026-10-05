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
