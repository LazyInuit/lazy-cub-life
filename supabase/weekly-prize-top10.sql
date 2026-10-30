-- Safe to run again. Run after weekly-prize.sql; do not run weekly-prize.sql again afterwards.
-- The overall weekly board now also pays 4th to 10th place 10 Cub Cash each (1st 500, 2nd 200, 3rd 100 as before).
-- Weeks already paid are left alone, so this starts with the week running now.
-- Last week's winners shown on the board stay the top three.

alter table public.weekly_overall_prizes drop constraint if exists weekly_overall_prizes_place_check;
alter table public.weekly_overall_prizes drop constraint if exists weekly_overall_prizes_amount_check;

alter table public.weekly_overall_prizes
  add constraint weekly_overall_prizes_place_check check (place between 1 and 10);

alter table public.weekly_overall_prizes
  add constraint weekly_overall_prizes_amount_check check (
    amount = case place when 1 then 500 when 2 then 200 when 3 then 100 else 10 end
  );

-- From weekly-prize.sql, now paying places 1 to 10.
create or replace function public.settle_weekly_overall_prize()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  previous date;
  caller_grant integer := 0;
  balance integer;
  winners_json jsonb;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;

  previous := public.eastern_week_start() - 7;

  if not exists (
    select 1 from public.weekly_overall_prizes where week_start = previous
  ) then
    perform set_config('cub.cash_write', 'allow', true);

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
        p.username,
        row_number() over (order by t.score desc, p.username) as place
      from totals t
      join public.profiles p on p.id = t.user_id
      where not coalesce(p.banned, false)
        and coalesce(p.username, '') <> ''
    ),
    placed as (
      select
        user_id,
        username,
        place,
        case place when 1 then 500 when 2 then 200 when 3 then 100 else 10 end as amount
      from ranked
      where place <= 10
    ),
    inserted as (
      insert into public.weekly_overall_prizes (week_start, place, user_id, username, amount)
      select previous, place, user_id, username, amount
      from placed
      on conflict (week_start, place) do nothing
      returning user_id, place, amount
    ),
    recorded as (
      insert into public.coin_grants (user_id, source, amount, nonce)
      select
        user_id,
        'weekly-overall',
        amount,
        'weekly-overall-' || previous::text || '-' || place::text
      from inserted
      returning user_id, amount
    ),
    bumped as (
      update public.profiles as profile
      set cub_cash = profile.cub_cash + recorded.amount
      from recorded
      where profile.id = recorded.user_id
      returning recorded.user_id, recorded.amount
    )
    select coalesce(sum(bumped.amount), 0)
    into caller_grant
    from bumped
    where bumped.user_id = uid;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('place', place, 'username', username, 'amount', amount)
      order by place
    ),
    '[]'::jsonb
  )
  into winners_json
  from public.weekly_overall_prizes
  where week_start = previous and place <= 3;

  select cub_cash into balance from public.profiles where id = uid;
  return jsonb_build_object(
    'cubCash', coalesce(balance, 0),
    'granted', caller_grant,
    'winners', winners_json
  );
end;
$$;

-- From demo-access.sql: still only last week's top three by name.
create or replace function public.last_weekly_winners()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('place', w.place, 'username', w.username) order by w.place),
    '[]'::jsonb
  )
  from public.weekly_overall_prizes w
  where w.week_start = public.eastern_week_start() - 7
    and w.place <= 3;
$$;

revoke all on function public.settle_weekly_overall_prize() from public, anon, authenticated;
revoke all on function public.last_weekly_winners() from public, anon, authenticated;
grant execute on function public.settle_weekly_overall_prize() to authenticated;
grant execute on function public.last_weekly_winners() to anon, authenticated;
