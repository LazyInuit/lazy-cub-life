-- Safe to run again. Run after cub-power.sql.
-- The Cub Power leaderboard: every named player ranked by their Cub Power right now.
-- Each player's Cub Power is worked out live, so a missed login or an ended weekly reward shows
-- straight away. Readable without signing in, like the other boards, so demo players can see it.

create or replace function public.cub_power_board(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  page_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  page_offset integer := least(greatest(coalesce(p_offset, 0), 0), 5000);
begin
  return (
    with powers as (
      select p.id as user_id, p.username, (public.cub_power_of(p.id)->>'total')::integer as power
      from public.profiles p
      where not coalesce(p.banned, false)
        and coalesce(p.username, '') <> ''
    ),
    ranked as materialized (
      select
        user_id,
        username,
        power,
        row_number() over (order by power desc, username) as place
      from powers
      where power > 0
    )
    select jsonb_build_object(
      'rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'rank', ranked.place::integer,
            'username', ranked.username,
            'power', ranked.power,
            'mine', coalesce(ranked.user_id = auth.uid(), false)
          )
          order by ranked.place
        )
        from ranked
        where ranked.place > page_offset
          and ranked.place <= page_offset + page_limit
      ), '[]'::jsonb),
      'mine', (
        select jsonb_build_object('rank', ranked.place::integer, 'username', ranked.username, 'power', ranked.power)
        from ranked
        where ranked.user_id = auth.uid()
      ),
      'total', (select count(*)::integer from ranked)
    )
  );
end;
$$;

revoke all on function public.cub_power_board(integer, integer) from public, anon, authenticated;
grant execute on function public.cub_power_board(integer, integer) to anon, authenticated;
