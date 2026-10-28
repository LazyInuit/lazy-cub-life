-- Safe to run again. Do not run coins.sql, leaderboard.sql, or admin.sql again.
-- Anonymous daily counts for the demo version: how many devices started a demo, which games
-- demo players tried, and how many then created an account. Only a count per UK day is kept:
-- no usernames, IDs or IP addresses. Each device sends each count at most once a day.

create table if not exists public.demo_counts (
  day date not null,
  event text not null,
  count integer not null default 0 check (count >= 0),
  primary key (day, event)
);

-- Only reached through the functions below.
alter table public.demo_counts enable row level security;

-- Called by the game, signed in or not. Events: start, signup, play:<game>.
create or replace function public.count_demo(p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
begin
  if p_event is null
    or not (p_event in ('start', 'signup') or p_event ~ '^play:(flight|match|dojo|archer|hoops|bubble|river)$') then
    return;
  end if;
  insert into public.demo_counts (day, event, count)
  values (today, p_event, 1)
  on conflict (day, event)
  -- A ceiling so a script hammering the counter cannot run it up without limit.
  do update set count = least(public.demo_counts.count + 1, 100000);
end;
$$;

-- For the admin page: demo players and sign-ups today, this week and all time, demo players per
-- day for the last 14 days, and demo runs per game this week and all time.
create or replace function public.admin_demo_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'startsToday', (select coalesce(sum(count), 0) from public.demo_counts where event = 'start' and day = today),
    'startsWeek', (select coalesce(sum(count), 0) from public.demo_counts where event = 'start' and day > today - 7),
    'startsAll', (select coalesce(sum(count), 0) from public.demo_counts where event = 'start'),
    'signupsToday', (select coalesce(sum(count), 0) from public.demo_counts where event = 'signup' and day = today),
    'signupsWeek', (select coalesce(sum(count), 0) from public.demo_counts where event = 'signup' and day > today - 7),
    'signupsAll', (select coalesce(sum(count), 0) from public.demo_counts where event = 'signup'),
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', to_char(d.day, 'YYYY-MM-DD'),
        'count', coalesce((select count from public.demo_counts c where c.day = d.day and c.event = 'start'), 0)
      ) order by d.day), '[]'::jsonb)
      from (select generate_series(today - 13, today, interval '1 day')::date as day) d
    ),
    'gamesWeek', (
      select coalesce(jsonb_object_agg(substring(event from 6), total), '{}'::jsonb)
      from (
        select event, sum(count)::integer as total from public.demo_counts
        where event like 'play:%' and day > today - 7
        group by event
      ) week
    ),
    'gamesAll', (
      select coalesce(jsonb_object_agg(substring(event from 6), total), '{}'::jsonb)
      from (
        select event, sum(count)::integer as total from public.demo_counts
        where event like 'play:%'
        group by event
      ) everything
    ),
    'since', (select to_char(min(day), 'YYYY-MM-DD') from public.demo_counts)
  );
end;
$$;

revoke all on function public.count_demo(text) from public, anon, authenticated;
revoke all on function public.admin_demo_stats() from public, anon, authenticated;
grant execute on function public.count_demo(text) to anon, authenticated;
grant execute on function public.admin_demo_stats() to authenticated;
