-- Checks for cub-power.sql. Run after it, in the Supabase SQL editor. Changes nothing:
-- everything runs in one block that always ends with an error, which undoes every test write.
--   Passed:  ERROR: Cub Power tests passed. (This error is on purpose so nothing is saved.)
--   Failed:  ERROR: assertion failed: <which check>
-- Uses the LazyCubLife account (or the first profile) as the test player.

do $$
declare
  test_user uuid;
  today date := (now() at time zone 'utc')::date;
  this_week date := public.eastern_week_start();
  hoops public.power_games;
  power jsonb;
  before_power jsonb;
  step jsonb;
  cash_before integer;
  cash_after integer;
  rows_before bigint;
  sum_before bigint;
  rows_after bigint;
  sum_after bigint;
  settled integer;
  resettled integer;
  current_boost integer;
  trait record;
  bought jsonb;
  pct integer;
  ledger_before integer;
  ledger_after integer;
  n integer;
begin
  select id into test_user from auth.users where lower(email) = 'lazycublife@users.lazycub.life';
  if test_user is null then
    select id into test_user from public.profiles order by id limit 1;
  end if;
  assert test_user is not null, 'a player to test with';
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', test_user, 'role', 'authenticated')::text, true);
  select count(*), coalesce(sum(score), 0) into rows_before, sum_before from public.leaderboard_scores;

  -- Badge Power
  assert public.power_badge_power(400, 7) = 400, '7 games, 400 points = 400';
  assert public.power_badge_power(400, 8) = 350, '8 games, 400 points = 350';
  assert public.power_badge_power(400, 10) = 280, '10 games, 400 points = 280';
  assert public.power_badge_power(400, 15) = 186, '15 games, 400 points = 186';
  assert public.power_badge_power(400, 20) = 140, '20 games, 400 points = 140';
  assert public.power_badge_power(700, 7) = 700, '7 Diamonds = 700';
  assert public.power_badge_power(2000, 20) = 700, '20 Diamonds = 700';
  assert public.power_badge_power(400, 0) = 0, 'no games = 0';
  select * into hoops from public.power_games where game = 'hoops';
  assert public.power_badge_points(80000, hoops) = 75, 'Platinum alone scores 75, tiers do not stack';
  assert public.power_badge_points(4999, hoops) = 0, 'below Bronze scores 0';
  assert public.power_badge_points(999999, hoops) = 100, 'Diamond scores 100';

  -- Released games only: an unreleased game changes nothing, a released one lowers badge Power.
  before_power := public.cub_power_of(test_user);
  insert into public.power_games (game, title, sort, released, bronze, silver, gold, platinum, diamond)
  values ('test-unreleased', 'Test', 99, false, 1, 2, 3, 4, 5);
  power := public.cub_power_of(test_user);
  assert (power->>'activeGames')::int = (before_power->>'activeGames')::int, 'unreleased game not counted';
  assert (power->>'badgePower')::int = (before_power->>'badgePower')::int, 'unreleased game leaves badge Power alone';
  insert into public.power_games (game, title, sort, released, bronze, silver, gold, platinum, diamond)
  values ('test-new', 'Test New', 99, true, 1000000, 1000001, 1000002, 1000003, 1000004);
  power := public.cub_power_of(test_user);
  assert (power->>'activeGames')::int = (before_power->>'activeGames')::int + 1, 'new game counted';
  assert (power->>'badgePower')::int = public.power_badge_power((before_power->>'badgePoints')::int, (power->>'activeGames')::int),
    'new game lowers badge Power to points * 7 / games';
  delete from public.power_games where game in ('test-unreleased', 'test-new');

  -- Level Power and the level curve
  assert public.power_level_points(22) = 110, 'level 22 = 110';
  assert public.power_level_points(30) = 140, 'level 30 = 140';
  assert public.power_level_points(50) = 200, 'level 50 = 200';
  assert public.power_level_points(80) = 260, 'level 80 = 260';
  assert public.power_level_points(100) = 300, 'level 100 = 300';
  assert public.power_level_points(150) = 350, 'level 150 = 350';
  assert public.power_level_points(-5) = 0, 'negative level = 0';
  assert public.power_level(0) = 1, '0 XP is level 1';
  assert public.power_level(59.5) = 1, '59.5 XP is level 1';
  assert public.power_level(60) = 2, '60 XP is level 2';
  assert public.power_level(7560) = 22, '7,560 XP is level 22';
  assert public.power_level(7559.5) = 21, '7,559.5 XP is level 21';
  assert public.power_level(100000000) = 99, 'level cap 99, as in the app';

  -- Streak multiplier
  assert public.power_after_streak(510, 0) = 510, 'no streak x1.00';
  assert public.power_after_streak(510, 1) = 535, 'day 1 x1.05';
  assert public.power_after_streak(510, 7) = 688, 'day 7 x1.35 = 688';
  assert public.power_after_streak(510, 30) = 688, 'longer streaks stay x1.35';

  -- Check-ins
  delete from public.login_streaks where user_id = test_user;
  perform public.power_check_in(test_user);
  assert (select streak from public.login_streaks where user_id = test_user) = 1, 'first day is day 1';
  perform public.power_check_in(test_user);
  assert (select streak from public.login_streaks where user_id = test_user) = 1, 'second login the same day does not add';
  update public.login_streaks set last_day = today - 1, streak = 3 where user_id = test_user;
  perform public.power_check_in(test_user);
  assert (select streak from public.login_streaks where user_id = test_user) = 4, 'the next day adds one';
  update public.login_streaks set last_day = today - 3, streak = 6 where user_id = test_user;
  perform public.power_check_in(test_user);
  assert (select streak from public.login_streaks where user_id = test_user) = 1, 'a missed day starts again at 1';
  update public.login_streaks set last_day = today - 1, streak = 12 where user_id = test_user;
  power := public.cub_power_of(test_user);
  assert (power->>'streakDays')::int = 7 and (power->>'streakMultiplier')::int = 135, 'yesterday''s 12-day streak still counts, capped at 7';
  update public.login_streaks set last_day = today - 2 where user_id = test_user;
  power := public.cub_power_of(test_user);
  assert (power->>'streakDays')::int = 0 and (power->>'streakMultiplier')::int = 100, 'a missed day drops the multiplier without logging in';
  assert (power->>'streakPower')::int = (power->>'basePower')::int, 'no streak leaves base Power';

  -- Weekly boost
  assert public.power_weekly_boost(1) = 100 and public.power_weekly_boost(2) = 75 and public.power_weekly_boost(3) = 50, 'top 3 boosts';
  assert public.power_weekly_boost(4) = 25 and public.power_weekly_boost(10) = 25 and public.power_weekly_boost(11) = 0, '4th-10th +25, 11th 0';
  delete from public.weekly_power_boosts where week_start = this_week - 7;
  delete from public.weekly_power_weeks where week_start = this_week - 7;
  perform public.settle_power_boosts();
  select count(*) into settled from public.weekly_power_boosts where week_start = this_week - 7;
  perform public.settle_power_boosts();
  select count(*) into resettled from public.weekly_power_boosts where week_start = this_week - 7;
  assert settled = resettled, 'settling twice adds nothing';
  assert settled <= 10, 'at most 10 boosts a week';
  assert not exists (
    select 1 from public.weekly_power_boosts
    where week_start = this_week - 7 and boost <> public.power_weekly_boost(place)
  ), 'each boost matches its place';
  select coalesce((select boost from public.weekly_power_boosts where week_start = this_week - 7 and user_id = test_user), 0)
    into current_boost;
  insert into public.weekly_power_boosts (week_start, user_id, place, boost)
  values (this_week - 14, test_user, 1, 100)
  on conflict (week_start, user_id) do update set place = 1, boost = 100;
  power := public.cub_power_of(test_user);
  assert (power->>'boost')::int = current_boost, 'a boost from two weeks ago has expired and does not stack';
  assert (power->>'total')::int = (power->>'streakPower')::int + current_boost, 'boost is added after the streak';

  -- Benefits
  assert public.power_percent(99) = 0 and public.power_percent(100) = 1, '100 Power = 1%';
  assert public.power_percent(688) = 6, '688 = 6%';
  assert public.power_percent(788) = 7, '788 = 7%';
  assert public.power_percent(999) = 9, '999 = 9%';
  assert public.power_percent(1000) = 10, '1,000 = 10%';
  assert public.power_percent(1500) = 10, '1,500 still 10%';

  -- Bonus Cub Cash leftover: 10 coins at 6% pays 0, 1, 0 and leaves 60, 20, 80.
  perform set_config('cub.cash_write', 'allow', true);
  update public.profiles set coin_bonus_hundredths = 0 where id = test_user;
  select cub_cash into cash_before from public.profiles where id = test_user;
  step := public.power_apply_coin_bonus(test_user, 10, 6);
  assert (step->>'bonus')::int = 0 and (step->>'remainder')::int = 60, 'round 1: 0 paid, 60 left';
  step := public.power_apply_coin_bonus(test_user, 10, 6);
  assert (step->>'bonus')::int = 1 and (step->>'remainder')::int = 20, 'round 2: 1 paid, 20 left';
  step := public.power_apply_coin_bonus(test_user, 10, 6);
  assert (step->>'bonus')::int = 0 and (step->>'remainder')::int = 80, 'round 3: 0 paid, 80 left';
  step := public.power_apply_coin_bonus(test_user, 10, 0);
  assert (step->>'remainder')::int = 80, 'leftover kept at 0%';
  select cub_cash into cash_after from public.profiles where id = test_user;
  assert cash_after = cash_before + 1, 'three rounds at 6% paid 1 Cub Cash';
  assert (select coin_bonus_hundredths from public.profiles where id = test_user) = 80, 'leftover stored';
  update public.profiles set coin_bonus_hundredths = 0 where id = test_user;
  for n in 1..10 loop
    perform public.power_apply_coin_bonus(test_user, 10, 1);
  end loop;
  select cub_cash into cash_after from public.profiles where id = test_user;
  assert cash_after = cash_before + 2, 'ten rounds at 1% paid 1 more';

  -- A game payout: base coins plus the bonus, once per nonce, with a labelled ledger line.
  delete from public.coin_grants where user_id = test_user;
  update public.profiles set coin_bonus_hundredths = 0 where id = test_user;
  select cub_cash into cash_before from public.profiles where id = test_user;
  perform public.power_refresh(test_user);
  pct := (public.cub_power_of(test_user)->>'percent')::int;
  select count(*) into ledger_before from public.coin_ledger
  where user_id = test_user and reason = 'Earned: Cub Power bonus';
  step := public.grant_game_coins('river', 80, 'cub-power-test-nonce');
  assert (step->>'granted')::int = 80, 'payout accepted';
  assert (step->>'bonus')::int = 80 * pct / 100, 'bonus matches the server percent';
  select cub_cash into cash_after from public.profiles where id = test_user;
  assert cash_after = cash_before + 80 + (step->>'bonus')::int, 'balance rose by base plus bonus';
  step := public.grant_game_coins('river', 80, 'cub-power-test-nonce');
  assert (step->>'granted')::int = 0, 'the same payout twice pays nothing';
  assert (select cub_cash from public.profiles where id = test_user) = cash_after, 'no second payment';
  select count(*) into ledger_after from public.coin_ledger
  where user_id = test_user and reason = 'Earned: Cub Power bonus';
  assert ledger_after - ledger_before = case when 80 * pct / 100 > 0 then 1 else 0 end, 'bonus has its own history line';
  assert (select count(*) from public.coin_grants where user_id = test_user and nonce = 'cub-power-test-nonce') = 1,
    'the limits only count the base coins';

  -- Wardrobe discount, charged on the server.
  select tp.age, tp.category, tp.name, tp.price into trait
  from public.trait_prices tp
  where not coalesce((select save->'unlockedTraits' from public.profiles where id = test_user), '[]'::jsonb)
    ? (tp.age || ':' || tp.category || ':' || tp.name)
  order by tp.price desc
  limit 1;
  if found then
    update public.profiles set cub_cash = 1000000 where id = test_user;
    perform public.power_refresh(test_user);
    pct := (public.cub_power_of(test_user)->>'percent')::int;
    bought := public.purchase_trait(trait.age, trait.category, trait.name);
    assert (bought->>'ok')::boolean, 'purchase went through';
    assert (bought->>'paid')::int = public.power_discounted_price(trait.price, pct), 'paid the discounted price';
    assert (bought->>'paid')::int = ceil(trait.price * (100 - pct) / 100.0), 'discount rounds up to a whole coin';
    assert (select cub_cash from public.profiles where id = test_user) = 1000000 - (bought->>'paid')::int, 'balance dropped by the paid price';
    assert (bought->>'xp')::int = round(trait.price * 0.1), 'XP reward still from the full price';
  end if;
  assert public.power_discounted_price(100, 6) = 94, '100 at 6% = 94';
  assert public.power_discounted_price(125, 3) = 122, '125 at 3% rounds up to 122';
  assert public.power_discounted_price(1000, 25) = 900, 'never more than 10% off';

  -- Cub Power never touches leaderboard scores.
  select count(*), coalesce(sum(score), 0) into rows_after, sum_after from public.leaderboard_scores;
  assert rows_after = rows_before and sum_after = sum_before, 'leaderboard scores unchanged';

  raise exception 'Cub Power tests passed. (This error is on purpose so nothing is saved.)';
end;
$$;
