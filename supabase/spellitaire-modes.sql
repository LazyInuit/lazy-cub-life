-- Safe to run again. Run after spellitaire.sql.
-- Spellitaire modes: every mode has Easy and Hard, and each keeps its own scores:
--   Classic   'solitaire' and 'solitaire-hard' (unchanged, existing scores stay)
--   Flipflop  'solitaire-flipflop' and 'solitaire-flipflop-hard'
--   Pyramid   'solitaire-pyramid' and 'solitaire-pyramid-hard'
--   FreeCell  'solitaire-freecell' and 'solitaire-freecell-hard'
--   Spider    'solitaire-spider' and 'solitaire-spider-hard'
--   Golf      'solitaire-golf' and 'solitaire-golf-hard'
-- The Spellitaire board adds a player's best in every one of them, and so does the overall board.
-- A new mode later only needs its two keys added to spellitaire_keys() and the scores check.
-- Each function below is its latest version from spellitaire.sql, now reading the key list.
-- Balances, saves and scores are not touched.

-- Every Spellitaire leaderboard key, in one place.
create or replace function public.spellitaire_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'solitaire', 'solitaire-hard',
    'solitaire-flipflop', 'solitaire-flipflop-hard',
    'solitaire-pyramid', 'solitaire-pyramid-hard',
    'solitaire-freecell', 'solitaire-freecell-hard',
    'solitaire-spider', 'solitaire-spider-hard',
    'solitaire-golf', 'solitaire-golf-hard'
  ]::text[];
$$;

-- Scores table: allow the new keys.
do $$
declare
  check_name text;
begin
  for check_name in
    select conname from pg_constraint
    where conrelid = 'public.leaderboard_scores'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%game%'
  loop
    execute format('alter table public.leaderboard_scores drop constraint %I', check_name);
  end loop;
end;
$$;

alter table public.leaderboard_scores
  add constraint leaderboard_scores_game_check
  check (game in (
    'flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river',
    'solitaire', 'solitaire-hard', 'solitaire-flipflop', 'solitaire-flipflop-hard',
    'solitaire-pyramid', 'solitaire-pyramid-hard',
    'solitaire-freecell', 'solitaire-freecell-hard',
    'solitaire-spider', 'solitaire-spider-hard',
    'solitaire-golf', 'solitaire-golf-hard'
  ));

-- From spellitaire.sql. Any Spellitaire game above 20,000 is not real.
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
  if p_game not in ('flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river')
    and not (p_game = any(public.spellitaire_keys())) then
    raise exception 'Bad game';
  end if;
  if p_score is null or p_score <= 0 or p_score > 9999999 then
    return;
  end if;
  if p_game in ('bubble', 'river') and p_score > 1000000 then
    return;
  end if;
  if p_game = any(public.spellitaire_keys()) and p_score > 20000 then
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

-- From spellitaire.sql. Every Spellitaire key counts toward the overall board.
create or replace function public.leaderboard_points(p_game text, p_score integer)
returns integer
language sql
immutable
as $$
  select case
    when (p_game in ('flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river')
        or p_game = any(public.spellitaire_keys()))
      and p_score > 0
      and p_score <= 9999999
    then p_score
    else 0
  end;
$$;

-- From spellitaire.sql (no sign-in check, so demo players can read boards). The Spellitaire board adds
-- each player's best in every mode and difficulty.
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
  if p_game not in ('overall', 'flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river', 'solitaire') then
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
        and (
          p_game = 'overall'
          or s.game = p_game
          or (p_game = 'solitaire' and s.game = any(public.spellitaire_keys()))
        )
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

-- From spellitaire.sql. Players ahead: their board total beats this score. On the Spellitaire board
-- that total is their best in every mode and difficulty added together.
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
  if p_game not in ('flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river', 'solitaire') then
    raise exception 'Bad game';
  end if;
  return jsonb_build_object(
    'week', 1 + (
      select count(*)::integer
      from (
        select bests.user_id
        from (
          select s.user_id, s.game, max(s.score) as best
          from public.leaderboard_scores s
          join public.profiles p on p.id = s.user_id
          where (s.game = p_game or (p_game = 'solitaire' and s.game = any(public.spellitaire_keys())))
            and s.week_start = week
            and not coalesce(p.banned, false)
            and coalesce(p.username, '') <> ''
          group by s.user_id, s.game
        ) bests
        group by bests.user_id
        having sum(bests.best) > target_score
      ) ahead
    ),
    'all', 1 + (
      select count(*)::integer
      from (
        select bests.user_id
        from (
          select s.user_id, s.game, max(s.score) as best
          from public.leaderboard_scores s
          join public.profiles p on p.id = s.user_id
          where (s.game = p_game or (p_game = 'solitaire' and s.game = any(public.spellitaire_keys())))
            and not coalesce(p.banned, false)
            and coalesce(p.username, '') <> ''
          group by s.user_id, s.game
        ) bests
        group by bests.user_id
        having sum(bests.best) > target_score
      ) ahead
    )
  );
end;
$$;

revoke all on function public.spellitaire_keys() from public, anon, authenticated;
revoke all on function public.submit_score(text, integer) from public, anon, authenticated;
revoke all on function public.leaderboard_points(text, integer) from public, anon, authenticated;
revoke all on function public.leaderboard(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.leaderboard_place(text, integer) from public, anon, authenticated;

grant execute on function public.submit_score(text, integer) to authenticated;
grant execute on function public.leaderboard(text, text, integer, integer) to anon, authenticated;
grant execute on function public.leaderboard_place(text, integer) to anon, authenticated;
