-- Safe to run again. Run after activity-daily.sql. Do not run coins.sql, leaderboard.sql or admin.sql again.
-- Read-only. The admin overview's "Most played" for Today and the last 7 days: every player's time
-- per area over the last p_days UK days (today is day 1), and how many players spent time in each.
-- All time still comes from admin_overview(). Nothing here changes any data.

create or replace function public.admin_games_range(p_days integer)
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
      select coalesce(jsonb_object_agg(area, jsonb_build_object('seconds', seconds, 'players', players)), '{}'::jsonb)
      from (
        select d.area, sum(d.seconds)::bigint as seconds, count(distinct d.user_id) filter (where d.seconds > 0) as players
        from public.activity_daily d
        join auth.users u on u.id = d.user_id
        where d.day > today - days
          and u.email ilike '%@users.lazycub.life'
        group by d.area
      ) totals
    ),
    'since', (select to_char(min(day), 'YYYY-MM-DD') from public.activity_daily)
  );
end;
$$;

revoke all on function public.admin_games_range(integer) from public, anon, authenticated;
grant execute on function public.admin_games_range(integer) to authenticated;
