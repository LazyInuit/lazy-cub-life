-- Safe to run again. Do not run coins.sql, leaderboard.sql, admin.sql, bubble-blast.sql or lazy-river.sql again:
-- they would put back the older grant_game_coins, claim_daily_task, roll_daily_bonus and purchase_trait.
--
-- Cub Power: a rating built from badges, level, a daily login streak and last week's overall board.
-- Every 100 Cub Power gives +1% Cub Cash from games and daily rewards, +1% game XP and 1% off
-- wardrobe styles, up to 10%. Worked out here on the server from:
--   badges        best all-time score per released game in leaderboard_scores, against power_games
--   level         the XP in the player's save (same level curve as the app)
--   login streak  login_streaks, counted in UTC days
--   weekly boost  weekly_power_boosts, the overall weekly top 10, valid for the following week
-- Leaderboard scores and the weekly Cub Cash prize are not touched.

-- Released games and the best score each badge needs. Must match BADGE_RULES in src/game/profileArt.ts.
-- To launch a game: add its row (released = true). To retire one: set released = false.
create table if not exists public.power_games (
  game text primary key,
  title text not null,
  sort integer not null default 0,
  released boolean not null default true,
  bronze integer not null,
  silver integer not null,
  gold integer not null,
  platinum integer not null,
  diamond integer not null,
  constraint power_games_tiers_check check (
    0 < bronze and bronze <= silver and silver <= gold and gold <= platinum and platinum <= diamond
  )
);

alter table public.power_games enable row level security;
revoke all on public.power_games from anon, authenticated;

-- Running this again keeps each game's released flag.
insert into public.power_games (game, title, sort, bronze, silver, gold, platinum, diamond) values
  ('flight', 'Kovu''s Space Dash', 1, 20, 50, 100, 150, 250),
  ('match', 'Pride Pairs', 2, 130, 150, 180, 200, 220),
  ('archer', 'Cupid Archery', 3, 2500, 5000, 15000, 30000, 60000),
  ('dojo', 'Ninja Cub Dojo', 4, 5000, 10000, 25000, 50000, 100000),
  ('hoops', 'Lazy Hoops', 5, 5000, 15000, 40000, 80000, 120000),
  ('bubble', 'Bubble Blast', 6, 5000, 10000, 20000, 35000, 50000),
  ('river', 'Lazy River', 7, 1500, 3000, 5000, 10000, 15000)
on conflict (game) do update
set title = excluded.title,
    sort = excluded.sort,
    bronze = excluded.bronze,
    silver = excluded.silver,
    gold = excluded.gold,
    platinum = excluded.platinum,
    diamond = excluded.diamond;

-- One row per player: the last UTC day they checked in and how many days in a row that makes.
create table if not exists public.login_streaks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_day date not null,
  streak integer not null default 1 check (streak >= 1)
);

alter table public.login_streaks enable row level security;
revoke all on public.login_streaks from anon, authenticated;

-- Weeks whose top 10 has been recorded, so each week is settled once.
create table if not exists public.weekly_power_weeks (
  week_start date primary key,
  settled_at timestamptz not null default now()
);

-- week_start is the leaderboard week that was won. The boost counts during the week after it.
create table if not exists public.weekly_power_boosts (
  week_start date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  place integer not null,
  boost integer not null,
  primary key (week_start, user_id),
  unique (week_start, place),
  constraint weekly_power_boosts_place_check check (place between 1 and 10),
  constraint weekly_power_boosts_amount_check check (
    boost = case when place = 1 then 100 when place = 2 then 75 when place = 3 then 50 else 25 end
  )
);

alter table public.weekly_power_weeks enable row level security;
alter table public.weekly_power_boosts enable row level security;
revoke all on public.weekly_power_weeks from anon, authenticated;
revoke all on public.weekly_power_boosts from anon, authenticated;

-- Bonus Cub Cash not yet worth a whole coin, in hundredths. Players cannot write this column.
alter table public.profiles
  add column if not exists coin_bonus_hundredths integer not null default 0;

alter table public.profiles drop constraint if exists profiles_coin_bonus_range;
alter table public.profiles
  add constraint profiles_coin_bonus_range check (coin_bonus_hundredths between 0 and 99);

-- Same curve as levelProgress in src/game/progress.ts, including its level 99 cap.
create or replace function public.power_level(p_xp numeric)
returns integer
language plpgsql
immutable
as $$
declare
  safe numeric := greatest(0, round(coalesce(p_xp, 0) * 2) / 2);
  lvl integer := 1;
  spent numeric := 0;
  step numeric := 60;
begin
  while safe >= spent + step and lvl < 99 loop
    spent := spent + step;
    lvl := lvl + 1;
    step := 60 + (lvl - 1) * 30;
  end loop;
  return lvl;
end;
$$;

-- +5 a level to 25, +3 to 50, +2 to 100, then +1. Works past the current level cap.
create or replace function public.power_level_points(p_level integer)
returns integer
language sql
immutable
as $$
  select least(greatest(coalesce(p_level, 0), 0), 25) * 5
    + greatest(0, least(greatest(coalesce(p_level, 0), 0) - 25, 25)) * 3
    + greatest(0, least(greatest(coalesce(p_level, 0), 0) - 50, 50)) * 2
    + greatest(0, greatest(coalesce(p_level, 0), 0) - 100);
$$;

-- Highest badge only: Bronze 10, Silver 25, Gold 50, Platinum 75, Diamond 100.
create or replace function public.power_badge_points(p_best integer, g public.power_games)
returns integer
language sql
immutable
as $$
  select case
    when coalesce(p_best, 0) >= g.diamond then 100
    when coalesce(p_best, 0) >= g.platinum then 75
    when coalesce(p_best, 0) >= g.gold then 50
    when coalesce(p_best, 0) >= g.silver then 25
    when coalesce(p_best, 0) >= g.bronze then 10
    else 0
  end;
$$;

-- Badge points scaled so every game at Diamond is always 700, however many games there are.
create or replace function public.power_badge_power(p_points integer, p_games integer)
returns integer
language sql
immutable
as $$
  select case when coalesce(p_games, 0) <= 0 then 0 else greatest(coalesce(p_points, 0), 0) * 7 / p_games end;
$$;

-- Base Power times 1.05 per streak day (7 at most), rounded down.
create or replace function public.power_after_streak(p_base integer, p_streak_days integer)
returns integer
language sql
immutable
as $$
  select greatest(coalesce(p_base, 0), 0) * (100 + least(greatest(coalesce(p_streak_days, 0), 0), 7) * 5) / 100;
$$;

create or replace function public.power_weekly_boost(p_place integer)
returns integer
language sql
immutable
as $$
  select case
    when p_place = 1 then 100
    when p_place = 2 then 75
    when p_place = 3 then 50
    when p_place between 4 and 10 then 25
    else 0
  end;
$$;

-- 1% for every 100 Cub Power, 10% at most.
create or replace function public.power_percent(p_total integer)
returns integer
language sql
immutable
as $$
  select least(10, greatest(coalesce(p_total, 0), 0) / 100);
$$;

-- A wardrobe price after the discount, rounded up so the discount never goes past the percentage.
create or replace function public.power_discounted_price(p_price integer, p_percent integer)
returns integer
language sql
immutable
as $$
  select (p_price * (100 - least(greatest(coalesce(p_percent, 0), 0), 10)) + 99) / 100;
$$;

-- Today's check-in. Same day: nothing changes. The day after: one more. Any later: back to 1.
create or replace function public.power_check_in(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  insert into public.login_streaks as s (user_id, last_day, streak)
  values (p_user, today, 1)
  on conflict (user_id) do update
  set streak = case when s.last_day = today - 1 then s.streak + 1 else 1 end,
      last_day = today
  where s.last_day < today;
end;
$$;

-- Records last week's overall top 10 the first time anyone asks after the week ends.
-- Same ranking as the weekly prize: higher score, then username. Banned and unnamed players are skipped.
create or replace function public.settle_power_boosts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous date := public.eastern_week_start() - 7;
begin
  if exists (select 1 from public.weekly_power_weeks where week_start = previous) then
    return;
  end if;
  insert into public.weekly_power_weeks (week_start) values (previous) on conflict (week_start) do nothing;
  if not found then
    return;
  end if;
  insert into public.weekly_power_boosts (week_start, user_id, place, boost)
  with bests as (
    select
      s.user_id,
      s.game,
      public.leaderboard_points(s.game, max(s.score)) as points
    from public.leaderboard_scores s
    where s.week_start = previous
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
      row_number() over (order by t.score desc, p.username) as place
    from totals t
    join public.profiles p on p.id = t.user_id
    where not coalesce(p.banned, false)
      and coalesce(p.username, '') <> ''
  )
  select previous, user_id, place::integer, public.power_weekly_boost(place::integer)
  from ranked
  where place <= 10
  on conflict do nothing;
end;
$$;

-- Every part of one player's Cub Power. Reads only; power_refresh does the check-in and weekly settle.
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
  with bests as (
    select s.game, max(s.score) as best
    from public.leaderboard_scores s
    where s.user_id = p_user
    group by s.game
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

create or replace function public.power_refresh(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.power_check_in(p_user);
  perform public.settle_power_boosts();
end;
$$;

-- Adds base * percent hundredths to the stored remainder and pays the whole coins in it.
-- Locks the player's row, so two payouts at once cannot spend the same remainder.
create or replace function public.power_apply_coin_bonus(p_user uuid, p_base integer, p_percent integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  remainder integer;
  pile integer;
  whole integer;
begin
  select coin_bonus_hundredths into remainder
  from public.profiles
  where id = p_user
  for update;
  if not found then
    return jsonb_build_object('bonus', 0, 'remainder', 0, 'percent', 0);
  end if;
  if p_base is null or p_base < 1 or p_percent is null or p_percent < 1 then
    return jsonb_build_object('bonus', 0, 'remainder', remainder, 'percent', greatest(coalesce(p_percent, 0), 0));
  end if;
  pile := remainder + p_base * least(p_percent, 10);
  whole := pile / 100;
  perform set_config('cub.cash_write', 'allow', true);
  perform set_config('cub.cash_reason', 'Earned: Cub Power bonus', true);
  update public.profiles
    set cub_cash = cub_cash + whole,
        coin_bonus_hundredths = pile % 100
    where id = p_user;
  perform set_config('cub.cash_reason', '', true);
  return jsonb_build_object('bonus', whole, 'remainder', pile % 100, 'percent', least(p_percent, 10));
end;
$$;

create or replace function public.power_award_coin_bonus(p_user uuid, p_base integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.power_apply_coin_bonus(
    p_user,
    p_base,
    (public.cub_power_of(p_user)->>'percent')::integer
  );
end;
$$;

-- What the app reads. Opening the app counts as today's check-in.
create or replace function public.get_cub_power()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  perform public.power_refresh(uid);
  return public.cub_power_of(uid);
end;
$$;

-- From lazy-river.sql, plus the Cub Power bonus on the coins actually paid.
-- Limits and the coin_grants record are on the base amount, so earning rates are unchanged.
create or replace function public.grant_game_coins(p_source text, p_amount integer, p_nonce text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  recent_at timestamptz;
  hour_sum integer;
  min_gap interval;
  max_amount integer;
  hour_cap integer;
  balance integer;
  bonus jsonb;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if p_nonce is null or char_length(p_nonce) < 8 or char_length(p_nonce) > 80 then
    raise exception 'Bad coin request';
  end if;

  select cub_cash into balance from public.profiles where id = uid;
  if exists (select 1 from public.coin_grants where user_id = uid and nonce = p_nonce) then
    return jsonb_build_object('cubCash', balance, 'granted', 0);
  end if;

  if p_source = 'flight' then
    max_amount := 5;
    min_gap := interval '8 seconds';
    hour_cap := 300;
    if p_amount is distinct from 5 then
      return jsonb_build_object('cubCash', balance, 'granted', 0);
    end if;
  elsif p_source = 'hoops' then
    max_amount := 400;
    min_gap := interval '20 seconds';
    hour_cap := 400;
  elsif p_source = 'archer' then
    max_amount := 200;
    min_gap := interval '15 seconds';
    hour_cap := 500;
  elsif p_source = 'dojo' then
    max_amount := 300;
    min_gap := interval '10 seconds';
    hour_cap := 300;
  elsif p_source = 'match' then
    max_amount := 21;
    min_gap := interval '8 seconds';
    hour_cap := 200;
    if p_amount not in (1, 3, 6, 10, 15, 21) then
      return jsonb_build_object('cubCash', balance, 'granted', 0);
    end if;
  elsif p_source = 'bubble' then
    max_amount := 80;
    min_gap := interval '20 seconds';
    hour_cap := 300;
  elsif p_source = 'river' then
    max_amount := 80;
    min_gap := interval '20 seconds';
    hour_cap := 300;
  else
    return jsonb_build_object('cubCash', balance, 'granted', 0);
  end if;

  if p_amount is null or p_amount < 1 or p_amount > max_amount then
    return jsonb_build_object('cubCash', balance, 'granted', 0);
  end if;

  delete from public.coin_grants
  where user_id = uid and created_at < now() - interval '2 days';

  select max(created_at) into recent_at
  from public.coin_grants
  where user_id = uid and source = p_source;
  if recent_at is not null and recent_at > now() - min_gap then
    return jsonb_build_object('cubCash', balance, 'granted', 0);
  end if;

  select coalesce(sum(amount), 0) into hour_sum
  from public.coin_grants
  where user_id = uid and source = p_source and created_at > now() - interval '1 hour';
  if hour_sum + p_amount > hour_cap then
    return jsonb_build_object('cubCash', balance, 'granted', 0);
  end if;

  insert into public.coin_grants (user_id, source, amount, nonce)
  values (uid, p_source, p_amount, p_nonce);

  perform set_config('cub.cash_write', 'allow', true);
  update public.profiles
    set cub_cash = cub_cash + p_amount
    where id = uid;

  perform public.power_refresh(uid);
  bonus := public.power_award_coin_bonus(uid, p_amount);
  select cub_cash into balance from public.profiles where id = uid;

  return jsonb_build_object(
    'cubCash', balance,
    'granted', p_amount,
    'bonus', (bonus->>'bonus')::integer,
    'bonusHundredths', (bonus->>'remainder')::integer,
    'percent', (bonus->>'percent')::integer
  );
end;
$$;

-- From lazy-river.sql, plus the Cub Power bonus on the 10 Cub Cash.
create or replace function public.claim_daily_task(p_task text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  board public.daily_state;
  task_game text;
  task_goal integer;
  balance integer;
  score integer;
  bonus jsonb;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  select tasks.game, tasks.goal into task_game, task_goal
  from (values
    ('dash-20', 'flight', 20),
    ('hoops-5000', 'hoops', 5000),
    ('archer-2000', 'archer', 2000),
    ('dojo-5000', 'dojo', 5000),
    ('pairs-60', 'match', 60),
    ('bubble-3000', 'bubble', 3000),
    ('river-3000', 'river', 3000)
  ) as tasks(id, game, goal)
  where tasks.id = p_task;
  board := public.ensure_daily(uid);
  select cub_cash into balance from public.profiles where id = uid;
  if task_game is null then
    return jsonb_build_object('cubCash', balance, 'daily', public.daily_json(board), 'granted', 0);
  end if;
  score := coalesce((board.scores->>task_game)::integer, 0);
  if score < task_goal or p_task = any(board.claimed) then
    return jsonb_build_object('cubCash', balance, 'daily', public.daily_json(board), 'granted', 0);
  end if;
  update public.daily_state
    set claimed = claimed || p_task
    where user_id = uid
    returning * into board;
  perform set_config('cub.cash_write', 'allow', true);
  update public.profiles
    set cub_cash = cub_cash + 10,
        save = jsonb_set(save, '{daily}', public.daily_json(board), true)
    where id = uid;
  perform public.power_refresh(uid);
  bonus := public.power_award_coin_bonus(uid, 10);
  select cub_cash into balance from public.profiles where id = uid;
  return jsonb_build_object(
    'cubCash', balance,
    'daily', public.daily_json(board),
    'granted', 10,
    'bonus', (bonus->>'bonus')::integer,
    'bonusHundredths', (bonus->>'remainder')::integer,
    'percent', (bonus->>'percent')::integer
  );
end;
$$;

-- From lazy-river.sql, plus the Cub Power bonus when the dice pays coins.
create or replace function public.roll_daily_bonus()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  board public.daily_state;
  balance integer;
  ready integer;
  traits jsonb;
  chosen_age text;
  chosen_category text;
  chosen_name text;
  coins integer;
  roll double precision;
  trait jsonb;
  bonus jsonb := '{}'::jsonb;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  board := public.ensure_daily(uid);
  select cub_cash into balance from public.profiles where id = uid;
  if board.bonus_claimed then
    return jsonb_build_object('ok', false, 'cubCash', balance, 'daily', public.daily_json(board));
  end if;
  select count(*) into ready
  from (values
    ('flight', 20),
    ('hoops', 5000),
    ('archer', 2000),
    ('dojo', 5000),
    ('match', 60),
    ('bubble', 3000),
    ('river', 3000)
  ) as tasks(game, goal)
  where coalesce((board.scores->>tasks.game)::integer, 0) >= tasks.goal;
  if ready < 3 then
    return jsonb_build_object('ok', false, 'cubCash', balance, 'daily', public.daily_json(board));
  end if;

  select coalesce(save->'unlockedTraits', '[]'::jsonb) into traits
  from public.profiles where id = uid;

  if exists (
    select 1 from public.trait_prices
    where not (traits ? (age || ':' || category || ':' || name))
  ) and random() < 0.2 then
    select age, category, name
      into chosen_age, chosen_category, chosen_name
    from public.trait_prices
    where not (traits ? (age || ':' || category || ':' || name))
    order by -ln(greatest(random(), 0.0000001)) / (1000.0 / greatest(price, 100))
    limit 1;
    trait := jsonb_build_object('age', chosen_age, 'category', chosen_category, 'name', chosen_name);
    coins := 0;
    traits := traits || to_jsonb(chosen_age || ':' || chosen_category || ':' || chosen_name);
  else
    trait := null;
    roll := random() * 15;
    coins := case
      when roll < 5 then 10
      when roll < 9 then 20
      when roll < 12 then 30
      when roll < 14 then 40
      else 50
    end;
  end if;

  update public.daily_state
    set bonus_claimed = true,
        bonus_trait = trait,
        bonus_coins = coins
    where user_id = uid
    returning * into board;

  perform set_config('cub.cash_write', 'allow', true);
  update public.profiles
    set cub_cash = cub_cash + coins,
        save = jsonb_set(
          jsonb_set(save, '{daily}', public.daily_json(board), true),
          '{unlockedTraits}',
          traits,
          true
        )
    where id = uid;

  if coins > 0 then
    perform public.power_refresh(uid);
    bonus := public.power_award_coin_bonus(uid, coins);
  end if;
  select cub_cash into balance from public.profiles where id = uid;

  return jsonb_build_object(
    'ok', true,
    'cubCash', balance,
    'daily', public.daily_json(board),
    'unlockedTraits', traits,
    'granted', coins,
    'bonus', coalesce((bonus->>'bonus')::integer, 0),
    'bonusHundredths', (bonus->>'remainder')::integer
  );
end;
$$;

-- From coins.sql, now charging the Cub Power price. The XP reward stays 10% of the full price.
create or replace function public.purchase_trait(p_age text, p_category text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cost integer;
  paid integer;
  pct integer;
  balance integer;
  traits jsonb;
  trait_id text;
  bonus_xp integer;
  save_row jsonb;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if p_age not in ('young', 'old') then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;
  select price into cost
  from public.trait_prices
  where age = p_age and category = p_category and name = p_name;
  select cub_cash, save into balance, save_row from public.profiles where id = uid for update;
  if cost is null then
    return jsonb_build_object('ok', false, 'reason', 'missing', 'cubCash', balance);
  end if;
  trait_id := p_age || ':' || p_category || ':' || p_name;
  traits := coalesce(save_row->'unlockedTraits', '[]'::jsonb);
  if traits ? trait_id then
    return jsonb_build_object('ok', true, 'cubCash', balance, 'unlockedTraits', traits, 'xp', 0);
  end if;
  perform public.power_refresh(uid);
  pct := (public.cub_power_of(uid)->>'percent')::integer;
  paid := public.power_discounted_price(cost, pct);
  if balance < paid then
    return jsonb_build_object('ok', false, 'reason', 'broke', 'cubCash', balance, 'price', cost, 'paid', paid);
  end if;
  bonus_xp := (round(cost * 0.1))::integer;
  traits := traits || to_jsonb(trait_id);
  perform set_config('cub.cash_write', 'allow', true);
  update public.profiles
    set cub_cash = cub_cash - paid,
        save = jsonb_set(
          jsonb_set(save, '{unlockedTraits}', traits, true),
          '{xp}',
          to_jsonb(coalesce((save->>'xp')::numeric, 0) + bonus_xp),
          true
        )
    where id = uid
    returning cub_cash into balance;
  return jsonb_build_object(
    'ok', true,
    'cubCash', balance,
    'unlockedTraits', traits,
    'xp', bonus_xp,
    'price', cost,
    'paid', paid,
    'discount', pct
  );
end;
$$;

revoke all on function public.power_level(numeric) from public, anon, authenticated;
revoke all on function public.power_level_points(integer) from public, anon, authenticated;
revoke all on function public.power_badge_points(integer, public.power_games) from public, anon, authenticated;
revoke all on function public.power_badge_power(integer, integer) from public, anon, authenticated;
revoke all on function public.power_after_streak(integer, integer) from public, anon, authenticated;
revoke all on function public.power_weekly_boost(integer) from public, anon, authenticated;
revoke all on function public.power_percent(integer) from public, anon, authenticated;
revoke all on function public.power_discounted_price(integer, integer) from public, anon, authenticated;
revoke all on function public.power_check_in(uuid) from public, anon, authenticated;
revoke all on function public.settle_power_boosts() from public, anon, authenticated;
revoke all on function public.cub_power_of(uuid) from public, anon, authenticated;
revoke all on function public.power_refresh(uuid) from public, anon, authenticated;
revoke all on function public.power_apply_coin_bonus(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.power_award_coin_bonus(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_cub_power() from public, anon, authenticated;
revoke all on function public.grant_game_coins(text, integer, text) from public, anon, authenticated;
revoke all on function public.claim_daily_task(text) from public, anon, authenticated;
revoke all on function public.roll_daily_bonus() from public, anon, authenticated;
revoke all on function public.purchase_trait(text, text, text) from public, anon, authenticated;

grant execute on function public.get_cub_power() to authenticated;
grant execute on function public.grant_game_coins(text, integer, text) to authenticated;
grant execute on function public.claim_daily_task(text) to authenticated;
grant execute on function public.roll_daily_bonus() to authenticated;
grant execute on function public.purchase_trait(text, text, text) to authenticated;
