-- Safe to run again. Run after spellitaire.sql. Balances, saves and scores are not touched.
-- An extra bonus roll each day for finishing every daily challenge (all 8), on top of the usual roll
-- for any 3. Same prizes and odds as the usual roll: a wardrobe style, or 10-50 Cub Cash. It resets with
-- the rest of the daily board, and its coins show in coin history as "Earned: Daily extra roll".

alter table public.daily_state add column if not exists extra_claimed boolean not null default false;
alter table public.daily_state add column if not exists extra_trait jsonb;
alter table public.daily_state add column if not exists extra_coins integer not null default 0;

-- From coins.sql, with the extra roll.
create or replace function public.daily_json(board public.daily_state)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'startedAt', case when board.started_at is null then null else floor(extract(epoch from board.started_at) * 1000) end,
    'scores', board.scores,
    'claimed', to_jsonb(board.claimed),
    'bonusClaimed', board.bonus_claimed,
    'bonusTrait', board.bonus_trait,
    'bonusCoins', board.bonus_coins,
    'extraClaimed', board.extra_claimed,
    'extraTrait', board.extra_trait,
    'extraCoins', board.extra_coins
  );
$$;

-- From coins.sql: a round that has run 24 hours starts again, extra roll included.
create or replace function public.ensure_daily(uid uuid)
returns public.daily_state
language plpgsql
security definer
set search_path = public
as $$
declare
  board public.daily_state;
begin
  insert into public.daily_state (user_id) values (uid) on conflict (user_id) do nothing;
  select * into board from public.daily_state where user_id = uid for update;
  if board.started_at is not null and board.started_at + interval '24 hours' <= now() then
    update public.daily_state
      set started_at = null,
          scores = '{}'::jsonb,
          claimed = '{}',
          bonus_claimed = false,
          bonus_trait = null,
          bonus_coins = 0,
          extra_claimed = false,
          extra_trait = null,
          extra_coins = 0
      where user_id = uid
      returning * into board;
  end if;
  return board;
end;
$$;

-- The usual roll_daily_bonus (from spellitaire.sql), for when every challenge is done.
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
    ('match', 60),
    ('bubble', 3000),
    ('river', 3000),
    ('solitaire', 1)
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

revoke all on function public.roll_daily_extra_bonus() from public, anon, authenticated;
grant execute on function public.roll_daily_extra_bonus() to authenticated;
