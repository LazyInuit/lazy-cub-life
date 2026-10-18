-- Safe to run again. Do not run coins.sql or leaderboard.sql again.
-- Lets demo players (not signed in) read the leaderboards, see last week's
-- winners, and see where a demo score would have placed. Everything here only
-- reads. Saving scores, prizes, and coins still need a signed-in player.

-- Same as the leaderboard in leaderboard.sql, without the sign-in check.
create or replace function public.leaderboard(
  p_game text,
  p_period text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  week date := public.eastern_week_start();
  page_limit integer := least(greatest(coalesce(p_limit, 20), 1), 20);
  page_offset integer := least(greatest(coalesce(p_offset, 0), 0), 5000);
begin
  if p_game not in ('overall', 'flight', 'match', 'dojo', 'archer', 'hoops') then
    raise exception 'Bad game';
  end if;
  if p_period not in ('week', 'all') then
    raise exception 'Bad period';
  end if;
  return (
    with bests as (
      select
        s.user_id,
        s.game,
        public.leaderboard_points(s.game, max(s.score)) as points
      from public.leaderboard_scores s
      where (p_period = 'all' or s.week_start = week)
        and (p_game = 'overall' or s.game = p_game)
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
        p.username,
        t.score,
        row_number() over (order by t.score desc, p.username) as place
      from totals t
      join public.profiles p on p.id = t.user_id
      where not coalesce(p.banned, false)
        and coalesce(p.username, '') <> ''
    )
    select jsonb_build_object(
      'rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'rank', ranked.place::integer,
            'username', ranked.username,
            'score', ranked.score,
            'mine', coalesce(ranked.user_id = auth.uid(), false)
          )
          order by ranked.place
        )
        from ranked
        where ranked.place > page_offset
          and ranked.place <= page_offset + page_limit
      ), '[]'::jsonb),
      'mine', (
        select jsonb_build_object(
          'rank', ranked.place::integer,
          'username', ranked.username,
          'score', ranked.score
        )
        from ranked
        where ranked.user_id = auth.uid()
      ),
      'total', (select count(*)::integer from ranked),
      'resetsAt', public.eastern_week_resets_at(),
      'serverNow', clock_timestamp()
    )
  );
end;
$$;

revoke all on function public.leaderboard(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.leaderboard(text, text, integer, integer) to anon, authenticated;

-- The place a score would take on one game's This Week and All Time boards.
create or replace function public.leaderboard_place(p_game text, p_score integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  week date := public.eastern_week_start();
  target_score integer := greatest(coalesce(p_score, 0), 0);
begin
  if p_game not in ('flight', 'match', 'dojo', 'archer', 'hoops') then
    raise exception 'Bad game';
  end if;
  return jsonb_build_object(
    'week', 1 + (
      select count(*)::integer
      from (
        select s.user_id
        from public.leaderboard_scores s
        join public.profiles p on p.id = s.user_id
        where s.game = p_game
          and s.week_start = week
          and not coalesce(p.banned, false)
          and coalesce(p.username, '') <> ''
        group by s.user_id
        having max(s.score) > target_score
      ) ahead
    ),
    'all', 1 + (
      select count(*)::integer
      from (
        select s.user_id
        from public.leaderboard_scores s
        join public.profiles p on p.id = s.user_id
        where s.game = p_game
          and not coalesce(p.banned, false)
          and coalesce(p.username, '') <> ''
        group by s.user_id
        having max(s.score) > target_score
      ) ahead
    )
  );
end;
$$;

revoke all on function public.leaderboard_place(text, integer) from public, anon, authenticated;
grant execute on function public.leaderboard_place(text, integer) to anon, authenticated;

-- Last week's overall top three, as already paid by settle_weekly_overall_prize.
create or replace function public.last_weekly_winners()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('place', w.place, 'username', w.username) order by w.place),
    '[]'::jsonb
  )
  from public.weekly_overall_prizes w
  where w.week_start = public.eastern_week_start() - 7;
$$;

revoke all on function public.last_weekly_winners() from public, anon, authenticated;
grant execute on function public.last_weekly_winners() to anon, authenticated;
