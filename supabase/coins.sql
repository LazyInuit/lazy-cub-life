-- Run once in the Supabase SQL editor, after profiles.sql.
-- Players can still save their cub. They cannot write their own Cub Cash or wardrobe unlocks.

alter table public.profiles
  add column if not exists cub_cash integer not null default 100;

alter table public.profiles drop constraint if exists profiles_cub_cash_nonnegative;
alter table public.profiles
  add constraint profiles_cub_cash_nonnegative check (cub_cash >= 0);

revoke update on table public.profiles from authenticated;
grant update (username, save, updated_at) on table public.profiles to authenticated;

create table if not exists public.trait_prices (
  age text not null check (age in ('young', 'old')),
  category text not null,
  name text not null,
  price integer not null check (price > 0),
  primary key (age, category, name)
);

create table if not exists public.daily_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  started_at timestamptz,
  scores jsonb not null default '{}'::jsonb,
  claimed text[] not null default '{}',
  bonus_claimed boolean not null default false,
  bonus_trait jsonb,
  bonus_coins integer not null default 0
);

create table if not exists public.coin_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  amount integer not null check (amount > 0),
  nonce text not null,
  created_at timestamptz not null default now(),
  unique (user_id, nonce)
);

create index if not exists coin_grants_user_source_time
  on public.coin_grants (user_id, source, created_at desc);

alter table public.trait_prices enable row level security;
alter table public.daily_state enable row level security;
alter table public.coin_grants enable row level security;

revoke all on public.trait_prices from anon, authenticated;
revoke all on public.daily_state from anon, authenticated;
revoke all on public.coin_grants from anon, authenticated;
grant select on public.trait_prices to authenticated;

create or replace function public.protect_cub_cash()
returns trigger
language plpgsql
as $$
declare
  starters jsonb := '[
    "old:Body:Standard","old:Mane:Brown","old:Eyes:Surprised","old:Mouth:Standard","old:Headgear:Nothing","old:Bodygear:Nothing","old:Earring:Nothing",
    "young:Body:Standard","young:Mane:Brown","young:Eyes:Surprised","young:Mouth:Standard","young:Headgear:Nothing","young:Bodygear:Nothing","young:Earring:Nothing"
  ]'::jsonb;
begin
  if new.save is null or jsonb_typeof(new.save) <> 'object' then
    new.save := '{}'::jsonb;
  end if;
  if tg_op = 'INSERT' then
    new.cub_cash := 100;
    new.save := jsonb_set(new.save, '{unlockedTraits}', starters, true);
  elsif current_setting('cub.cash_write', true) is distinct from 'allow' then
    new.cub_cash := old.cub_cash;
    new.save := jsonb_set(
      new.save,
      '{unlockedTraits}',
      coalesce(old.save->'unlockedTraits', starters),
      true
    );
  end if;
  new.save := jsonb_set(new.save, '{cubCash}', to_jsonb(new.cub_cash), true);
  return new;
end;
$$;

drop trigger if exists protect_cub_cash on public.profiles;
create trigger protect_cub_cash
  before insert or update on public.profiles
  for each row execute function public.protect_cub_cash();

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
    'bonusCoins', board.bonus_coins
  );
$$;

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
          bonus_coins = 0
      where user_id = uid
      returning * into board;
  end if;
  return board;
end;
$$;

create or replace function public.touch_daily_board()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  board public.daily_state;
  balance integer;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  board := public.ensure_daily(uid);
  if board.started_at is null then
    update public.daily_state set started_at = now() where user_id = uid returning * into board;
  end if;
  select cub_cash into balance from public.profiles where id = uid;
  return jsonb_build_object('cubCash', balance, 'daily', public.daily_json(board), 'granted', 0);
end;
$$;

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
  if p_game not in ('flight', 'hoops', 'archer', 'dojo', 'match') or p_points is null or p_points < 1 then
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
    ('pairs-20', 'match', 20)
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
    where id = uid
    returning cub_cash into balance;
  return jsonb_build_object('cubCash', balance, 'daily', public.daily_json(board), 'granted', 10);
end;
$$;

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
    ('match', 20)
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
    where id = uid
    returning cub_cash into balance;

  return jsonb_build_object(
    'ok', true,
    'cubCash', balance,
    'daily', public.daily_json(board),
    'unlockedTraits', traits,
    'granted', coins
  );
end;
$$;

create or replace function public.purchase_trait(p_age text, p_category text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cost integer;
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
  select cub_cash, save into balance, save_row from public.profiles where id = uid;
  if cost is null then
    return jsonb_build_object('ok', false, 'reason', 'missing', 'cubCash', balance);
  end if;
  trait_id := p_age || ':' || p_category || ':' || p_name;
  traits := coalesce(save_row->'unlockedTraits', '[]'::jsonb);
  if traits ? trait_id then
    return jsonb_build_object('ok', true, 'cubCash', balance, 'unlockedTraits', traits, 'xp', 0);
  end if;
  if balance < cost then
    return jsonb_build_object('ok', false, 'reason', 'broke', 'cubCash', balance);
  end if;
  bonus_xp := (round(cost * 0.1))::integer;
  traits := traits || to_jsonb(trait_id);
  perform set_config('cub.cash_write', 'allow', true);
  update public.profiles
    set cub_cash = cub_cash - cost,
        save = jsonb_set(
          jsonb_set(save, '{unlockedTraits}', traits, true),
          '{xp}',
          to_jsonb(coalesce((save->>'xp')::numeric, 0) + bonus_xp),
          true
        )
    where id = uid
    returning cub_cash into balance;
  return jsonb_build_object('ok', true, 'cubCash', balance, 'unlockedTraits', traits, 'xp', bonus_xp);
end;
$$;

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
    where id = uid
    returning cub_cash into balance;

  return jsonb_build_object('cubCash', balance, 'granted', p_amount);
end;
$$;

revoke all on function public.protect_cub_cash() from public, anon, authenticated;
revoke all on function public.daily_json(public.daily_state) from public, anon, authenticated;
revoke all on function public.ensure_daily(uuid) from public, anon, authenticated;
revoke all on function public.touch_daily_board() from public, anon, authenticated;
revoke all on function public.add_daily_score(text, integer) from public, anon, authenticated;
revoke all on function public.claim_daily_task(text) from public, anon, authenticated;
revoke all on function public.roll_daily_bonus() from public, anon, authenticated;
revoke all on function public.purchase_trait(text, text, text) from public, anon, authenticated;
revoke all on function public.grant_game_coins(text, integer, text) from public, anon, authenticated;

grant execute on function public.touch_daily_board() to authenticated;
grant execute on function public.add_daily_score(text, integer) to authenticated;
grant execute on function public.claim_daily_task(text) to authenticated;
grant execute on function public.roll_daily_bonus() to authenticated;
grant execute on function public.purchase_trait(text, text, text) to authenticated;
grant execute on function public.grant_game_coins(text, integer, text) to authenticated;

-- BEGIN TRAIT PRICES
truncate public.trait_prices;
insert into public.trait_prices (age, category, name, price) values
  ('old', 'Body', 'Black', 150),
  ('young', 'Body', 'Black', 150),
  ('old', 'Body', 'Brown', 100),
  ('young', 'Body', 'Brown', 100),
  ('old', 'Body', 'Galaxy', 600),
  ('young', 'Body', 'Galaxy', 600),
  ('old', 'Body', 'Grey', 100),
  ('young', 'Body', 'Grey', 100),
  ('old', 'Body', 'Lizard Blue', 200),
  ('young', 'Body', 'Lizard Blue', 200),
  ('old', 'Body', 'Pink', 150),
  ('young', 'Body', 'Pink', 150),
  ('old', 'Body', 'Red', 150),
  ('young', 'Body', 'Red', 150),
  ('old', 'Body', 'Scratched Up', 350),
  ('young', 'Body', 'Scratched Up', 350),
  ('old', 'Body', 'Sponge', 200),
  ('young', 'Body', 'Sponge', 200),
  ('old', 'Body', 'Spotted Leopard', 250),
  ('young', 'Body', 'Spotted Leopard', 250),
  ('old', 'Body', 'Tan', 100),
  ('young', 'Body', 'Tan', 100),
  ('old', 'Body', 'White', 150),
  ('young', 'Body', 'White', 150),
  ('old', 'Body', 'Zebra', 250),
  ('young', 'Body', 'Zebra', 250),
  ('old', 'Body', 'Zombie', 250),
  ('young', 'Body', 'Zombie', 250),
  ('old', 'Mane', 'Black', 100),
  ('young', 'Mane', 'Black', 100),
  ('old', 'Mane', 'Black And Gold', 300),
  ('young', 'Mane', 'Black And Gold', 300),
  ('old', 'Mane', 'Black and Gold', 300),
  ('young', 'Mane', 'Black and Gold', 300),
  ('old', 'Mane', 'Bloody', 250),
  ('young', 'Mane', 'Bloody', 250),
  ('old', 'Mane', 'Blue', 250),
  ('young', 'Mane', 'Blue', 250),
  ('old', 'Mane', 'Double Tied Up + Top Knot - Black', 150),
  ('young', 'Mane', 'Double Tied Up + Top Knot - Black', 150),
  ('old', 'Mane', 'Double Tied Up + Top Knot - Brown', 100),
  ('young', 'Mane', 'Double Tied Up + Top Knot - Brown', 100),
  ('old', 'Mane', 'Double Tied Up - Blue', 250),
  ('young', 'Mane', 'Double Tied Up - Blue', 250),
  ('old', 'Mane', 'Double Tied Up - Emerald', 250),
  ('young', 'Mane', 'Double Tied Up - Emerald', 250),
  ('old', 'Mane', 'Double Tied Up - Fire', 300),
  ('young', 'Mane', 'Double Tied Up - Fire', 300),
  ('old', 'Mane', 'Double Tied Up - Ice', 250),
  ('young', 'Mane', 'Double Tied Up - Ice', 250),
  ('old', 'Mane', 'Double Tied Up - Orange', 250),
  ('young', 'Mane', 'Double Tied Up - Orange', 250),
  ('old', 'Mane', 'Double Tied Up - Purple', 250),
  ('young', 'Mane', 'Double Tied Up - Purple', 250),
  ('old', 'Mane', 'Double Tied Up - Rainbow', 250),
  ('young', 'Mane', 'Double Tied Up - Rainbow', 250),
  ('old', 'Mane', 'Double Tied Up - Red', 250),
  ('young', 'Mane', 'Double Tied Up - Red', 250),
  ('old', 'Mane', 'Double Tied Up - White', 250),
  ('young', 'Mane', 'Double Tied Up - White', 250),
  ('old', 'Mane', 'Emerald', 250),
  ('young', 'Mane', 'Emerald', 250),
  ('old', 'Mane', 'Fire', 250),
  ('young', 'Mane', 'Fire', 250),
  ('old', 'Mane', 'Ice', 250),
  ('young', 'Mane', 'Ice', 250),
  ('old', 'Mane', 'Orange', 150),
  ('young', 'Mane', 'Orange', 150),
  ('old', 'Mane', 'Purple', 150),
  ('young', 'Mane', 'Purple', 150),
  ('old', 'Mane', 'Rainbow', 200),
  ('young', 'Mane', 'Rainbow', 200),
  ('old', 'Mane', 'Red', 100),
  ('young', 'Mane', 'Red', 100),
  ('old', 'Mane', 'Teal', 250),
  ('young', 'Mane', 'Teal', 250),
  ('old', 'Mane', 'Top Knot - Black', 100),
  ('young', 'Mane', 'Top Knot - Black', 100),
  ('old', 'Mane', 'Top Knot - Blue', 250),
  ('young', 'Mane', 'Top Knot - Blue', 250),
  ('old', 'Mane', 'Top Knot - Brown', 100),
  ('young', 'Mane', 'Top Knot - Brown', 100),
  ('old', 'Mane', 'Top Knot - Fire', 250),
  ('young', 'Mane', 'Top Knot - Fire', 250),
  ('old', 'Mane', 'Top Knot - Green', 250),
  ('young', 'Mane', 'Top Knot - Green', 250),
  ('old', 'Mane', 'Top Knot - Ice', 250),
  ('young', 'Mane', 'Top Knot - Ice', 250),
  ('old', 'Mane', 'Top Knot - Orange', 250),
  ('young', 'Mane', 'Top Knot - Orange', 250),
  ('old', 'Mane', 'Top Knot - Purple', 250),
  ('young', 'Mane', 'Top Knot - Purple', 250),
  ('old', 'Mane', 'Top Knot - Rainbow', 150),
  ('young', 'Mane', 'Top Knot - Rainbow', 150),
  ('old', 'Mane', 'Top Knot - Red', 200),
  ('young', 'Mane', 'Top Knot - Red', 200),
  ('old', 'Mane', 'Top Knot - White', 250),
  ('young', 'Mane', 'Top Knot - White', 250),
  ('old', 'Mane', 'White', 250),
  ('young', 'Mane', 'White', 250),
  ('old', 'Eyes', '3D Glasses', 400),
  ('young', 'Eyes', '3D Glasses', 400),
  ('old', 'Eyes', 'Angry', 100),
  ('young', 'Eyes', 'Angry', 100),
  ('old', 'Eyes', 'Anime - Blue', 100),
  ('young', 'Eyes', 'Anime - Blue', 100),
  ('old', 'Eyes', 'Anime - Brown', 100),
  ('young', 'Eyes', 'Anime - Brown', 100),
  ('old', 'Eyes', 'BTC Eyes', 400),
  ('young', 'Eyes', 'BTC Eyes', 400),
  ('old', 'Eyes', 'Closed', 100),
  ('young', 'Eyes', 'Closed', 100),
  ('old', 'Eyes', 'Concerned', 100),
  ('young', 'Eyes', 'Concerned', 100),
  ('old', 'Eyes', 'Dork Glasses', 150),
  ('young', 'Eyes', 'Dork Glasses', 150),
  ('old', 'Eyes', 'Evil', 600),
  ('young', 'Eyes', 'Evil', 600),
  ('old', 'Eyes', 'Eye Mask', 200),
  ('young', 'Eyes', 'Eye Mask', 200),
  ('old', 'Eyes', 'Fake Glasses', 150),
  ('young', 'Eyes', 'Fake Glasses', 150),
  ('old', 'Eyes', 'Goofy Eyes', 150),
  ('young', 'Eyes', 'Goofy Eyes', 150),
  ('old', 'Eyes', 'Money Eyes', 300),
  ('young', 'Eyes', 'Money Eyes', 300),
  ('old', 'Eyes', 'Monocle', 150),
  ('young', 'Eyes', 'Monocle', 150),
  ('old', 'Eyes', 'Raised Eyebrow', 150),
  ('young', 'Eyes', 'Raised Eyebrow', 150),
  ('old', 'Eyes', 'Sad', 100),
  ('young', 'Eyes', 'Sad', 100),
  ('old', 'Eyes', 'Shades', 300),
  ('young', 'Eyes', 'Shades', 300),
  ('old', 'Eyes', 'Sleepy', 100),
  ('young', 'Eyes', 'Sleepy', 100),
  ('old', 'Eyes', 'Stoner', 100),
  ('young', 'Eyes', 'Stoner', 100),
  ('old', 'Eyes', 'Water Goggles', 100),
  ('young', 'Eyes', 'Water Goggles', 100),
  ('old', 'Eyes', 'Winking', 150),
  ('young', 'Eyes', 'Winking', 150),
  ('old', 'Mouth', 'Big Smile', 100),
  ('young', 'Mouth', 'Big Smile', 100),
  ('old', 'Mouth', 'Biting Lip', 100),
  ('young', 'Mouth', 'Biting Lip', 100),
  ('old', 'Mouth', 'Bloody Mouth', 150),
  ('young', 'Mouth', 'Bloody Mouth', 150),
  ('old', 'Mouth', 'Bubble Gum', 100),
  ('young', 'Mouth', 'Bubble Gum', 100),
  ('old', 'Mouth', 'Cigar', 250),
  ('young', 'Mouth', 'Cigar', 250),
  ('old', 'Mouth', 'Gargling', 150),
  ('young', 'Mouth', 'Gargling', 150),
  ('old', 'Mouth', 'Gold Smile', 150),
  ('young', 'Mouth', 'Gold Smile', 150),
  ('old', 'Mouth', 'Grin', 100),
  ('young', 'Mouth', 'Grin', 100),
  ('old', 'Mouth', 'Grin + Ciggy', 150),
  ('young', 'Mouth', 'Grin + Ciggy', 150),
  ('old', 'Mouth', 'Grin + J', 150),
  ('young', 'Mouth', 'Grin + J', 150),
  ('old', 'Mouth', 'Licking Nose', 150),
  ('young', 'Mouth', 'Licking Nose', 150),
  ('old', 'Mouth', 'Meat', 300),
  ('young', 'Mouth', 'Meat', 300),
  ('old', 'Mouth', 'Money Mouth', 250),
  ('young', 'Mouth', 'Money Mouth', 250),
  ('old', 'Mouth', 'Party Horn', 200),
  ('young', 'Mouth', 'Party Horn', 200),
  ('old', 'Mouth', 'Pipe', 150),
  ('young', 'Mouth', 'Pipe', 150),
  ('old', 'Mouth', 'Roaring', 100),
  ('young', 'Mouth', 'Roaring', 100),
  ('old', 'Mouth', 'Sad', 250),
  ('young', 'Mouth', 'Sad', 250),
  ('old', 'Mouth', 'Smirk', 150),
  ('young', 'Mouth', 'Smirk', 150),
  ('old', 'Mouth', 'Smirk + J', 150),
  ('young', 'Mouth', 'Smirk + J', 150),
  ('old', 'Mouth', 'Surprised', 150),
  ('young', 'Mouth', 'Surprised', 150),
  ('old', 'Mouth', 'Tongue Out', 150),
  ('young', 'Mouth', 'Tongue Out', 150),
  ('old', 'Mouth', 'Tongue Out + Saliva', 150),
  ('young', 'Mouth', 'Tongue Out + Saliva', 150),
  ('old', 'Mouth', 'Whistle', 200),
  ('young', 'Mouth', 'Whistle', 200),
  ('old', 'Mouth', 'Yawning', 150),
  ('young', 'Mouth', 'Yawning', 150),
  ('old', 'Mouth', 'Yelling', 150),
  ('young', 'Mouth', 'Yelling', 150),
  ('old', 'Headgear', 'Black Cap', 150),
  ('young', 'Headgear', 'Black Cap', 150),
  ('old', 'Headgear', 'Bucket Hat', 250),
  ('young', 'Headgear', 'Bucket Hat', 250),
  ('old', 'Headgear', 'Bunny Ears', 150),
  ('young', 'Headgear', 'Bunny Ears', 150),
  ('old', 'Headgear', 'Crown', 850),
  ('young', 'Headgear', 'Crown', 850),
  ('old', 'Headgear', 'Halo', 100),
  ('young', 'Headgear', 'Halo', 100),
  ('old', 'Headgear', 'Horns', 100),
  ('young', 'Headgear', 'Horns', 100),
  ('old', 'Headgear', 'LAZY Hat', 1000),
  ('young', 'Headgear', 'LAZY Hat', 1000),
  ('old', 'Headgear', 'Party Hat', 500),
  ('young', 'Headgear', 'Party Hat', 500),
  ('old', 'Headgear', 'Pirate Hat', 150),
  ('young', 'Headgear', 'Pirate Hat', 150),
  ('old', 'Headgear', 'Police Hat', 150),
  ('young', 'Headgear', 'Police Hat', 150),
  ('old', 'Headgear', 'Safari Hat', 200),
  ('young', 'Headgear', 'Safari Hat', 200),
  ('old', 'Headgear', 'Santa Hat', 250),
  ('young', 'Headgear', 'Santa Hat', 250),
  ('old', 'Headgear', 'Sea Captain Hat', 150),
  ('young', 'Headgear', 'Sea Captain Hat', 150),
  ('old', 'Headgear', 'Sheriff Hat', 300),
  ('young', 'Headgear', 'Sheriff Hat', 300),
  ('old', 'Headgear', 'Spinner Hat', 150),
  ('young', 'Headgear', 'Spinner Hat', 150),
  ('old', 'Headgear', 'Straw Beach Hat', 300),
  ('young', 'Headgear', 'Straw Beach Hat', 300),
  ('old', 'Headgear', 'Top Hat', 200),
  ('young', 'Headgear', 'Top Hat', 200),
  ('old', 'Headgear', 'Wizard Hat', 250),
  ('young', 'Headgear', 'Wizard Hat', 250),
  ('old', 'Bodygear', 'Black Hoodie', 550),
  ('young', 'Bodygear', 'Black Hoodie', 550),
  ('old', 'Bodygear', 'Business Shirt', 150),
  ('young', 'Bodygear', 'Business Shirt', 150),
  ('old', 'Bodygear', 'Chef Uniform', 150),
  ('young', 'Bodygear', 'Chef Uniform', 150),
  ('old', 'Bodygear', 'Coconut Bra', 250),
  ('young', 'Bodygear', 'Coconut Bra', 250),
  ('old', 'Bodygear', 'Ethereum Business Shirt', 150),
  ('young', 'Bodygear', 'Ethereum Business Shirt', 150),
  ('old', 'Bodygear', 'Ethereum Shirt', 150),
  ('young', 'Bodygear', 'Ethereum Shirt', 150),
  ('old', 'Bodygear', 'Floaties', 150),
  ('young', 'Bodygear', 'Floaties', 150),
  ('old', 'Bodygear', 'Football Jersey - Blue', 300),
  ('young', 'Bodygear', 'Football Jersey - Blue', 300),
  ('old', 'Bodygear', 'Football Jersey - Red', 300),
  ('young', 'Bodygear', 'Football Jersey - Red', 300),
  ('old', 'Bodygear', 'Gladiator Armour', 400),
  ('young', 'Bodygear', 'Gladiator Armour', 400),
  ('old', 'Bodygear', 'Gold Chain', 300),
  ('young', 'Bodygear', 'Gold Chain', 300),
  ('old', 'Bodygear', 'Hawaiian Shirt', 250),
  ('young', 'Bodygear', 'Hawaiian Shirt', 250),
  ('old', 'Bodygear', 'Lab Coat', 150),
  ('young', 'Bodygear', 'Lab Coat', 150),
  ('old', 'Bodygear', 'Lederhosen', 500),
  ('young', 'Bodygear', 'Lederhosen', 500),
  ('old', 'Bodygear', 'Leopard Fur Coat', 550),
  ('young', 'Bodygear', 'Leopard Fur Coat', 550),
  ('old', 'Bodygear', 'Lion Shirt', 150),
  ('young', 'Bodygear', 'Lion Shirt', 150),
  ('old', 'Bodygear', 'Police Uniform', 150),
  ('young', 'Bodygear', 'Police Uniform', 150),
  ('old', 'Bodygear', 'Purple Fur Coat', 150),
  ('young', 'Bodygear', 'Purple Fur Coat', 150),
  ('old', 'Bodygear', 'Ranger Shirt', 250),
  ('young', 'Bodygear', 'Ranger Shirt', 250),
  ('old', 'Bodygear', 'Referee Shirt', 150),
  ('young', 'Bodygear', 'Referee Shirt', 150),
  ('old', 'Bodygear', 'Ripped Shirt - Black', 150),
  ('young', 'Bodygear', 'Ripped Shirt - Black', 150),
  ('old', 'Bodygear', 'Ripped Shirt - White', 150),
  ('young', 'Bodygear', 'Ripped Shirt - White', 150),
  ('old', 'Bodygear', 'Space Suit', 500),
  ('young', 'Bodygear', 'Space Suit', 500),
  ('old', 'Earring', 'Dagger', 300),
  ('young', 'Earring', 'Dagger', 300),
  ('old', 'Earring', 'Diamond Stud', 100),
  ('young', 'Earring', 'Diamond Stud', 100),
  ('old', 'Earring', 'Ethereum', 200),
  ('young', 'Earring', 'Ethereum', 200),
  ('old', 'Earring', 'Green Ball', 100),
  ('young', 'Earring', 'Green Ball', 100),
  ('old', 'Earring', 'Lion Head', 150),
  ('young', 'Earring', 'Lion Head', 150),
  ('old', 'Earring', 'Small Gold Hoop', 100),
  ('young', 'Earring', 'Small Gold Hoop', 100);
-- END TRAIT PRICES

