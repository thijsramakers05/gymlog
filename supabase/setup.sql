-- Gymbie: database-opzet voor accounts en synchronisatie.
-- Eenmalig uitvoeren in Supabase → SQL Editor. Opnieuw uitvoeren kan geen kwaad.

-- 1. Eén tabel met alle gegevens (workouts, historie, oefeningen, standen, ...),
--    elk record als JSON, per gebruiker gescheiden.
create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null,
  id         text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  updated_at bigint      not null default 0,
  server_ts  timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, id)
);
create index if not exists records_user_server_ts on public.records (user_id, server_ts);

-- server_ts bijwerken bij elke wijziging (zodat andere apparaten wijzigingen kunnen ophalen)
create or replace function public.records_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_ts := clock_timestamp();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before update on public.records
  for each row execute function public.records_touch();

-- 2. Beveiliging: iedereen ziet en wijzigt alleen zijn eigen records.
alter table public.records enable row level security;
drop policy if exists "records: eigen lezen" on public.records;
drop policy if exists "records: eigen toevoegen" on public.records;
drop policy if exists "records: eigen wijzigen" on public.records;
drop policy if exists "records: eigen verwijderen" on public.records;
create policy "records: eigen lezen" on public.records
  for select to authenticated using (user_id = (select auth.uid()));
create policy "records: eigen toevoegen" on public.records
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "records: eigen wijzigen" on public.records
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "records: eigen verwijderen" on public.records
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- 3. Foto's: privé-bucket, elke gebruiker alleen in zijn eigen map (<user_id>/...).
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;
drop policy if exists "photos: eigen lezen" on storage.objects;
drop policy if exists "photos: eigen uploaden" on storage.objects;
drop policy if exists "photos: eigen wijzigen" on storage.objects;
drop policy if exists "photos: eigen verwijderen" on storage.objects;
create policy "photos: eigen lezen" on storage.objects
  for select to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: eigen uploaden" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: eigen wijzigen" on storage.objects
  for update to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: eigen verwijderen" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 4. Eigen account verwijderen (de app verwijdert eerst de foto's via de Storage API).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
