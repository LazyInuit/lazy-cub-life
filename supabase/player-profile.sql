-- Safe to run again. Only adds player_profile. Do not run coins.sql or leaderboard.sql again.
-- The leaderboard profile card and home visits read one player through this.
-- Returns level xp, the all-time overall score and place, and only the save
-- fields a visit draws: outfits, owned traits, and the Halloween pumpkin.
-- Cub Cash, needs, daily tasks and the rest of the save are never returned.

create or replace function public.player_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  needle text := lower(btrim(coalesce(p_username, '')));
  target public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if needle = '' then
    return null;
  end if;

  select p.*
  into target
  from public.profiles p
  where lower(p.username) = needle
    and not coalesce(p.banned, false)
  limit 1;

  if not found then
    return null;
  end if;

  return (
    with bests as (
      select
        s.user_id,
        s.game,
        public.leaderboard_points(s.game, max(s.score)) as points
      from public.leaderboard_scores s
      group by s.user_id, s.game
    ),
    totals as (
      select user_id, sum(points)::integer as score
      from bests
      group by user_id
      having sum(points) > 0
    ),
    ranked as (
      select
        t.user_id,
        t.score,
        row_number() over (order by t.score desc, p.username) as place
      from totals t
      join public.profiles p on p.id = t.user_id
      where not coalesce(p.banned, false)
        and coalesce(p.username, '') <> ''
    )
    select jsonb_build_object(
      'username', target.username,
      'xp', case
        when coalesce(target.save->>'xp', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then (target.save->>'xp')::numeric
        else 0
      end,
      'overall', coalesce((select r.score from ranked r where r.user_id = target.id), 0),
      'rank', (select r.place::integer from ranked r where r.user_id = target.id),
      'room', jsonb_build_object(
        'outfits', coalesce(target.save->'outfits', '{}'::jsonb),
        'unlockedTraits', coalesce(target.save->'unlockedTraits', '[]'::jsonb),
        'wardrobePurchaseReset', target.save->'wardrobePurchaseReset',
        'halloween', coalesce(target.save->'halloween' = 'true'::jsonb, false)
      )
    )
  );
end;
$$;

revoke all on function public.player_profile(text) from public, anon, authenticated;
grant execute on function public.player_profile(text) to authenticated;
