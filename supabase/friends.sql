-- Gymbie: vrienden en gebruikersnamen.
-- Uitvoeren in Supabase → SQL Editor, na setup.sql. Opnieuw uitvoeren kan geen kwaad.
-- Vrienden lezen elkaars gegevens alleen via de functies hieronder; de tabel records
-- blijft voor iedereen strikt privé.

-- 1. Profielen (gebruikersnaam + wat je deelt)
create table if not exists public.profiles (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text check (display_name is null or char_length(display_name) <= 40),
  share        jsonb not null default '{"sessions": true, "templates": true, "meta": false, "photos": false, "bodyweight": false}'::jsonb,
  created_at   timestamptz not null default now()
);

-- 2. Vriendschappen (verzoek → geaccepteerd)
create table if not exists public.friendships (
  requester   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  addressee   uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee on public.friendships (addressee);

-- 3. Hulpfuncties
create or replace function public.is_related(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where (f.requester = auth.uid() and f.addressee = other) or (f.addressee = auth.uid() and f.requester = other)
  );
$$;

create or replace function public.is_friend(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = other) or (f.addressee = auth.uid() and f.requester = other))
  );
$$;

-- Mag ik (auth.uid) dit soort gegevens van 'owner' zien?
create or replace function public.can_view(owner uuid, k text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_friend(owner) and coalesce((
    select case
      when k = 'session' then (p.share ->> 'sessions')::boolean
      when k = 'template' then (p.share ->> 'templates')::boolean
      when k in ('exercise', 'gym') then coalesce((p.share ->> 'sessions')::boolean, false) or coalesce((p.share ->> 'templates')::boolean, false)
      when k = 'meta' then (p.share ->> 'meta')::boolean
      when k = 'photo' then (p.share ->> 'photos')::boolean
      when k = 'bodyweight' then (p.share ->> 'bodyweight')::boolean
      else false
    end
    from public.profiles p where p.user_id = owner
  ), false);
$$;

create or replace function public.can_view_folder(folder text, k text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return public.can_view(folder::uuid, k);
exception when others then
  return false;
end $$;

-- 4. Beveiliging profielen: jezelf + mensen met wie je een (open) verzoek of vriendschap hebt
alter table public.profiles enable row level security;
drop policy if exists "profiles: lezen" on public.profiles;
drop policy if exists "profiles: aanmaken" on public.profiles;
drop policy if exists "profiles: wijzigen" on public.profiles;
drop policy if exists "profiles: verwijderen" on public.profiles;
create policy "profiles: lezen" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()) or public.is_related(user_id));
create policy "profiles: aanmaken" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profiles: wijzigen" on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "profiles: verwijderen" on public.profiles
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;

-- 5. Beveiliging vriendschappen
alter table public.friendships enable row level security;
drop policy if exists "friendships: lezen" on public.friendships;
drop policy if exists "friendships: verzoek sturen" on public.friendships;
drop policy if exists "friendships: accepteren" on public.friendships;
drop policy if exists "friendships: verwijderen" on public.friendships;
create policy "friendships: lezen" on public.friendships
  for select to authenticated using (requester = (select auth.uid()) or addressee = (select auth.uid()));
create policy "friendships: verzoek sturen" on public.friendships
  for insert to authenticated with check (requester = (select auth.uid()) and status = 'pending' and accepted_at is null);
create policy "friendships: accepteren" on public.friendships
  for update to authenticated using (addressee = (select auth.uid())) with check (addressee = (select auth.uid()) and status = 'accepted');
create policy "friendships: verwijderen" on public.friendships
  for delete to authenticated using (requester = (select auth.uid()) or addressee = (select auth.uid()));
revoke all on public.friendships from anon;
revoke update on public.friendships from authenticated;
grant select, insert, delete on public.friendships to authenticated;
grant update (status, accepted_at) on public.friendships to authenticated;

-- 6. Iemand vinden op exacte gebruikersnaam (geen lijst van alle gebruikers)
create or replace function public.find_profile(uname text) returns table (user_id uuid, username text, display_name text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.username, p.display_name
  from public.profiles p
  where p.username = lower(trim(uname)) and p.user_id <> auth.uid();
$$;

-- Apparaatstanden uit workouts weglaten als die niet gedeeld worden
create or replace function public.strip_meta(d jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when d ? 'items' then jsonb_set(d, '{items}', coalesce(
    (select jsonb_agg(it - 'meta' order by ord) from jsonb_array_elements(d -> 'items') with ordinality as e(it, ord)),
    '[]'::jsonb)) else d end;
$$;

-- 7. Gegevens van één vriend (alleen wat die vriend deelt)
create or replace function public.friend_data(friend uuid, kinds text[]) returns table (kind text, id text, data jsonb)
language sql stable security definer set search_path = '' as $$
  select r.kind, r.id,
    case when r.kind = 'session' and not coalesce((p.share ->> 'meta')::boolean, false) then public.strip_meta(r.data) else r.data end
  from public.records r
  join public.profiles p on p.user_id = r.user_id
  where r.user_id = friend
    and r.kind = any (kinds)
    and not r.deleted and r.data is not null
    and public.can_view(friend, r.kind);
$$;

-- 8. Recente workouts van al je vrienden
create or replace function public.friend_feed(lim int default 30) returns table (user_id uuid, id text, data jsonb)
language sql stable security definer set search_path = '' as $$
  with f as (
    select case when fr.requester = auth.uid() then fr.addressee else fr.requester end as fid
    from public.friendships fr
    where fr.status = 'accepted' and (fr.requester = auth.uid() or fr.addressee = auth.uid())
  )
  select r.user_id, r.id,
    case when coalesce((p.share ->> 'meta')::boolean, false) then r.data else public.strip_meta(r.data) end
  from f
  join public.profiles p on p.user_id = f.fid and coalesce((p.share ->> 'sessions')::boolean, false)
  join public.records r on r.user_id = f.fid and r.kind = 'session'
  where not r.deleted and r.data is not null
    and coalesce((r.data ->> 'imported')::boolean, false) = false
  order by (r.data ->> 'start')::bigint desc
  limit least(greatest(lim, 1), 100);
$$;

-- 9. Statistiek per vriend: totaal, laatste workout, workouts per week (52 weken, oud → nieuw)
create or replace function public.friend_stats() returns table (user_id uuid, total int, last_start bigint, weeks int[])
language sql stable security definer set search_path = '' as $$
  with f as (
    select case when fr.requester = auth.uid() then fr.addressee else fr.requester end as fid
    from public.friendships fr
    where fr.status = 'accepted' and (fr.requester = auth.uid() or fr.addressee = auth.uid())
  ),
  s as (
    select r.user_id, (r.data ->> 'start')::bigint as st
    from f
    join public.profiles p on p.user_id = f.fid and coalesce((p.share ->> 'sessions')::boolean, false)
    join public.records r on r.user_id = f.fid and r.kind = 'session'
    where not r.deleted and r.data is not null and coalesce((r.data ->> 'imported')::boolean, false) = false
  ),
  w as (
    select s.user_id, date_trunc('week', to_timestamp(s.st / 1000.0) at time zone 'Europe/Amsterdam') as wk, count(*)::int as c
    from s group by 1, 2
  )
  select f.fid,
    (select count(*)::int from s where s.user_id = f.fid),
    (select max(s.st) from s where s.user_id = f.fid),
    array(
      select coalesce((select w.c from w where w.user_id = f.fid and w.wk = g), 0)
      from generate_series(
        date_trunc('week', now() at time zone 'Europe/Amsterdam') - interval '51 weeks',
        date_trunc('week', now() at time zone 'Europe/Amsterdam'),
        interval '1 week') as g
      order by g)
  from f;
$$;

-- 10. Foto's van vrienden bekijken (alleen als zij foto's delen)
drop policy if exists "photos: vrienden lezen" on storage.objects;
create policy "photos: vrienden lezen" on storage.objects
  for select to authenticated using (bucket_id = 'photos' and public.can_view_folder((storage.foldername(name))[1], 'photo'));

-- 11. Rechten op de functies
revoke all on function public.is_related(uuid) from public, anon;
revoke all on function public.is_friend(uuid) from public, anon;
revoke all on function public.can_view(uuid, text) from public, anon;
revoke all on function public.can_view_folder(text, text) from public, anon;
revoke all on function public.find_profile(text) from public, anon;
revoke all on function public.friend_data(uuid, text[]) from public, anon;
revoke all on function public.friend_feed(int) from public, anon;
revoke all on function public.friend_stats() from public, anon;
grant execute on function public.is_related(uuid) to authenticated;
grant execute on function public.is_friend(uuid) to authenticated;
grant execute on function public.can_view(uuid, text) to authenticated;
grant execute on function public.can_view_folder(text, text) to authenticated;
grant execute on function public.find_profile(text) to authenticated;
grant execute on function public.friend_data(uuid, text[]) to authenticated;
grant execute on function public.friend_feed(int) to authenticated;
grant execute on function public.friend_stats() to authenticated;
