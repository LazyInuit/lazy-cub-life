-- Safe to run again. Do not run coins.sql or leaderboard.sql again.
-- When a week ends (Monday, US Eastern), the overall board pays once:
-- 1st 500 Cub Cash, 2nd 200, 3rd 100.
-- Ties follow the board: higher score, then username.
-- A week that already has a prize row is left alone, so the LazyCubLife
-- preview is not paid and does not pick up real 2nd or 3rd places.

create table if not exists public.weekly_overall_prizes (
  week_start date not null,
  place integer not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null,
  amount integer not null,
  awarded_at timestamptz not null default now(),
  primary key (week_start, place),
  constraint weekly_overall_prizes_place_check check (place between 1 and 3),
  constraint weekly_overall_prizes_amount_check check (
    amount = case place when 1 then 500 when 2 then 200 else 100 end
  )
);

alter table public.weekly_overall_prizes
  add column if not exists place integer;

update public.weekly_overall_prizes
set place = 1
where place is null;

alter table public.weekly_overall_prizes
  alter column place set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.weekly_overall_prizes'::regclass
      and conname = 'weekly_overall_prizes_pkey'
      and pg_get_constraintdef(oid) not like '%place%'
  ) then
    alter table public.weekly_overall_prizes drop constraint weekly_overall_prizes_pkey;
    alter table public.weekly_overall_prizes
      add constraint weekly_overall_prizes_pkey primary key (week_start, place);
  end if;
end $$;

alter table public.weekly_overall_prizes drop constraint if exists weekly_overall_prizes_place_check;
alter table public.weekly_overall_prizes drop constraint if exists weekly_overall_prizes_amount_check;

alter table public.weekly_overall_prizes
  add constraint weekly_overall_prizes_place_check check (place between 1 and 3);

alter table public.weekly_overall_prizes
  add constraint weekly_overall_prizes_amount_check check (
    amount = case place when 1 then 500 when 2 then 200 else 100 end
  );

alter table public.weekly_overall_prizes enable row level security;
revoke all on public.weekly_overall_prizes from anon, authenticated;

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
        case place when 1 then 500 when 2 then 200 else 100 end as amount
      from ranked
      where place <= 3
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
  where week_start = previous;

  select cub_cash into balance from public.profiles where id = uid;
  return jsonb_build_object(
    'cubCash', coalesce(balance, 0),
    'granted', caller_grant,
    'winners', winners_json
  );
end;
$$;

revoke all on function public.settle_weekly_overall_prize() from public, anon, authenticated;
grant execute on function public.settle_weekly_overall_prize() to authenticated;

-- Preview for the week that just ended. Does not pay coins.
-- The following Monday, the settle function picks that week's real top three.
insert into public.weekly_overall_prizes (week_start, place, user_id, username, amount)
select public.eastern_week_start() - 7, 1, u.id, 'LazyCubLife', 500
from auth.users u
where lower(u.email) = 'lazycublife@users.lazycub.life'
on conflict (week_start, place) do update
set user_id = excluded.user_id,
    username = excluded.username,
    amount = excluded.amount;
