-- Safe to run again. Run after spellitaire-modes.sql. Reads only; changes no scores.
-- spellitaire_board(): a Spellitaire leaderboard over any set of mode-and-difficulty keys, this week
-- or all time, for the board on Spellitaire's choose-a-game screen. Each player's best in each key is
-- added together, so one key is a single mode and difficulty (such as 'solitaire-pyramid-hard'), a
-- mode's Easy and Hard keys give its total, and every key gives the overall Spellitaire total.
-- Same shape as leaderboard(). Readable without signing in, like the other boards.
drop function if exists public.spellitaire_board(text, text, integer, integer);

create or replace function public.spellitaire_board(
  p_keys text[],
  p_period text,
  p_limit integer default 10,
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
  page_limit integer := least(greatest(coalesce(p_limit, 10), 1), 20);
  page_offset integer := least(greatest(coalesce(p_offset, 0), 0), 5000);
begin
  if p_keys is null or cardinality(p_keys) = 0 or cardinality(p_keys) > 20
    or not (p_keys <@ public.spellitaire_keys()) then
    raise exception 'Bad game';
  end if;
  if p_period not in ('week', 'all') then
    raise exception 'Bad period';
  end if;
  return (
    with bests as (
      select s.user_id, s.game, public.leaderboard_points(s.game, max(s.score)) as points
      from public.leaderboard_scores s
      where s.game = any(p_keys)
        and (p_period = 'all' or s.week_start = week)
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
        select jsonb_build_object('rank', ranked.place::integer, 'username', ranked.username, 'score', ranked.score)
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

revoke all on function public.spellitaire_board(text[], text, integer, integer) from public, anon, authenticated;
grant execute on function public.spellitaire_board(text[], text, integer, integer) to anon, authenticated;
