-- Safe to run again. Only adds admin_coin_totals. Reads coin records, changes nothing.
-- Totals across every player for the admin Coin economy card:
--   shop and wardrobe spending, from coin_ledger labels (see coin-history.sql),
--   game and weekly prize coins, from coin_grants (complete since coins began),
--   daily task coins, from coin_ledger labels.
-- p_days limits it to the last that many days. Null means all time.

create or replace function public.admin_coin_totals(p_days integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := case
    when p_days is null or p_days <= 0 then '-infinity'::timestamptz
    else now() - make_interval(days => p_days)
  end;
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'shopCoins', (
      select coalesce(-sum(amount), 0)::integer from public.coin_ledger
      where reason like 'Spent: Shop%' and created_at >= since
    ),
    'shopCount', (
      select count(*)::integer from public.coin_ledger
      where reason like 'Spent: Shop%' and created_at >= since
    ),
    'wardrobeCoins', (
      select coalesce(-sum(amount), 0)::integer from public.coin_ledger
      where reason like 'Spent: Wardrobe%' and created_at >= since
    ),
    'wardrobeCount', (
      select count(*)::integer from public.coin_ledger
      where reason like 'Spent: Wardrobe%' and created_at >= since
    ),
    'grants', (
      select coalesce(jsonb_object_agg(g.source, g.total), '{}'::jsonb)
      from (
        select source, sum(amount)::integer as total
        from public.coin_grants
        where created_at >= since
        group by source
      ) g
    ),
    'dailyCoins', (
      select coalesce(sum(amount), 0)::integer from public.coin_ledger
      where reason in ('Earned: Daily challenge', 'Earned: Daily bonus roll') and created_at >= since
    ),
    'labelsSince', (
      select min(created_at) from public.coin_ledger
      where reason like 'Spent:%' or reason like 'Earned:%'
    )
  );
end;
$$;

revoke all on function public.admin_coin_totals(integer) from public, anon, authenticated;
grant execute on function public.admin_coin_totals(integer) to authenticated;
