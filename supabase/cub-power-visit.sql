-- Safe to run again. Run after cub-power.sql.
-- Lets a home visit show the player's Cub Power and its breakdown (badges, level, streak, leaderboard reward).
-- Their leftover bonus coins stay private. Readable without signing in, like player_profile,
-- because demo players can visit too.

create or replace function public.player_cub_power(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  needle text := lower(btrim(coalesce(p_username, '')));
  target uuid;
begin
  if needle = '' then
    return null;
  end if;
  select p.id into target
  from public.profiles p
  where lower(p.username) = needle
    and not coalesce(p.banned, false)
  limit 1;
  if target is null then
    return null;
  end if;
  return public.cub_power_of(target) - 'coinBonusHundredths' - 'serverNow';
end;
$$;

revoke all on function public.player_cub_power(text) from public, anon, authenticated;
grant execute on function public.player_cub_power(text) to anon, authenticated;
