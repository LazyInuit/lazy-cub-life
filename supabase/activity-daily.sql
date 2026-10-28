-- Safe to run again. Do not run coins.sql, leaderboard.sql, or admin.sql again.
-- Keeps time played per player, per UK day, per area, so the admin page can show today and the
-- last 7 days as well as the all-time totals. Days start from when this is first run; the
-- all-time totals on profiles are not touched.

create table if not exists public.activity_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  area text not null,
  seconds integer not null default 0 check (seconds >= 0),
  primary key (user_id, day, area)
);

-- Only reached through the functions below.
alter table public.activity_daily enable row level security;

-- From lazy-river.sql, now also adding the seconds to today's row.
create or replace function public.record_activity(p_area text, p_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  stored jsonb;
  last_at timestamptz;
  current_seconds integer := 0;
  allowed integer := p_seconds;
  elapsed integer;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if p_area not in ('home', 'wardrobe', 'flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river') then
    raise exception 'Bad activity area';
  end if;
  if p_seconds is null or p_seconds < 1 or p_seconds > 90 then
    raise exception 'Bad activity time';
  end if;

  select coalesce(activity, '{}'::jsonb), activity_at
  into stored, last_at
  from public.profiles
  where id = uid
  for update;

  if not found then
    return 0;
  end if;
  if last_at is not null then
    elapsed := floor(extract(epoch from (clock_timestamp() - last_at)));
    allowed := least(allowed, greatest(0, elapsed + 5));
  end if;
  if allowed < 1 then
    return 0;
  end if;
  if coalesce(stored->>p_area, '') ~ '^[0-9]+$' then
    current_seconds := (stored->>p_area)::integer;
  end if;

  update public.profiles
    set activity = jsonb_set(stored, array[p_area], to_jsonb(current_seconds + allowed), true),
        activity_at = clock_timestamp()
    where id = uid;

  insert into public.activity_daily (user_id, day, area, seconds)
  values (uid, (now() at time zone 'Europe/London')::date, p_area, allowed)
  on conflict (user_id, day, area)
  do update set seconds = public.activity_daily.seconds + excluded.seconds;

  return allowed;
end;
$$;

-- One player's seconds per area over the last p_days UK days, counting today as day 1.
-- Also says which day daily tracking began, so the page can explain shorter histories.
create or replace function public.admin_activity_range(p_player uuid, p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
  days integer := least(greatest(coalesce(p_days, 1), 1), 366);
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'areas', (
      select coalesce(jsonb_object_agg(area, total), '{}'::jsonb)
      from (
        select area, sum(seconds)::integer as total
        from public.activity_daily
        where user_id = p_player and day > today - days
        group by area
      ) rows
    ),
    'since', (select to_char(min(day), 'YYYY-MM-DD') from public.activity_daily)
  );
end;
$$;

revoke all on function public.record_activity(text, integer) from public, anon, authenticated;
revoke all on function public.admin_activity_range(uuid, integer) from public, anon, authenticated;
grant execute on function public.record_activity(text, integer) to authenticated;
grant execute on function public.admin_activity_range(uuid, integer) to authenticated;
