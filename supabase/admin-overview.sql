-- Safe to run again. Do not run coins.sql, leaderboard.sql, or admin.sql again.
-- Read-only views for the admin dashboard: an overview of players, sign-ups, games and
-- coin earnings, and a sortable player list. Nothing here changes any data.
-- Days ("today", sign-ups per day) follow UK time.

-- When a player was last in the game: their last recorded activity or their save's last visit.
create or replace function public.admin_last_seen(p_activity_at timestamptz, p_save jsonb)
returns timestamptz
language sql
immutable
as $$
  select nullif(
    greatest(
      coalesce(p_activity_at, '-infinity'::timestamptz),
      case
        when coalesce(p_save->>'lastVisit', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then to_timestamp((p_save->>'lastVisit')::numeric / 1000)
        else '-infinity'::timestamptz
      end
    ),
    '-infinity'::timestamptz
  );
$$;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today timestamptz := date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London';
begin
  perform public.admin_guard();
  return (
    with players as (
      select
        u.id,
        u.created_at,
        coalesce(p.cub_cash, 0) as cash,
        coalesce(p.banned, false) as banned,
        public.admin_last_seen(p.activity_at, p.save) as seen,
        coalesce(p.activity, '{}'::jsonb) as activity
      from auth.users u
      left join public.profiles p on p.id = u.id
      where u.email ilike '%@users.lazycub.life'
    ),
    days as (
      select generate_series(today - interval '13 days', today, interval '1 day') as day
    ),
    areas as (
      select
        a.key as area,
        sum(a.value::bigint) as seconds,
        count(*) filter (where a.value::bigint > 0) as players
      from players
      cross join lateral jsonb_each_text(players.activity) a
      where a.value ~ '^[0-9]+$'
      group by a.key
    ),
    earners as (
      select l.user_id, sum(l.amount)::integer as earned, count(*)::integer as grants
      from public.coin_ledger l
      where l.amount > 0 and l.created_at > now() - interval '24 hours'
      group by l.user_id
      order by earned desc
      limit 8
    )
    select jsonb_build_object(
      'players', (select count(*) from players),
      'newToday', (select count(*) from players where created_at >= today),
      'newWeek', (select count(*) from players where created_at >= now() - interval '7 days'),
      'activeToday', (select count(*) from players where seen >= today),
      'activeWeek', (select count(*) from players where seen >= now() - interval '7 days'),
      'banned', (select count(*) from players where banned),
      'cashHeld', (select coalesce(sum(cash), 0) from players),
      'signups', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'day', to_char(d.day at time zone 'Europe/London', 'YYYY-MM-DD'),
          'count', (
            select count(*) from players
            where created_at >= d.day and created_at < d.day + interval '1 day'
          )
        ) order by d.day), '[]'::jsonb)
        from days d
      ),
      'areas', (
        select coalesce(jsonb_object_agg(area, jsonb_build_object('seconds', seconds, 'players', players)), '{}'::jsonb)
        from areas
      ),
      'earners', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', e.user_id,
          'username', coalesce(p.username, split_part(u.email, '@', 1)),
          'earned', e.earned,
          'grants', e.grants,
          'banned', coalesce(p.banned, false)
        ) order by e.earned desc), '[]'::jsonb)
        from earners e
        join auth.users u on u.id = e.user_id
        left join public.profiles p on p.id = e.user_id
      )
    )
  );
end;
$$;

-- Like admin_search, but sortable and longer. Sorts: active, new, coins, level, name.
create or replace function public.admin_players(p_query text default '', p_sort text default 'active', p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  needle text;
  sort_by text := coalesce(p_sort, 'active');
  page integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  perform public.admin_guard();
  needle := lower(btrim(left(replace(replace(coalesce(p_query, ''), '%', ''), '_', ''), 32)));
  return (
    select coalesce(jsonb_agg(found.item order by found.place), '[]'::jsonb)
    from (
      select
        jsonb_build_object(
          'id', u.id,
          'username', coalesce(p.username, names.username),
          'cub_cash', coalesce(p.cub_cash, 100),
          'energy', case
            when coalesce(p.save->>'energy', '') ~ '^[0-9]+(\.[0-9]+)?$'
            then least(100, greatest(0, (p.save->>'energy')::numeric))::integer
            else 0
          end,
          'xp', xp.value,
          'eth_address', nullif(u.raw_user_meta_data->>'eth_address', ''),
          'banned', coalesce(p.banned, false),
          'created_at', u.created_at,
          'last_visit', case
            when coalesce(p.save->>'lastVisit', '') ~ '^[0-9]+(\.[0-9]+)?$'
            then trunc((p.save->>'lastVisit')::numeric)::bigint
            else 0
          end,
          'last_seen', seen.value
        ) as item,
        row_number() over (
          order by
            case when sort_by = 'active' then seen.value end desc nulls last,
            case when sort_by = 'new' then u.created_at end desc,
            case when sort_by = 'coins' then coalesce(p.cub_cash, 100) end desc,
            case when sort_by = 'level' then xp.value end desc,
            coalesce(p.username, names.username)
        ) as place
      from auth.users u
      cross join lateral (
        select left(lower(coalesce(nullif(btrim(u.raw_user_meta_data->>'username'), ''), split_part(u.email, '@', 1))), 12) as username
      ) names
      left join public.profiles p on p.id = u.id
      cross join lateral (
        select case
          when coalesce(p.save->>'xp', '') ~ '^[0-9]+(\.[0-9]+)?$'
          then (p.save->>'xp')::numeric
          else 0
        end as value
      ) xp
      cross join lateral (select public.admin_last_seen(p.activity_at, p.save) as value) seen
      where u.email ilike '%@users.lazycub.life'
        and (
          needle = ''
          or names.username ilike '%' || needle || '%'
          or coalesce(p.username, '') ilike '%' || needle || '%'
        )
      order by place
      limit page
    ) found
  );
end;
$$;

revoke all on function public.admin_last_seen(timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.admin_overview() from public, anon, authenticated;
revoke all on function public.admin_players(text, text, integer) from public, anon, authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_players(text, text, integer) to authenticated;
