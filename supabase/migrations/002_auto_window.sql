-- Automatisk tipsperiod.
--  * Öppnar när MotoGP publicerat startlistan, stänger 23:59 (svensk tid) dagen före årets första
--    tävlingshelg. Datumen räknas ut av GitHub-jobbet och skickas hit med sync_season().
--  * opens_auto / closes_auto = true betyder att datumet följer reglerna. Ändrar admin ett datum
--    för hand blir det false och jobbet rör det inte längre.
--  * Ett datum kan vara tomt (okänt ännu): utan öppningsdatum är perioden inte öppen,
--    utan stängningsdatum finns ingen stängning ännu.

alter table public.seasons alter column opens_at drop not null;
alter table public.seasons alter column closes_at drop not null;
alter table public.seasons drop constraint if exists seasons_check;
alter table public.seasons add constraint seasons_window_check
  check (opens_at is null or closes_at is null or closes_at > opens_at);
alter table public.seasons add column if not exists opens_auto  boolean not null default true;
alter table public.seasons add column if not exists closes_auto boolean not null default true;

-- Nyckel för GitHub-jobbet. Bara en SHA-256-hash sparas; nyckeln själv finns som hemlighet i GitHub.
create table if not exists public.sync_keys (
  id        int primary key default 1 check (id = 1),
  key_hash  text not null
);
alter table public.sync_keys enable row level security;
revoke all on public.sync_keys from anon, authenticated;

create or replace function public.sync_season(p_key text, p_year int, p_opens timestamptz, p_closes timestamptz)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  s public.seasons;
begin
  if not exists (select 1 from public.sync_keys where key_hash = public._hash_token(p_key)) then
    raise exception 'bad_key';
  end if;
  select * into s from public.seasons where year = p_year for update;
  if not found then
    insert into public.seasons (year, opens_at, closes_at)
    values (p_year, p_opens, case when p_opens is null or p_closes > p_opens then p_closes end)
    returning * into s;
  else
    update public.seasons
       set opens_at  = case when opens_auto  then p_opens  else opens_at  end,
           closes_at = case when closes_auto then p_closes else closes_at end
     where year = p_year
    returning * into s;
  end if;
  return jsonb_build_object('year', s.year, 'opensAt', s.opens_at, 'closesAt', s.closes_at,
                            'opensAuto', s.opens_auto, 'closesAuto', s.closes_auto);
end;
$$;

-- ---- Funktionerna som kontrollerar perioden: hantera tomma datum ----
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
  if s.opens_at is null or now() < s.opens_at then
    raise exception 'not_open';
  end if;
  if s.closes_at is not null and now() >= s.closes_at then
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
  if s.opens_at is null or now() < s.opens_at then
    raise exception 'not_open';
  end if;
  if s.closes_at is not null and now() >= s.closes_at then
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
  if s.closes_at is null or now() < s.closes_at then
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

create or replace function public.season_overview(p_year int)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.seasons;
  closed boolean;
begin
  select * into s from public.seasons where year = p_year;
  if not found then
    return null;
  end if;
  closed := s.closes_at is not null and now() >= s.closes_at;
  return jsonb_build_object(
    'year', s.year, 'opensAt', s.opens_at, 'closesAt', s.closes_at,
    'scoring', s.scoring, 'now', now(),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name,
               'submitted', pk.player_id is not null,
               'picks', case when closed then pk.data end
             ) order by p.created_at)
        from public.players p
        left join public.picks pk on pk.player_id = p.id
       where p.season = s.year and p.approved and p.name is not null
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.sync_season(text, int, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.sync_season(text, int, timestamptz, timestamptz) to anon;
