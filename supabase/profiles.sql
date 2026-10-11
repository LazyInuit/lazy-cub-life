-- Run once in the Supabase SQL editor.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  save jsonb not null,
  username_changed_at timestamptz,
  banned boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "insert own profile"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "update own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select, insert, update on public.profiles to authenticated;
