-- Google sign-in: run this once in Supabase (SQL Editor > New query > paste > Run)
-- AFTER Google sign-in is switched on in Authentication > Providers.
-- 1. Put the program lead's Google email(s) on the line marked CHANGE ME below.

create table if not exists public.admins (email text primary key);
insert into public.admins (email) values
  ('CHANGE-ME@gmail.com')            -- CHANGE ME: the Google account that runs Admin
on conflict do nothing;
alter table public.admins enable row level security;   -- nobody reads this table directly

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.email()));
$$;

create or replace function public.is_tutor() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.records
    where col = 'tutors'
      and lower(data->>'email') = lower(auth.email())
      and data->>'approved' = 'true'
      and coalesce(data->>'active', 'true') <> 'false');
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_tutor() to authenticated;
create index if not exists records_tutor_email on public.records ((lower(data->>'email'))) where col = 'tutors';

-- Replace the open rules with sign-in rules.
drop policy if exists "open read" on public.records;
drop policy if exists "open insert" on public.records;
drop policy if exists "open update" on public.records;
drop policy if exists "open delete" on public.records;
drop policy if exists "signed in read" on public.records;
drop policy if exists "signed in insert" on public.records;
drop policy if exists "signed in update" on public.records;
drop policy if exists "signed in delete" on public.records;

-- Approved tutors read everything. Someone waiting for approval can only see their own request.
create policy "signed in read" on public.records for select to authenticated
  using (public.is_tutor() or (col = 'tutors' and lower(data->>'email') = lower(auth.email())));

-- Approved tutors write the log. New people may only ask to join. Only the admin changes tutors and settings.
create policy "signed in insert" on public.records for insert to authenticated
  with check (
    public.is_admin()
    or (col not in ('tutors', 'config') and public.is_tutor())
    or (col = 'tutors' and lower(data->>'email') = lower(auth.email()) and coalesce(data->>'approved', 'false') = 'false'));
create policy "signed in update" on public.records for update to authenticated
  using (public.is_admin() or (col not in ('tutors', 'config') and public.is_tutor()))
  with check (public.is_admin() or (col not in ('tutors', 'config') and public.is_tutor()));
create policy "signed in delete" on public.records for delete to authenticated
  using (public.is_admin() or (col not in ('tutors', 'config') and public.is_tutor()));
