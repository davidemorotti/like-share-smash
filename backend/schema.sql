-- Like, Share, Smash: names and Trending for the self-hosted Supabase instance.
-- Run once in Supabase Studio → SQL editor. Safe to re-run.

create table if not exists public.names (
  key  text primary key check (key ~ '^[a-z0-9_.-]{2,32}$'),
  uid  uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 16),
  at   timestamptz not null default now()
);

create table if not exists public.board (
  uid   uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name  text not null check (char_length(name) between 1 and 16),
  owed  bigint not null default 0 check (owed >= 0),
  deeds integer not null default 0 check (deeds >= 0),
  views bigint not null default 0 check (views >= 0),
  runs  integer not null default 0 check (runs >= 0),
  best  bigint not null default 0 check (best >= 0),
  at    timestamptz not null default now()
);
create index if not exists board_views_idx on public.board (views desc);

alter table public.names enable row level security;
alter table public.board enable row level security;

drop policy if exists names_read on public.names;
create policy names_read on public.names for select using (true);

drop policy if exists board_read on public.board;
create policy board_read on public.board for select using (true);
drop policy if exists board_insert on public.board;
create policy board_insert on public.board for insert to authenticated with check (uid = auth.uid());
drop policy if exists board_update on public.board;
create policy board_update on public.board for update to authenticated using (uid = auth.uid()) with check (uid = auth.uid());

-- Names are only written through this function: first come, first served, one name per player.
create or replace function public.claim_name(p_key text, p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  owner uuid;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select uid into owner from names where key = p_key for update;
  if owner is not null and owner <> me then
    return false;
  end if;
  delete from names where uid = me and key <> p_key;
  insert into names (key, uid, name) values (p_key, me, p_name)
    on conflict (key) do update set name = excluded.name, at = now()
    where names.uid = me;
  select uid into owner from names where key = p_key;
  if owner = me then
    update board set name = p_name where uid = me;
  end if;
  return owner = me;
end;
$$;

revoke all on function public.claim_name(text, text) from public, anon;
grant execute on function public.claim_name(text, text) to authenticated;

-- Live Trending updates.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'board') then
    alter publication supabase_realtime add table public.board;
  end if;
end $$;
