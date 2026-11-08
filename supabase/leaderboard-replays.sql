-- Safe to run again. Run after baseball-blitz.sql, spellitaire-boards.sql and player-profile.sql.
-- Replays for the all-time top 3 on every game leaderboard: the eight games and each Spellitaire mode and
-- difficulty (not Overall or the Spellitaire total, which add up many games).
-- A clip is the last 10 seconds of the run that set the player's best, made on their phone and uploaded
-- by them, only while that best is in the board's all-time top 3. Files live in the public `replays`
-- bucket at <board>/<user id>.mp4, with a still of its first frame at <board>/<user id>.jpg.
-- Clips that drop out of the top 3 are deleted by the next player who uploads to that board.
-- Scores, saves and balances are not touched.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('replays', 'replays', true, 8388608, array['video/mp4', 'image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Which run each clip shows. A clip is only listed while its score is still the player's best.
create table if not exists public.leaderboard_replays (
  board text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null check (score > 0),
  saved_at timestamptz not null default now(),
  primary key (board, user_id)
);

alter table public.leaderboard_replays enable row level security;
revoke all on public.leaderboard_replays from anon, authenticated;

-- A board that can have replays.
create or replace function public.replay_board_ok(p_board text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    p_board in ('flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river', 'baseball')
      or p_board = any(public.spellitaire_keys()),
    false
  );
$$;

-- A player's all-time best on a board.
create or replace function public.replay_board_best(p_board text, p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(score), 0)::integer
  from public.leaderboard_scores
  where game = p_board and user_id = p_user;
$$;

-- A player's all-time place on a board, ranked like the leaderboards (score, then username). Null if unranked.
create or replace function public.replay_board_place(p_board text, p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with bests as (
    select s.user_id, max(s.score) as best
    from public.leaderboard_scores s
    join public.profiles p on p.id = s.user_id
    where s.game = p_board
      and not coalesce(p.banned, false)
      and coalesce(p.username, '') <> ''
    group by s.user_id
  ),
  ranked as (
    select b.user_id, row_number() over (order by b.best desc, p.username) as place
    from bests b
    join public.profiles p on p.id = b.user_id
  )
  select place::integer from ranked where user_id = p_user;
$$;

-- A file the signed-in player may upload: their own clip or still, on a board where they are top 3.
create or replace function public.replay_upload_ok(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  board text := split_part(p_name, '/', 1);
  file text := split_part(p_name, '/', 2);
begin
  if uid is null or split_part(p_name, '/', 3) <> '' or not public.replay_board_ok(board) then
    return false;
  end if;
  if file not in (uid::text || '.mp4', uid::text || '.jpg') then
    return false;
  end if;
  return coalesce(public.replay_board_place(board, uid), 999) <= 3;
end;
$$;

-- A file whose owner is no longer in that board's top 3, so anyone may delete it.
create or replace function public.replay_is_stale(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  board text := split_part(p_name, '/', 1);
  owner uuid;
begin
  if not public.replay_board_ok(board) then
    return false;
  end if;
  owner := split_part(split_part(p_name, '/', 2), '.', 1)::uuid;
  return coalesce(public.replay_board_place(board, owner), 999) > 3;
exception when others then
  return false;
end;
$$;

-- Storage rules. Reading clips needs no rule: the bucket is public. The select rule below only lets the
-- upload (which replaces an older clip) and the clean-up see the files they change.
drop policy if exists "replays own or stale read" on storage.objects;
create policy "replays own or stale read" on storage.objects
for select to authenticated
using (
  bucket_id = 'replays'
  and (
    split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
    or public.replay_is_stale(name)
    or public.admin_is_admin()
  )
);

drop policy if exists "replays top three insert" on storage.objects;
create policy "replays top three insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'replays' and public.replay_upload_ok(name));

drop policy if exists "replays top three update" on storage.objects;
create policy "replays top three update" on storage.objects
for update to authenticated
using (bucket_id = 'replays' and public.replay_upload_ok(name))
with check (bucket_id = 'replays' and public.replay_upload_ok(name));

drop policy if exists "replays own stale or admin delete" on storage.objects;
create policy "replays own stale or admin delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'replays'
  and (
    split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
    or public.replay_is_stale(name)
    or public.admin_is_admin()
  )
);

-- The signed-in player's all-time best and place on a board, to decide whether to upload.
create or replace function public.replay_standing(p_board text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if not public.replay_board_ok(p_board) then
    raise exception 'Bad board';
  end if;
  return jsonb_build_object(
    'best', public.replay_board_best(p_board, uid),
    'place', public.replay_board_place(p_board, uid)
  );
end;
$$;

-- After uploading: records which run the clip shows, forgets clips that dropped out of the top 3, and
-- returns their files so the uploader can delete them.
create or replace function public.replay_saved(p_board text, p_score integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  saved boolean := false;
  stale text[];
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if not public.replay_board_ok(p_board) then
    raise exception 'Bad board';
  end if;
  if p_score = public.replay_board_best(p_board, uid)
    and coalesce(public.replay_board_place(p_board, uid), 999) <= 3
    and exists (
      select 1 from storage.objects
      where bucket_id = 'replays' and name = p_board || '/' || uid::text || '.mp4'
    )
  then
    insert into public.leaderboard_replays (board, user_id, score, saved_at)
    values (p_board, uid, p_score, now())
    on conflict (board, user_id) do update set score = excluded.score, saved_at = excluded.saved_at;
    saved := true;
  end if;
  delete from public.leaderboard_replays r
  where r.board = p_board and coalesce(public.replay_board_place(p_board, r.user_id), 999) > 3;
  stale := array(
    select o.name from storage.objects o
    where o.bucket_id = 'replays' and o.name like p_board || '/%' and public.replay_is_stale(o.name)
  );
  return jsonb_build_object('saved', saved, 'stale', to_jsonb(stale));
end;
$$;

-- The clips to show on a board: its all-time top 3 whose clip still shows their best. Readable by anyone.
create or replace function public.leaderboard_replays(p_board text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(clip order by clip->>'username'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'username', p.username,
      'score', r.score,
      'path', o.name,
      'poster', (
        select still.name from storage.objects still
        where still.bucket_id = 'replays' and still.name = r.board || '/' || r.user_id::text || '.jpg'
      ),
      'version', floor(extract(epoch from coalesce(o.updated_at, o.created_at)))::bigint
    ) as clip
    from public.leaderboard_replays r
    join public.profiles p on p.id = r.user_id
    join storage.objects o on o.bucket_id = 'replays' and o.name = r.board || '/' || r.user_id::text || '.mp4'
    where r.board = p_board
      and public.replay_board_ok(p_board)
      and not coalesce(p.banned, false)
      and r.score = public.replay_board_best(p_board, r.user_id)
      and coalesce(public.replay_board_place(p_board, r.user_id), 999) <= 3
  ) clips;
$$;

revoke all on function public.replay_board_best(text, uuid) from public, anon, authenticated;
revoke all on function public.replay_board_place(text, uuid) from public, anon, authenticated;
grant execute on function public.replay_board_ok(text) to anon, authenticated;
grant execute on function public.replay_upload_ok(text) to authenticated;
grant execute on function public.replay_is_stale(text) to authenticated;
grant execute on function public.replay_standing(text) to authenticated;
grant execute on function public.replay_saved(text, integer) to authenticated;
grant execute on function public.leaderboard_replays(text) to anon, authenticated;
