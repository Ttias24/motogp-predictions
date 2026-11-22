-- MotoGP-tipset: inlämning av tips med personliga inbjudningslänkar.
--
-- Säkerhetsmodell
--  * Tabellerna är stängda för besökare (anon). Allt som besökare får göra går via
--    funktionerna nedan, som kontrollerar inbjudningskoden och tidsfristen på servern.
--  * En spelare identifieras av en slumpad kod (128 bitar) i sin personliga länk.
--    Bara en SHA-256-hash av koden sparas i databasen.
--  * Andras tips syns först när fristen har gått ut.
--  * Administratörer (tabellen admins) loggar in med e-postlänk och får läsa/ändra allt.
--  * Inga IP-adresser eller e-postadresser för spelare sparas.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tabeller
create table if not exists public.seasons (
  year       int primary key,
  opens_at   timestamptz not null,
  closes_at  timestamptz not null,
  scoring    jsonb not null default '{"exactPosition": 2, "insideTop5": 1}',
  -- Delad inbjudningslänk: bara en hash av koden sparas. Ny kod = gamla länken slutar fungera.
  join_code_hash text unique,
  -- true = nya spelare via delad länk måste godkännas av admin innan de syns.
  join_approval  boolean not null default false,
  check (closes_at > opens_at)
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  season      int  not null references public.seasons (year) on delete cascade,
  -- Visningsnamnet väljer spelaren själv (vid anmälan eller när tipsen lämnas).
  name        text check (char_length(name) between 1 and 40),
  -- Admins egen anteckning för personliga inbjudningar (syns aldrig för andra).
  label       text check (char_length(label) <= 60),
  token_hash  text not null unique,
  approved    boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists players_season_idx on public.players (season);
-- Samma namn får bara finnas en gång per säsong (oavsett stora/små bokstäver).
create unique index if not exists players_season_name_idx on public.players (season, lower(name));

create table if not exists public.picks (
  player_id     uuid primary key references public.players (id) on delete cascade,
  data          jsonb not null,
  submitted_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- hjälpfunktioner
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public._hash_token(p_token text)
returns text
language sql immutable set search_path = ''
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- Kontrollerar och städar ett inskickat tips. Felkoder översätts i webbsidan.
create or replace function public._clean_picks(p jsonb)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  cls   text;
  c     jsonb;
  t     jsonb;
  n     text;
  seen  text[];
  bu    text;
  bk    text;
  result jsonb := '{}'::jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_picks';
  end if;
  foreach cls in array array['MotoGP', 'Moto2', 'Moto3'] loop
    c := p -> cls;
    if c is null or jsonb_typeof(c) <> 'object' then
      raise exception 'incomplete:%', cls;
    end if;
    t := c -> 'top5';
    if t is null or jsonb_typeof(t) <> 'array' or jsonb_array_length(t) <> 5 then
      raise exception 'incomplete:%', cls;
    end if;
    seen := '{}';
    for n in select btrim(x) from jsonb_array_elements_text(t) as x loop
      if n = '' or char_length(n) > 60 then
        raise exception 'incomplete:%', cls;
      end if;
      if lower(n) = any (seen) then
        raise exception 'duplicate:%', cls;
      end if;
      seen := seen || lower(n);
    end loop;
    bu := nullif(btrim(coalesce(c ->> 'backup', '')), '');
    bk := nullif(btrim(coalesce(c ->> 'bowling', '')), '');
    if bu is null or bk is null or char_length(bu) > 60 or char_length(bk) > 60 then
      raise exception 'incomplete:%', cls;
    end if;
    if lower(bu) = any (seen) then
      raise exception 'backup_in_top5:%', cls;
    end if;
    result := result || jsonb_build_object(cls, jsonb_build_object(
      'top5', (select jsonb_agg(btrim(x) order by i)
                 from jsonb_array_elements_text(t) with ordinality as e(x, i)),
      'backup', bu,
      'bowling', bk,
      'backupActivated', null
    ));
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------- för spelare (anon)
-- Hämtar spelarens egna uppgifter och tips via inbjudningskoden.
create or replace function public.my_entry(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  pl public.players;
  s  public.seasons;
  pk public.picks;
begin
  select * into pl from public.players where token_hash = public._hash_token(p_token);
  if not found then
    raise exception 'bad_token';
  end if;
  select * into s from public.seasons where year = pl.season;
  select * into pk from public.picks where player_id = pl.id;
  return jsonb_build_object(
    'id', pl.id, 'name', pl.name, 'season', pl.season, 'approved', pl.approved,
    'opensAt', s.opens_at, 'closesAt', s.closes_at, 'now', now(),
    'picks', pk.data, 'updatedAt', pk.updated_at
  );
end;
$$;

-- Gå med via den delade inbjudningslänken. Skapar en spelare och returnerar
-- spelarens personliga kod (som sparas i webbläsaren).
create or replace function public.join_season(p_code text, p_name text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  s    public.seasons;
  nm   text := btrim(coalesce(p_name, ''));
  tok  text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  select * into s from public.seasons where join_code_hash = public._hash_token(p_code);
  if not found then
    raise exception 'bad_join_code';
  end if;
  if now() < s.opens_at then
    raise exception 'not_open';
  end if;
  if now() >= s.closes_at then
    raise exception 'closed';
  end if;
  if char_length(nm) < 1 or char_length(nm) > 40 then
    raise exception 'bad_name';
  end if;
  if exists (select 1 from public.players where season = s.year and lower(name) = lower(nm)) then
    raise exception 'name_taken';
  end if;
  insert into public.players (season, name, token_hash, approved)
  values (s.year, nm, public._hash_token(tok), not s.join_approval);
  return jsonb_build_object('token', tok, 'name', nm, 'season', s.year, 'approved', not s.join_approval);
end;
$$;

-- Sparar (eller ändrar) spelarens tips och visningsnamn – bara medan tipsperioden är öppen.
create or replace function public.save_my_picks(p_token text, p_data jsonb, p_name text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  pl public.players;
  s  public.seasons;
  cleaned jsonb;
  nm text := btrim(coalesce(p_name, ''));
begin
  select * into pl from public.players where token_hash = public._hash_token(p_token);
  if not found then
    raise exception 'bad_token';
  end if;
  select * into s from public.seasons where year = pl.season;
  if now() < s.opens_at then
    raise exception 'not_open';
  end if;
  if now() >= s.closes_at then
    raise exception 'closed';
  end if;
  if char_length(nm) < 1 or char_length(nm) > 40 then
    raise exception 'bad_name';
  end if;
  if exists (select 1 from public.players
              where season = pl.season and id <> pl.id and lower(name) = lower(nm)) then
    raise exception 'name_taken';
  end if;
  cleaned := public._clean_picks(p_data);
  update public.players set name = nm where id = pl.id;
  insert into public.picks (player_id, data)
  values (pl.id, cleaned)
  on conflict (player_id) do update set data = excluded.data, updated_at = now();
  return public.my_entry(p_token);
end;
$$;

-- Aktiverar spelarens backup i en klass. Tidpunkten sätts av servern och kan inte ångras.
-- Backupen räknas från första runda som startar efter aktiveringen.
create or replace function public.activate_my_backup(p_token text, p_class text, p_replaces text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  pl public.players;
  s  public.seasons;
  pk public.picks;
  c  jsonb;
begin
  select * into pl from public.players where token_hash = public._hash_token(p_token);
  if not found then
    raise exception 'bad_token';
  end if;
  select * into s from public.seasons where year = pl.season;
  if now() < s.closes_at then
    raise exception 'not_started';
  end if;
  select * into pk from public.picks where player_id = pl.id for update;
  if not found then
    raise exception 'no_picks';
  end if;
  c := pk.data -> p_class;
  if c is null then
    raise exception 'bad_class';
  end if;
  if coalesce(c ->> 'backup', '') = '' then
    raise exception 'no_backup';
  end if;
  if jsonb_typeof(c -> 'backupActivated') = 'object' then
    raise exception 'already_activated';
  end if;
  if not exists (select 1 from jsonb_array_elements_text(c -> 'top5') as x where lower(x) = lower(btrim(p_replaces))) then
    raise exception 'bad_replaces';
  end if;
  update public.picks
     set data = jsonb_set(data, array[p_class, 'backupActivated'],
                          jsonb_build_object('replaces', btrim(p_replaces), 'at', now())),
         updated_at = now()
   where player_id = pl.id;
  return public.my_entry(p_token);
end;
$$;

-- Översikt för alla besökare: vilka som är med och har lämnat tips.
-- Själva tipsen visas först när tipsperioden har stängt.
create or replace function public.season_overview(p_year int)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.seasons;
begin
  select * into s from public.seasons where year = p_year;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'year', s.year, 'opensAt', s.opens_at, 'closesAt', s.closes_at,
    'scoring', s.scoring, 'now', now(),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name,
               'submitted', pk.player_id is not null,
               'picks', case when now() >= s.closes_at then pk.data end
             ) order by p.created_at)
        from public.players p
        left join public.picks pk on pk.player_id = p.id
       where p.season = s.year and p.approved and p.name is not null
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------- för admin
-- Personlig inbjudan. Spelaren väljer själv sitt visningsnamn när tipsen lämnas;
-- p_label är bara en anteckning för admin (t.ex. vem länken skickades till).
create or replace function public.admin_create_player(p_season int, p_label text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  tok text := encode(extensions.gen_random_bytes(16), 'hex');
  pid uuid;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  insert into public.players (season, label, token_hash)
  values (p_season, nullif(btrim(coalesce(p_label, '')), ''), public._hash_token(tok))
  returning id into pid;
  return jsonb_build_object('id', pid, 'token', tok);
end;
$$;

-- Ny delad inbjudningskod för en säsong (den gamla länken slutar fungera).
create or replace function public.admin_new_join_code(p_season int)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  code text := encode(extensions.gen_random_bytes(9), 'hex');
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  update public.seasons set join_code_hash = public._hash_token(code) where year = p_season;
  if not found then
    raise exception 'not_found';
  end if;
  return code;
end;
$$;

-- Ny länk för en spelare (den gamla slutar fungera).
create or replace function public.admin_new_token(p_player uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  tok text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  update public.players set token_hash = public._hash_token(tok) where id = p_player;
  if not found then
    raise exception 'not_found';
  end if;
  return tok;
end;
$$;

-- ---------------------------------------------------------------- rättigheter
alter table public.seasons enable row level security;
alter table public.admins  enable row level security;
alter table public.players enable row level security;
alter table public.picks   enable row level security;

drop policy if exists admin_all on public.seasons;
drop policy if exists admin_all on public.admins;
drop policy if exists admin_all on public.players;
drop policy if exists admin_all on public.picks;
create policy admin_all on public.seasons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.admins  for select to authenticated using (public.is_admin());
create policy admin_all on public.players for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.picks   for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.seasons, public.admins, public.players, public.picks from anon;

revoke execute on function public.is_admin(), public._hash_token(text), public._clean_picks(jsonb),
  public.my_entry(text), public.save_my_picks(text, jsonb, text), public.activate_my_backup(text, text, text),
  public.season_overview(int), public.join_season(text, text),
  public.admin_create_player(int, text), public.admin_new_token(uuid), public.admin_new_join_code(int)
  from public, anon, authenticated;

grant execute on function public.my_entry(text), public.save_my_picks(text, jsonb, text),
  public.activate_my_backup(text, text, text), public.season_overview(int), public.join_season(text, text)
  to anon, authenticated;
grant execute on function public.is_admin(), public.admin_create_player(int, text), public.admin_new_token(uuid),
  public.admin_new_join_code(int)
  to authenticated;
