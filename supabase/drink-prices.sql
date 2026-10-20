-- Safe to run again. Do not run coins.sql, leaderboard.sql, or admin.sql again.
-- Shop drink prices: Milk 3 coins, Juice 5 coins. Replaces only buy_drink.
-- The purchase now names the drink for coin_ledger, so the admin coin history
-- and coin economy keep labelling drinks correctly at any price.

create or replace function public.buy_drink(p_drink text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cost integer;
  gain integer;
  label text;
  balance integer;
  save_row jsonb;
  energy integer;
  next_energy integer;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if p_drink = 'milk' then
    cost := 3;
    gain := 50;
    label := 'Milk';
  elsif p_drink = 'juice' then
    cost := 5;
    gain := 100;
    label := 'Juice';
  else
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;
  select cub_cash, save into balance, save_row from public.profiles where id = uid;
  energy := least(100, greatest(0, coalesce((save_row->>'energy')::integer, 0)));
  if energy >= 100 then
    return jsonb_build_object('ok', false, 'reason', 'full', 'cubCash', balance, 'energy', energy);
  end if;
  if balance < cost then
    return jsonb_build_object('ok', false, 'reason', 'broke', 'cubCash', balance, 'energy', energy);
  end if;
  next_energy := least(100, energy + gain);
  perform set_config('cub.cash_write', 'allow', true);
  perform set_config('cub.cash_reason', 'Spent: Shop - ' || label, true);
  update public.profiles
    set cub_cash = cub_cash - cost,
        save = jsonb_set(save, '{energy}', to_jsonb(next_energy), true)
    where id = uid
    returning cub_cash into balance;
  return jsonb_build_object('ok', true, 'cubCash', balance, 'energy', next_energy);
end;
$$;
