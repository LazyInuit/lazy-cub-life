-- Safe to run again. New daily challenge targets: Pride Pairs 100 points (was 60), Baseball Blitz 2000 (was 500).
-- The three functions that check the targets, as in baseball-blitz.sql (which now has the same targets).
-- Challenge ids are unchanged, so a challenge already claimed today cannot be claimed again.
-- Must match DAILY_TASKS in src/game/dailyTasks.ts. Balances, saves and scores are not touched.

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

revoke all on function public.claim_daily_task(text) from public, anon, authenticated;
revoke all on function public.roll_daily_bonus() from public, anon, authenticated;
revoke all on function public.roll_daily_extra_bonus() from public, anon, authenticated;
grant execute on function public.claim_daily_task(text) to authenticated;
grant execute on function public.roll_daily_bonus() to authenticated;
grant execute on function public.roll_daily_extra_bonus() to authenticated;
