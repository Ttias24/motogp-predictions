-- Version av en säsongs publika tips: en kort kontrollsumma i stället för alla tips.
--
-- Efter tipsfristen läser sidan tipsen ur säkerhetskopian på GitHub (data/picks-<år>.json)
-- och frågar bara databasen om kopian fortfarande stämmer. Det håller datatrafiken från
-- databasen nära noll även med hundratals spelare och besökare.
--
-- Summan räknas på exakt det som season_overview visar efter fristen (godkända spelare med
-- namn, deras tips och poängsystemet). Före fristen returneras null: då är tipsen hemliga.
create or replace function public.season_picks_version(p_year int)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.seasons;
begin
  select * into s from public.seasons where year = p_year;
  if not found or s.closes_at is null or now() < s.closes_at then
    return null;
  end if;
  return md5(
    coalesce(s.scoring::text, '') || '|' || s.closes_at::text || '|' ||
    coalesce((
      select string_agg(p.id::text || ':' || p.name || ':' || pk.data::text, '|' order by p.created_at, p.id)
        from public.players p
        join public.picks pk on pk.player_id = p.id
       where p.season = s.year and p.approved and p.name is not null
    ), '')
  );
end;
$$;

revoke execute on function public.season_picks_version(int) from public, anon, authenticated;
grant execute on function public.season_picks_version(int) to anon, authenticated;
