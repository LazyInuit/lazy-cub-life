-- Safe to run again. Do not run coins.sql, leaderboard.sql, or admin.sql again.
-- Labels every Cub Cash change in coin_ledger so the admin screen can show what
-- each player spent coins on (wardrobe items, drinks) and where coins came from
-- (games, daily tasks, weekly prizes, admin changes). Only changes the logging
-- trigger and the admin history reader. Balances and saves are not touched.
-- Older entries keep their old "balance change" label.

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

drop trigger if exists log_cub_cash on public.profiles;
create trigger log_cub_cash
  after update of cub_cash on public.profiles
  for each row execute function public.log_cub_cash();

-- The admin history now returns up to 200 entries. The subquery is named
-- "entries" because "found" is a built-in PL/pgSQL variable and clashes with it.
create or replace function public.admin_history(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  return (
    select coalesce(jsonb_agg(to_jsonb(entries) order by entries.created_at desc), '[]'::jsonb)
    from (
      select
        ledger.amount,
        ledger.balance_after,
        ledger.reason,
        ledger.created_at,
        actor.username as actor
      from public.coin_ledger ledger
      left join public.profiles actor on actor.id = ledger.actor_id
      where ledger.user_id = p_player
      order by ledger.created_at desc, ledger.id desc
      limit 200
    ) entries
  );
end;
$$;

revoke all on function public.admin_history(uuid) from public, anon, authenticated;
grant execute on function public.admin_history(uuid) to authenticated;
