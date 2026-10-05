-- Skema Supabase untuk ModulAjar Generator
-- Cara pakai: Supabase Dashboard → SQL Editor → New query → paste seluruh file → Run

-- 1) Dokumen pengguna (pengganti penyimpanan lokal Dexie `moduls`)
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

-- 2) Paket perencanaan (pengganti Dexie `pakets`: CP/ATP/Prota/Prosem/Minggu Efektif)
create table if not exists paket (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta jsonb not null default '{}',
  docs jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists paket_user_idx on paket(user_id, updated_at desc);

-- 3) Job generate paket (dikerjakan backend, tahan browser ditutup)
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

-- 4) Row Level Security: tiap user hanya bisa akses datanya sendiri
alter table dokumen enable row level security;
alter table paket enable row level security;
alter table jobs enable row level security;

drop policy if exists "own_dokumen" on dokumen;
create policy "own_dokumen" on dokumen for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_paket" on paket;
create policy "own_paket" on paket for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_jobs" on jobs;
create policy "own_jobs" on jobs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
