-- Safe to run again. Run after cub-power.sql and spellitaire-modes.sql.
-- Spellitaire badges: Spellitaire joins the badge games for Cub Power. Its badge goes by every
-- mode and difficulty's all-time best added together (12 boards), the same total the app uses.
-- Must match BADGE_RULES in src/game/profileArt.ts.
-- Balances, saves and scores are not touched.

insert into public.power_games (game, title, sort, bronze, silver, gold, platinum, diamond) values
  ('solitaire', 'Spellitaire', 8, 10000, 20000, 30000, 40000, 50000)
on conflict (game) do update
set title = excluded.title,
    sort = excluded.sort,
    bronze = excluded.bronze,
    silver = excluded.silver,
    gold = excluded.gold,
    platinum = excluded.platinum,
    diamond = excluded.diamond;

-- cub_power_of from cub-power.sql, with Spellitaire's best as the total of its boards.
create or replace function public.cub_power_of(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
  this_week date := public.eastern_week_start();
  games integer;
  points integer;
  badges jsonb;
  badge_power integer;
  xp_text text;
  lvl integer;
  level_power integer;
  last_day date;
  streak integer;
  streak_days integer := 0;
  streak_count integer := 0;
  base integer;
  after_streak integer;
  boost integer := 0;
  boost_place integer;
  total integer;
  remainder integer := 0;
begin
  with by_key as (
    select s.game, max(s.score) as best
    from public.leaderboard_scores s
    where s.user_id = p_user
    group by s.game
  ),
  bests as (
    select k.game, k.best
    from by_key k
    where not (k.game = any (public.spellitaire_keys()))
    union all
    select 'solitaire', coalesce(sum(k.best), 0)::integer
    from by_key k
    where k.game = any (public.spellitaire_keys())
  ),
  scored as (
    select g.game, g.title, g.sort, coalesce(b.best, 0) as best, public.power_badge_points(b.best, g) as points
    from public.power_games g
    left join bests b on b.game = g.game
    where g.released
  )
  select
    count(*)::integer,
    coalesce(sum(scored.points), 0)::integer,
    coalesce(jsonb_agg(
      jsonb_build_object('game', scored.game, 'title', scored.title, 'best', scored.best, 'points', scored.points)
      order by scored.sort, scored.game
    ), '[]'::jsonb)
  into games, points, badges
  from scored;
  badge_power := public.power_badge_power(points, games);

  select p.save->>'xp', p.coin_bonus_hundredths into xp_text, remainder
  from public.profiles p
  where p.id = p_user;
  lvl := public.power_level(case when coalesce(xp_text, '') ~ '^[0-9]+(\.[0-9]+)?$' then xp_text::numeric else 0 end);
  level_power := public.power_level_points(lvl);

  select s.last_day, s.streak into last_day, streak
  from public.login_streaks s
  where s.user_id = p_user;
  if last_day is not null and last_day >= today - 1 then
    streak_count := streak;
    streak_days := least(streak, 7);
  end if;

  base := badge_power + level_power;
  after_streak := public.power_after_streak(base, streak_days);

  select b.boost, b.place into boost, boost_place
  from public.weekly_power_boosts b
  where b.user_id = p_user and b.week_start = this_week - 7;
  boost := coalesce(boost, 0);

  total := after_streak + boost;
  return jsonb_build_object(
    'total', total,
    'percent', public.power_percent(total),
    'badgePoints', points,
    'activeGames', games,
    'badgePower', badge_power,
    'badges', badges,
    'level', lvl,
    'levelPower', level_power,
    'basePower', base,
    'streakCount', streak_count,
    'streakDays', streak_days,
    'streakMultiplier', 100 + streak_days * 5,
    'streakPower', after_streak,
    'lastLoginDay', to_char(last_day, 'YYYY-MM-DD'),
    'streakResetsAt', ((today + 1)::timestamp at time zone 'utc'),
    'boost', boost,
    'boostPlace', boost_place,
    'boostEndsAt', public.eastern_week_resets_at(),
    'coinBonusHundredths', coalesce(remainder, 0),
    'serverNow', clock_timestamp()
  );
end;
$$;

revoke all on function public.cub_power_of(uuid) from public, anon, authenticated;
