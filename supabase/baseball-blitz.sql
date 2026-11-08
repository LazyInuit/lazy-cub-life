-- Safe to run again. Run after spellitaire-modes.sql, daily-extra-roll.sql and pvp-challenges.sql.
-- Adds Baseball Blitz ('baseball') everywhere a game is checked by name:
--   leaderboard scores and boards (also readable by demo players),
--   daily task scores, the new daily challenge (Earn 2000 points), the bonus roll and the extra roll
--   (which now needs all 9 challenges), Cub Cash from games, coin history labels, admin activity time,
--   and player vs player challenges.
-- Each function below is its latest version (from spellitaire-modes.sql, spellitaire.sql,
-- daily-extra-roll.sql and pvp-challenges.sql) with 'baseball' added. Balances, saves and scores are
-- not touched. Baseball Blitz has no Cub Power entry or badges yet.
-- From now on do not run spellitaire.sql, spellitaire-modes.sql, daily-extra-roll.sql or pvp-challenges.sql
-- again: they would put back their versions of these functions without Baseball Blitz.

-- Scores table: allow the new game.
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
    'flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river', 'baseball',
    'solitaire', 'solitaire-hard', 'solitaire-flipflop', 'solitaire-flipflop-hard',
    'solitaire-pyramid', 'solitaire-pyramid-hard',
    'solitaire-freecell', 'solitaire-freecell-hard',
    'solitaire-spider', 'solitaire-spider-hard',
    'solitaire-golf', 'solitaire-golf-hard'
  ));

-- From spellitaire-modes.sql. A Baseball Blitz game above 1,000,000 is not real.
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
  if p_game not in ('flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river', 'baseball')
    and not (p_game = any(public.spellitaire_keys())) then
    raise exception 'Bad game';
  end if;
  if p_score is null or p_score <= 0 or p_score > 9999999 then
    return;
  end if;
  if p_game in ('bubble', 'river', 'baseball') and p_score > 1000000 then
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

-- From spellitaire-modes.sql.
create or replace function public.leaderboard_points(p_game text, p_score integer)
returns integer
language sql
immutable
as $$
  select case
    when (p_game in ('flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river', 'baseball')
        or p_game = any(public.spellitaire_keys()))
      and p_score > 0
      and p_score <= 9999999
    then p_score
    else 0
  end;
$$;

-- From spellitaire-modes.sql (no sign-in check, so demo players can read boards).
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
  if p_game not in ('overall', 'flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river', 'solitaire', 'baseball') then
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

-- From spellitaire-modes.sql.
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
  if p_game not in ('flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river', 'solitaire', 'baseball') then
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

-- From spellitaire.sql.
create or replace function public.add_daily_score(p_game text, p_points integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  board public.daily_state;
  balance integer;
  gained integer;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if p_game not in ('flight', 'hoops', 'archer', 'dojo', 'match', 'bubble', 'river', 'solitaire', 'baseball') or p_points is null or p_points < 1 then
    board := public.ensure_daily(uid);
    select cub_cash into balance from public.profiles where id = uid;
    return jsonb_build_object('cubCash', balance, 'daily', public.daily_json(board), 'granted', 0);
  end if;
  gained := least(p_points, 250000);
  board := public.ensure_daily(uid);
  if board.started_at is null then
    update public.daily_state set started_at = now() where user_id = uid returning * into board;
  end if;
  update public.daily_state
    set scores = jsonb_set(
      scores,
      array[p_game],
      to_jsonb(coalesce((scores->>p_game)::integer, 0) + gained),
      true
    )
    where user_id = uid
    returning * into board;
  select cub_cash into balance from public.profiles where id = uid;
  return jsonb_build_object('cubCash', balance, 'daily', public.daily_json(board), 'granted', 0);
end;
$$;

-- From spellitaire.sql, with the Baseball Blitz challenge.
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
    ('pairs-60', 'match', 100),
    ('bubble-3000', 'bubble', 3000),
    ('river-3000', 'river', 3000),
    ('solitaire-win', 'solitaire', 1),
    ('baseball-500', 'baseball', 2000)
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

-- From spellitaire.sql, with the Baseball Blitz challenge counting toward the bonus.
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
    ('match', 100),
    ('bubble', 3000),
    ('river', 3000),
    ('solitaire', 1),
    ('baseball', 2000)
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

-- From daily-extra-roll.sql: the extra roll now needs the Baseball Blitz challenge too.
create or replace function public.roll_daily_extra_bonus()
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
  total integer;
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
  if board.extra_claimed then
    return jsonb_build_object('ok', false, 'cubCash', balance, 'daily', public.daily_json(board));
  end if;
  select count(*) filter (where coalesce((board.scores->>tasks.game)::integer, 0) >= tasks.goal), count(*)
  into ready, total
  from (values
    ('flight', 20),
    ('hoops', 5000),
    ('archer', 2000),
    ('dojo', 5000),
    ('match', 100),
    ('bubble', 3000),
    ('river', 3000),
    ('solitaire', 1),
    ('baseball', 2000)
  ) as tasks(game, goal);
  if ready < total then
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
    set extra_claimed = true,
        extra_trait = trait,
        extra_coins = coins
    where user_id = uid
    returning * into board;

  perform set_config('cub.cash_write', 'allow', true);
  perform set_config('cub.cash_reason', 'Earned: Daily extra roll', true);
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

-- From spellitaire.sql. Baseball Blitz pays its Cub Cash once at the end of each game: up to 80,
-- at most once every 20 seconds and 300 an hour.
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
  elsif p_source = 'baseball' then
    -- Paid once at the end of each game.
    max_amount := 80;
    min_gap := interval '20 seconds';
    hour_cap := 300;
  elsif p_source = 'solitaire' then
    -- Paid once at the end of each game. Short games that are not won still earn coins in play,
    -- so the gap and hourly cap leave room for someone playing many of them back to back.
    max_amount := 75;
    min_gap := interval '20 seconds';
    hour_cap := 400;
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

-- From spellitaire.sql, with the Baseball Blitz label. The trigger itself is unchanged.
create or replace function public.log_cub_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reason text := nullif(current_setting('cub.cash_reason', true), '');
  op text := nullif(current_setting('cub.operation_id', true), '');
  change integer := new.cub_cash - old.cub_cash;
  grant_source text;
  new_trait text;
  old_energy numeric;
  new_energy numeric;
  old_claimed integer;
  new_claimed integer;
begin
  if new.cub_cash is not distinct from old.cub_cash then
    return new;
  end if;

  if reason is null then
    -- Game coins and weekly prizes write a coin_grants row in the same transaction.
    select g.source into grant_source
    from public.coin_grants g
    where g.user_id = new.id
      and g.created_at = now()
    order by g.id desc
    limit 1;
    if grant_source is not null then
      reason := 'Earned: ' || case grant_source
        when 'flight' then 'Kovu''s Space Dash'
        when 'match' then 'Pride Pairs'
        when 'dojo' then 'Ninja Cub Dojo'
        when 'archer' then 'Cupid Archery'
        when 'hoops' then 'Lazy Hoops'
        when 'bubble' then 'Bubble Blast'
        when 'river' then 'Lazy River'
        when 'solitaire' then 'Spellitaire'
        when 'baseball' then 'Baseball Blitz'
        when 'weekly-overall' then 'Weekly overall prize'
        else grant_source
      end;
    end if;
  end if;

  if reason is null and change < 0 then
    -- A wardrobe purchase adds one trait such as "old:Mane:Black".
    select t.value into new_trait
    from jsonb_array_elements_text(coalesce(new.save->'unlockedTraits', '[]'::jsonb)) t(value)
    where not coalesce(old.save->'unlockedTraits', '[]'::jsonb) ? t.value
    limit 1;
    if new_trait is not null then
      reason := 'Spent: Wardrobe - '
        || case split_part(new_trait, ':', 1) when 'old' then 'Old cub' when 'young' then 'Young cub' else split_part(new_trait, ':', 1) end
        || ' ' || split_part(new_trait, ':', 2)
        || ' ' || split_part(new_trait, ':', 3);
    else
      old_energy := case when coalesce(old.save->>'energy', '') ~ '^[0-9]+(\.[0-9]+)?$' then (old.save->>'energy')::numeric end;
      new_energy := case when coalesce(new.save->>'energy', '') ~ '^[0-9]+(\.[0-9]+)?$' then (new.save->>'energy')::numeric end;
      if new_energy is not null and (old_energy is null or new_energy > old_energy) then
        reason := 'Spent: Shop - ' || case change when -1 then 'Milk' when -2 then 'Juice' else 'Drink' end;
      end if;
    end if;
  end if;

  if reason is null and change > 0 then
    old_claimed := coalesce(jsonb_array_length(old.save->'daily'->'claimed'), 0);
    new_claimed := coalesce(jsonb_array_length(new.save->'daily'->'claimed'), 0);
    if new_claimed > old_claimed then
      reason := 'Earned: Daily challenge';
    elsif coalesce((new.save->'daily'->>'bonusClaimed')::boolean, false)
      and not coalesce((old.save->'daily'->>'bonusClaimed')::boolean, false) then
      reason := 'Earned: Daily bonus roll';
    end if;
  end if;

  insert into public.coin_ledger (user_id, amount, balance_after, reason, operation_id, actor_id)
  values (
    new.id,
    change,
    new.cub_cash,
    coalesce(reason, case when change < 0 then 'Spent: other' else 'Earned: other' end),
    coalesce(op, gen_random_uuid()::text),
    auth.uid()
  );
  return new;
end;
$$;

-- From spellitaire.sql, with the Baseball Blitz activity area.
create or replace function public.record_activity(p_area text, p_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  stored jsonb;
  last_at timestamptz;
  current_seconds integer := 0;
  allowed integer := p_seconds;
  elapsed integer;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if p_area not in ('home', 'wardrobe', 'flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river', 'solitaire', 'baseball') then
    raise exception 'Bad activity area';
  end if;
  if p_seconds is null or p_seconds < 1 or p_seconds > 90 then
    raise exception 'Bad activity time';
  end if;

  select coalesce(activity, '{}'::jsonb), activity_at
  into stored, last_at
  from public.profiles
  where id = uid
  for update;

  if not found then
    return 0;
  end if;
  if last_at is not null then
    elapsed := floor(extract(epoch from (clock_timestamp() - last_at)));
    allowed := least(allowed, greatest(0, elapsed + 5));
  end if;
  if allowed < 1 then
    return 0;
  end if;
  if coalesce(stored->>p_area, '') ~ '^[0-9]+$' then
    current_seconds := (stored->>p_area)::integer;
  end if;

  update public.profiles
    set activity = jsonb_set(stored, array[p_area], to_jsonb(current_seconds + allowed), true),
        activity_at = clock_timestamp()
    where id = uid;

  insert into public.activity_daily (user_id, day, area, seconds)
  values (uid, (now() at time zone 'Europe/London')::date, p_area, allowed)
  on conflict (user_id, day, area)
  do update set seconds = public.activity_daily.seconds + excluded.seconds;

  return allowed;
end;
$$;

-- From pvp-challenges.sql: Baseball Blitz can be played as a challenge.
create or replace function public.challenge_board_ok(p_board text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    p_board in ('flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river', 'baseball')
      or p_board = any(public.spellitaire_keys()),
    false
  );
$$;

-- From pvp-challenges.sql, with the same Baseball Blitz limit submit_score uses.
create or replace function public.challenge_score_ok(p_board text, p_score integer)
returns boolean
language sql
immutable
as $$
  select coalesce(
    public.challenge_board_ok(p_board)
      and p_score > 0
      and p_score <= 9999999
      and not (p_board in ('bubble', 'river', 'baseball') and p_score > 1000000)
      and not (p_board = any(public.spellitaire_keys()) and p_score > 20000),
    false
  );
$$;

revoke all on function public.submit_score(text, integer) from public, anon, authenticated;
revoke all on function public.leaderboard_points(text, integer) from public, anon, authenticated;
revoke all on function public.leaderboard(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.leaderboard_place(text, integer) from public, anon, authenticated;
revoke all on function public.add_daily_score(text, integer) from public, anon, authenticated;
revoke all on function public.claim_daily_task(text) from public, anon, authenticated;
revoke all on function public.roll_daily_bonus() from public, anon, authenticated;
revoke all on function public.roll_daily_extra_bonus() from public, anon, authenticated;
revoke all on function public.grant_game_coins(text, integer, text) from public, anon, authenticated;
revoke all on function public.record_activity(text, integer) from public, anon, authenticated;
revoke all on function public.challenge_board_ok(text) from public, anon, authenticated;
revoke all on function public.challenge_score_ok(text, integer) from public, anon, authenticated;

grant execute on function public.submit_score(text, integer) to authenticated;
grant execute on function public.leaderboard(text, text, integer, integer) to anon, authenticated;
grant execute on function public.leaderboard_place(text, integer) to anon, authenticated;
grant execute on function public.add_daily_score(text, integer) to authenticated;
grant execute on function public.claim_daily_task(text) to authenticated;
grant execute on function public.roll_daily_bonus() to authenticated;
grant execute on function public.roll_daily_extra_bonus() to authenticated;
grant execute on function public.grant_game_coins(text, integer, text) to authenticated;
grant execute on function public.record_activity(text, integer) to authenticated;
