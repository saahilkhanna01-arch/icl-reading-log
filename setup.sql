-- Run this once in Supabase: SQL Editor > New query > paste > Run.
create table if not exists public.records (
  id text primary key,
  col text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists records_col on public.records (col);

-- No logins: anyone with the website can read and write the log.
alter table public.records enable row level security;
drop policy if exists "open read" on public.records;
drop policy if exists "open insert" on public.records;
drop policy if exists "open update" on public.records;
drop policy if exists "open delete" on public.records;
create policy "open read" on public.records for select using (true);
create policy "open insert" on public.records for insert with check (true);
create policy "open update" on public.records for update using (true) with check (true);
create policy "open delete" on public.records for delete using (true);

-- Live updates, so tutors see each other's changes straight away.
alter publication supabase_realtime add table public.records;
