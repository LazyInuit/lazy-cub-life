-- Safe to run again. Reads only; changes no scores, balances or saves.
-- my_week_bests(): the signed-in player's best score in each game this leaderboard week
-- (Monday to Sunday, US Eastern, the same week as the weekly boards). The game screens show it
-- as "Weekly Best" next to the all-time best. Spellitaire modes and difficulties each have their own key.
create or replace function public.my_week_bests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  week date := public.eastern_week_start();
begin
  if uid is null then
    return null;
  end if;
  return jsonb_build_object(
    'week', to_char(week, 'YYYY-MM-DD'),
    'bests', coalesce((
      select jsonb_object_agg(s.game, s.score)
      from public.leaderboard_scores s
      where s.user_id = uid
        and s.week_start = week
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.my_week_bests() from public, anon, authenticated;
grant execute on function public.my_week_bests() to authenticated;
