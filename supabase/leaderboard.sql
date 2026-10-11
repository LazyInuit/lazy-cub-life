-- Run once in the Supabase SQL editor.
-- Weeks start Monday in US Eastern time.
-- Older bests already stored on accounts count for all time, not for this week.

alter table public.profiles add column if not exists banned boolean not null default false;

create table if not exists public.leaderboard_scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null check (game in ('flight', 'match', 'dojo', 'archer', 'hoops')),
  week_start date not null,
  score integer not null check (score > 0 and score <= 9999999),
  primary key (user_id, game, week_start)
);

alter table public.leaderboard_scores enable row level security;
revoke all on public.leaderboard_scores from anon, authenticated;

create or replace function public.eastern_week_start(at_time timestamptz default clock_timestamp())
returns date
language sql
stable
as $$
  select (timezone('America/New_York', at_time))::date
    - (extract(isodow from (timezone('America/New_York', at_time))::date)::integer - 1);
$$;

create or replace function public.submit_score(p_game text, p_score integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  week date;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if p_game not in ('flight', 'match', 'dojo', 'archer', 'hoops') then
    raise exception 'Bad game';
  end if;
  if p_score is null or p_score <= 0 or p_score > 9999999 then
    return;
  end if;
  if exists (select 1 from public.profiles where id = uid and banned) then
    raise exception 'This account is banned';
  end if;
  week := public.eastern_week_start();
  insert into public.leaderboard_scores (user_id, game, week_start, score)
  values (uid, p_game, week, p_score)
  on conflict (user_id, game, week_start)
  do update set score = greatest(public.leaderboard_scores.score, excluded.score)
  where public.leaderboard_scores.score < excluded.score;
end;
$$;

-- Raw points today. Change this body later to scale each game onto one range.
-- Stored scores stay as each player's best. Overall boards sum these points.
create or replace function public.leaderboard_points(p_game text, p_score integer)
returns integer
language sql
immutable
as $$
  select case
    when p_game in ('flight', 'match', 'dojo', 'archer', 'hoops')
      and p_score > 0
      and p_score <= 9999999
    then p_score
    else 0
  end;
$$;

create or replace function public.eastern_week_resets_at(at_time timestamptz default clock_timestamp())
returns timestamptz
language sql
stable
as $$
  select ((public.eastern_week_start(at_time) + 7)::timestamp) at time zone 'America/New_York';
$$;

drop function if exists public.leaderboard(text, text);
drop function if exists public.leaderboard(text, text, integer, integer);

create function public.leaderboard(
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
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
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
            'mine', ranked.user_id = auth.uid()
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

revoke all on function public.eastern_week_start(timestamptz) from public, anon, authenticated;
revoke all on function public.eastern_week_resets_at(timestamptz) from public, anon, authenticated;
revoke all on function public.leaderboard_points(text, integer) from public, anon, authenticated;
revoke all on function public.submit_score(text, integer) from public, anon, authenticated;
revoke all on function public.leaderboard(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.submit_score(text, integer) to authenticated;
grant execute on function public.leaderboard(text, text, integer, integer) to authenticated;

insert into public.leaderboard_scores (user_id, game, week_start, score)
select p.id, g.game, date '2020-01-06', g.score
from public.profiles p
cross join lateral (
  select v.game, v.score
  from (
    values
      ('flight', case when coalesce(p.save->>'flightBest', '') ~ '^[0-9]+$' then (p.save->>'flightBest')::integer else 0 end),
      ('match', case when coalesce(p.save->>'matchBest', '') ~ '^[0-9]+$' then (p.save->>'matchBest')::integer else 0 end),
      ('dojo', case when coalesce(p.save->>'dojoBest', '') ~ '^[0-9]+$' then (p.save->>'dojoBest')::integer else 0 end),
      ('archer', case when coalesce(p.save->>'archerBest', '') ~ '^[0-9]+$' then (p.save->>'archerBest')::integer else 0 end),
      ('hoops', case when coalesce(p.save->>'hoopsBest', '') ~ '^[0-9]+$' then (p.save->>'hoopsBest')::integer else 0 end)
  ) as v(game, score)
) g
where g.score > 0
  and not coalesce(p.banned, false)
on conflict (user_id, game, week_start)
do update set score = greatest(public.leaderboard_scores.score, excluded.score);
