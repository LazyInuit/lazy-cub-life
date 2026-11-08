-- Safe to run again. Do not run coins.sql, leaderboard.sql, or admin.sql again.
-- Daily counts of what players do with their scorecards and replays, for the admin page:
-- images saved, replays saved, X posts opened, and images or replays sent through the phone's
-- share menu. Only a count per game per UK day is kept: no usernames, IDs or IP addresses.
-- The game counts each action once per scorecard, so saving the same image twice counts once.

create table if not exists public.share_counts (
  day date not null,
  game text not null,
  event text not null,
  count integer not null default 0 check (count >= 0),
  primary key (day, game, event)
);

-- Only reached through the functions below.
alter table public.share_counts enable row level security;

-- Called by the game, signed in or not (the demo can share too).
create or replace function public.count_share(p_game text, p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
begin
  if p_game is null
    or p_game not in ('flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river', 'solitaire', 'baseball')
    or p_event is null
    or p_event not in ('save-image', 'save-replay', 'x-post', 'share-image', 'share-replay') then
    return;
  end if;
  insert into public.share_counts (day, game, event, count)
  values (today, p_game, p_event, 1)
  on conflict (day, game, event)
  -- A ceiling so a script hammering the counter cannot run it up without limit.
  do update set count = least(public.share_counts.count + 1, 1000000);
end;
$$;

-- For the admin page: each game and action with its count today, over the last 7 days and all time.
create or replace function public.admin_share_stats()
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
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'game', totals.game,
        'event', totals.event,
        'today', totals.on_day,
        'week', totals.in_week,
        'all', totals.ever
      )), '[]'::jsonb)
      from (
        select
          c.game,
          c.event,
          coalesce(sum(c.count) filter (where c.day = today), 0)::integer as on_day,
          coalesce(sum(c.count) filter (where c.day > today - 7), 0)::integer as in_week,
          sum(c.count)::integer as ever
        from public.share_counts c
        group by c.game, c.event
      ) totals
    ),
    'since', (select to_char(min(day), 'YYYY-MM-DD') from public.share_counts)
  );
end;
$$;

revoke all on function public.count_share(text, text) from public, anon, authenticated;
revoke all on function public.admin_share_stats() from public, anon, authenticated;
grant execute on function public.count_share(text, text) to anon, authenticated;
grant execute on function public.admin_share_stats() to authenticated;
