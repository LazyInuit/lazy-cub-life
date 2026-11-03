-- Safe to run again. Run after spellitaire-modes.sql. Do not run coins.sql, leaderboard.sql or admin.sql again.
-- Player vs player challenges: one player stakes 50-500 Cub Cash on one game board, the other matches it,
-- and the higher score in the next 24 hours wins both stakes.
--
-- A board is a submit_score key: 'flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river',
-- or any Spellitaire key such as 'solitaire-pyramid-hard', so a board fixes the game and its difficulty.
-- A new game only needs its key added to challenge_board_ok().
--
-- Statuses: pending (sent, waiting) -> active (accepted, 24 hours of play) -> completed,
-- or pending -> cancelled (sender), declined (receiver), expired (not accepted in 24 hours).
-- There is no scheduled job: overdue challenges are expired or settled the next time either player
-- calls any challenge function (the app does this when it opens). Deadlines are server times, so
-- the result is the same however late that happens.
--
-- Money: every stake, refund and prize moves through challenge_move_cash(), which writes the balance
-- the same way the shop does, so coin_ledger gets one row per move. Each move has a fixed
-- operation id (challenge-<id>-stake-a, -stake-b, -refund-a, -refund-b, -win), and coin_ledger
-- refuses a repeated operation id, so a challenge can never charge or pay the same thing twice.
-- held is the Cub Cash a challenge is holding: the stakes paid in, until it closes, then 0.

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenger uuid not null references public.profiles (id) on delete cascade,
  opponent uuid not null references public.profiles (id) on delete cascade,
  board text not null,
  wager integer not null check (wager between 50 and 500 and wager % 50 = 0),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'completed', 'cancelled', 'declined', 'expired')),
  held integer not null default 0 check (held >= 0),
  created_at timestamptz not null default now(),
  accept_by timestamptz not null,
  accepted_at timestamptz,
  ends_at timestamptz,
  closed_at timestamptz,
  challenger_best integer,
  opponent_best integer,
  winner uuid,
  outcome text check (outcome in ('win', 'draw', 'no_scores', 'refund')),
  payout jsonb not null default '{}'::jsonb,
  check (challenger <> opponent)
);

create index if not exists challenges_challenger_status on public.challenges (challenger, status);
create index if not exists challenges_opponent_status on public.challenges (opponent, status);
-- One open challenge per pair of players per board.
create unique index if not exists challenges_open_pair
  on public.challenges (least(challenger, opponent), greatest(challenger, opponent), board)
  where status in ('pending', 'active');

create table if not exists public.challenge_notices (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  kind text not null check (kind in (
    'received', 'accepted', 'declined', 'cancelled', 'expired', 'won', 'lost', 'draw', 'no_scores'
  )),
  amount integer not null default 0,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index if not exists challenge_notices_user on public.challenge_notices (user_id, seen_at, created_at desc);

alter table public.challenges enable row level security;
alter table public.challenge_notices enable row level security;
revoke all on public.challenges from anon, authenticated;
revoke all on public.challenge_notices from anon, authenticated;

-- Boards a challenge can be played on: every submit_score key.
create or replace function public.challenge_board_ok(p_board text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    p_board in ('flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river')
      or p_board = any(public.spellitaire_keys()),
    false
  );
$$;

-- The same limits submit_score uses: anything outside them is ignored.
create or replace function public.challenge_score_ok(p_board text, p_score integer)
returns boolean
language sql
immutable
as $$
  select coalesce(
    public.challenge_board_ok(p_board)
      and p_score > 0
      and p_score <= 9999999
      and not (p_board in ('bubble', 'river') and p_score > 1000000)
      and not (p_board = any(public.spellitaire_keys()) and p_score > 20000),
    false
  );
$$;

-- Every account starts with 100 Cub Cash, and that much always stays out of challenges: only Cub Cash
-- earned in the game can be wagered, so new accounts can't be made just to feed their starting cash to
-- another account. The smallest wager (50) needs a balance of at least 150.
create or replace function public.challenge_starter_cash()
returns integer
language sql
immutable
as $$
  select 100;
$$;

-- Moves Cub Cash for a challenge and writes its ledger row. Returns the new balance.
create or replace function public.challenge_move_cash(p_user uuid, p_amount integer, p_reason text, p_operation text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  balance integer;
begin
  perform set_config('cub.cash_write', 'allow', true);
  perform set_config('cub.cash_reason', p_reason, true);
  perform set_config('cub.operation_id', p_operation, true);
  update public.profiles
  set cub_cash = cub_cash + p_amount
  where id = p_user
  returning cub_cash into balance;
  -- The next balance change in this transaction must not reuse this reason or id.
  perform set_config('cub.cash_reason', '', true);
  perform set_config('cub.operation_id', '', true);
  if balance is null then
    raise exception 'Player not found';
  end if;
  return balance;
end;
$$;

create or replace function public.challenge_notify(p_user uuid, p_challenge uuid, p_kind text, p_amount integer default 0)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.challenge_notices (user_id, challenge_id, kind, amount)
  values (p_user, p_challenge, p_kind, coalesce(p_amount, 0));
$$;

-- Expires or settles one challenge if its deadline has passed. Does nothing otherwise, or if it is
-- already closed, so it is safe to call any number of times.
create or replace function public.challenge_close(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.challenges%rowtype;
  a integer;
  b integer;
  winner_id uuid;
  result text;
begin
  select * into c from public.challenges where id = p_id for update;
  if not found then
    return;
  end if;

  if c.status = 'pending' and now() >= c.accept_by then
    update public.challenges
    set status = 'expired', held = 0, closed_at = now(), outcome = 'refund',
        payout = jsonb_build_object(c.challenger::text, c.wager)
    where id = c.id;
    perform public.challenge_move_cash(c.challenger, c.wager, 'Earned: Challenge refund', 'challenge-' || c.id || '-refund-a');
    perform public.challenge_notify(c.challenger, c.id, 'expired', c.wager);
    perform public.challenge_notify(c.opponent, c.id, 'expired', 0);
    return;
  end if;

  if c.status <> 'active' or now() < c.ends_at then
    return;
  end if;

  a := c.challenger_best;
  b := c.opponent_best;
  if a is null and b is null then
    result := 'no_scores';
  elsif b is null or (a is not null and a > b) then
    result := 'win';
    winner_id := c.challenger;
  elsif a is null or b > a then
    result := 'win';
    winner_id := c.opponent;
  else
    result := 'draw';
  end if;

  if result = 'win' then
    update public.challenges
    set status = 'completed', held = 0, closed_at = now(), outcome = 'win', winner = winner_id,
        payout = jsonb_build_object(winner_id::text, c.held)
    where id = c.id;
    perform public.challenge_move_cash(winner_id, c.held, 'Earned: Challenge win', 'challenge-' || c.id || '-win');
    perform public.challenge_notify(winner_id, c.id, 'won', c.held);
    perform public.challenge_notify(
      case when winner_id = c.challenger then c.opponent else c.challenger end, c.id, 'lost', c.wager
    );
  else
    update public.challenges
    set status = 'completed', held = 0, closed_at = now(), outcome = result,
        payout = jsonb_build_object(c.challenger::text, c.wager, c.opponent::text, c.wager)
    where id = c.id;
    perform public.challenge_move_cash(c.challenger, c.wager, 'Earned: Challenge refund', 'challenge-' || c.id || '-refund-a');
    perform public.challenge_move_cash(c.opponent, c.wager, 'Earned: Challenge refund', 'challenge-' || c.id || '-refund-b');
    perform public.challenge_notify(c.challenger, c.id, result, c.wager);
    perform public.challenge_notify(c.opponent, c.id, result, c.wager);
  end if;
end;
$$;

-- Expires or settles every overdue challenge this player is part of.
create or replace function public.challenge_settle_for(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  due uuid;
begin
  for due in
    select c.id
    from public.challenges c
    where (c.challenger = p_user or c.opponent = p_user)
      and ((c.status = 'pending' and c.accept_by <= now())
        or (c.status = 'active' and c.ends_at <= now()))
    order by c.created_at
  loop
    perform public.challenge_close(due);
  end loop;
end;
$$;

-- Most challenges one player can have going at once: the ones they sent that are still waiting,
-- plus every active one, sent or received. Received challenges still waiting don't count until accepted.
create or replace function public.challenge_open_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.challenges c
  where (c.status = 'pending' and c.challenger = p_user)
     or (c.status = 'active' and (c.challenger = p_user or c.opponent = p_user));
$$;

-- The caller's balance, for the app after a move.
create or replace function public.challenge_cash(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select cub_cash from public.profiles where id = p_user;
$$;

create or replace function public.challenge_send(p_opponent text, p_board text, p_wager integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  me public.profiles%rowtype;
  target public.profiles%rowtype;
  new_id uuid;
  balance integer;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if not public.challenge_board_ok(p_board) then
    raise exception 'Bad game';
  end if;
  if p_wager is null or p_wager < 50 or p_wager > 500 or p_wager % 50 <> 0 then
    raise exception 'Bad wager';
  end if;

  perform public.challenge_settle_for(uid);

  select * into me from public.profiles where id = uid for update;
  if not found then
    raise exception 'Sign in required';
  end if;
  if coalesce(me.banned, false) then
    raise exception 'This account is banned';
  end if;

  select * into target
  from public.profiles p
  where lower(p.username) = lower(btrim(coalesce(p_opponent, '')))
    and coalesce(p.username, '') <> ''
    and not coalesce(p.banned, false)
  limit 1;
  if not found then
    raise exception 'Player not found';
  end if;
  if target.id = uid then
    raise exception 'You cannot challenge yourself';
  end if;
  if not exists (select 1 from public.leaderboard_scores s where s.user_id = target.id) then
    raise exception 'That player cannot be challenged yet';
  end if;
  if public.challenge_open_count(uid) >= 10 then
    raise exception 'Too many open challenges';
  end if;
  if exists (
    select 1 from public.challenges c
    where c.board = p_board
      and c.status in ('pending', 'active')
      and ((c.challenger = uid and c.opponent = target.id) or (c.challenger = target.id and c.opponent = uid))
  ) then
    raise exception 'Already challenged';
  end if;
  if me.cub_cash - public.challenge_starter_cash() < p_wager then
    raise exception 'Not enough earned Cub Cash';
  end if;

  insert into public.challenges (challenger, opponent, board, wager, held, accept_by)
  values (uid, target.id, p_board, p_wager, p_wager, now() + interval '24 hours')
  returning id into new_id;
  balance := public.challenge_move_cash(uid, -p_wager, 'Spent: Challenge wager', 'challenge-' || new_id || '-stake-a');
  perform public.challenge_notify(target.id, new_id, 'received', p_wager);

  return jsonb_build_object('id', new_id, 'cubCash', balance);
end;
$$;

create or replace function public.challenge_cancel(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.challenges%rowtype;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  select * into c from public.challenges where id = p_id for update;
  if not found or c.challenger <> uid then
    raise exception 'Challenge not found';
  end if;
  perform public.challenge_close(c.id);
  select * into c from public.challenges where id = p_id;
  if c.status <> 'pending' then
    -- Accepted (can't be cancelled) or just expired (already refunded): report where it stands.
    return jsonb_build_object('status', c.status, 'cubCash', public.challenge_cash(uid));
  end if;

  update public.challenges
  set status = 'cancelled', held = 0, closed_at = now(), outcome = 'refund',
      payout = jsonb_build_object(c.challenger::text, c.wager)
  where id = c.id;
  perform public.challenge_move_cash(c.challenger, c.wager, 'Earned: Challenge refund', 'challenge-' || c.id || '-refund-a');
  perform public.challenge_notify(c.opponent, c.id, 'cancelled', 0);

  return jsonb_build_object('status', 'cancelled', 'cubCash', public.challenge_cash(uid));
end;
$$;

create or replace function public.challenge_respond(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.challenges%rowtype;
  me public.profiles%rowtype;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  select * into c from public.challenges where id = p_id for update;
  if not found or c.opponent <> uid then
    raise exception 'Challenge not found';
  end if;
  perform public.challenge_close(c.id);
  select * into c from public.challenges where id = p_id;
  if c.status <> 'pending' then
    return jsonb_build_object('status', c.status, 'cubCash', public.challenge_cash(uid));
  end if;

  if coalesce(p_accept, false) then
    select * into me from public.profiles where id = uid for update;
    if coalesce(me.banned, false) then
      raise exception 'This account is banned';
    end if;
    if public.challenge_open_count(uid) >= 10 then
      raise exception 'Too many open challenges';
    end if;
    if me.cub_cash - public.challenge_starter_cash() < c.wager then
      raise exception 'Not enough earned Cub Cash';
    end if;
    perform public.challenge_move_cash(uid, -c.wager, 'Spent: Challenge wager', 'challenge-' || c.id || '-stake-b');
    update public.challenges
    set status = 'active', held = c.wager * 2, accepted_at = now(), ends_at = now() + interval '24 hours'
    where id = c.id;
    perform public.challenge_notify(c.challenger, c.id, 'accepted', c.wager);
    return jsonb_build_object('status', 'active', 'cubCash', public.challenge_cash(uid));
  end if;

  update public.challenges
  set status = 'declined', held = 0, closed_at = now(), outcome = 'refund',
      payout = jsonb_build_object(c.challenger::text, c.wager)
  where id = c.id;
  perform public.challenge_move_cash(c.challenger, c.wager, 'Earned: Challenge refund', 'challenge-' || c.id || '-refund-a');
  perform public.challenge_notify(c.challenger, c.id, 'declined', c.wager);
  return jsonb_build_object('status', 'declined', 'cubCash', public.challenge_cash(uid));
end;
$$;

-- Called after every finished run, alongside submit_score. Keeps each player's best score on their
-- active challenges for that board, only while the 24 hours are running.
create or replace function public.submit_challenge_score(p_board text, p_score integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  changed integer;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if not public.challenge_score_ok(p_board, p_score) then
    return jsonb_build_object('updated', 0);
  end if;
  if exists (select 1 from public.profiles where id = uid and banned) then
    raise exception 'This account is banned';
  end if;

  update public.challenges c
  set challenger_best = case when c.challenger = uid then greatest(coalesce(c.challenger_best, 0), p_score) else c.challenger_best end,
      opponent_best = case when c.opponent = uid then greatest(coalesce(c.opponent_best, 0), p_score) else c.opponent_best end
  where c.status = 'active'
    and c.board = p_board
    and c.accepted_at <= now()
    and now() < c.ends_at
    and ((c.challenger = uid and (c.challenger_best is null or c.challenger_best < p_score))
      or (c.opponent = uid and (c.opponent_best is null or c.opponent_best < p_score)));
  get diagnostics changed = row_count;
  return jsonb_build_object('updated', changed);
end;
$$;

create or replace function public.challenge_avatar(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'path', o.name,
    'version', floor(extract(epoch from coalesce(o.updated_at, o.created_at)))::bigint
  )
  from storage.objects o
  where o.bucket_id = 'avatars'
    and o.name = p_user::text || '/avatar.jpg'
  limit 1;
$$;

-- Everything the Challenges screen shows. Settles this player's overdue challenges first.
create or replace function public.my_challenges()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ms constant numeric := 1000;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  perform public.challenge_settle_for(uid);

  return jsonb_build_object(
    'serverNow', floor(extract(epoch from now()) * ms),
    'challenges', coalesce((
      select jsonb_agg(item order by sort_at desc)
      from (
        select
          coalesce(c.closed_at, c.accepted_at, c.created_at) as sort_at,
          jsonb_build_object(
            'id', c.id,
            'board', c.board,
            'wager', c.wager,
            'status', c.status,
            'outcome', c.outcome,
            'role', case when c.challenger = uid then 'challenger' else 'opponent' end,
            'opponent', jsonb_build_object(
              'username', other.username,
              'avatar', public.challenge_avatar(other.id),
              'outfits', coalesce(other.save->'outfits', '{}'::jsonb)
            ),
            'myBest', case when c.challenger = uid then c.challenger_best else c.opponent_best end,
            'theirBest', case when c.challenger = uid then c.opponent_best else c.challenger_best end,
            'won', c.winner is not null and c.winner = uid,
            'lost', c.winner is not null and c.winner <> uid,
            'staked', case
              when c.challenger = uid then c.wager
              when c.accepted_at is not null then c.wager
              else 0
            end,
            'paid', coalesce((c.payout->>uid::text)::integer, 0),
            'createdAt', floor(extract(epoch from c.created_at) * ms),
            'acceptBy', floor(extract(epoch from c.accept_by) * ms),
            'acceptedAt', case when c.accepted_at is null then null else floor(extract(epoch from c.accepted_at) * ms) end,
            'endsAt', case when c.ends_at is null then null else floor(extract(epoch from c.ends_at) * ms) end,
            'closedAt', case when c.closed_at is null then null else floor(extract(epoch from c.closed_at) * ms) end
          ) as item
        from public.challenges c
        join public.profiles other
          on other.id = case when c.challenger = uid then c.opponent else c.challenger end
        where (c.challenger = uid or c.opponent = uid)
          and (
            c.status in ('pending', 'active')
            -- My results show the 100 most recent finished challenges. Older ones stay stored, just not listed.
            or c.id in (
              select r.id
              from public.challenges r
              where (r.challenger = uid or r.opponent = uid) and r.status = 'completed'
              order by r.closed_at desc
              limit 100
            )
          )
        order by coalesce(c.closed_at, c.accepted_at, c.created_at) desc
        limit 200
      ) listed
    ), '[]'::jsonb),
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'kind', n.kind,
        'amount', n.amount,
        'challengeId', n.challenge_id,
        'board', c.board,
        'username', other.username,
        'createdAt', floor(extract(epoch from n.created_at) * ms)
      ) order by n.created_at)
      from public.challenge_notices n
      join public.challenges c on c.id = n.challenge_id
      join public.profiles other
        on other.id = case when c.challenger = uid then c.opponent else c.challenger end
      where n.user_id = uid and n.seen_at is null
    ), '[]'::jsonb),
    'cubCash', public.challenge_cash(uid)
  );
end;
$$;

create or replace function public.challenge_notices_seen(p_ids bigint[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.challenge_notices
  set seen_at = now()
  where user_id = auth.uid()
    and id = any(coalesce(p_ids, array[]::bigint[]))
    and seen_at is null;
$$;

-- Players who can be challenged: everyone on the all-time overall board except the caller.
create or replace function public.challenge_players(p_query text default '', p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  needle text := lower(btrim(coalesce(p_query, '')));
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 30);
  skip integer := least(greatest(coalesce(p_offset, 0), 0), 5000);
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  return (
    with bests as (
      select s.user_id, s.game, public.leaderboard_points(s.game, max(s.score)) as points
      from public.leaderboard_scores s
      group by s.user_id, s.game
    ),
    totals as (
      select user_id, sum(points)::integer as score
      from bests
      group by user_id
      having sum(points) > 0
    ),
    ranked as (
      select t.user_id, t.score, p.username,
        row_number() over (order by t.score desc, p.username) as place
      from totals t
      join public.profiles p on p.id = t.user_id
      where not coalesce(p.banned, false)
        and coalesce(p.username, '') <> ''
    ),
    picked as (
      select * from ranked r
      where r.user_id <> uid
        and (needle = '' or position(needle in lower(r.username)) > 0)
    )
    select jsonb_build_object(
      'total', (select count(*) from picked),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'rank', x.place,
          'username', x.username,
          'score', x.score,
          'avatar', public.challenge_avatar(x.user_id)
        ) order by x.place)
        from (select * from picked order by place limit lim offset skip) x
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- Community results: finished challenges between any players, newest first. Only challenges that were
-- played out (a win or a draw) are listed; banned players' challenges are left out.
-- p_query keeps only challenges where either player's name contains it, from all stored challenges.
drop function if exists public.challenge_results(integer, integer);
create or replace function public.challenge_results(p_limit integer default 20, p_offset integer default 0, p_query text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  -- Community results show the 100 most recent. Older ones stay stored, just not listed.
  shown integer := 100;
  skip integer := least(greatest(coalesce(p_offset, 0), 0), shown);
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 30, shown - skip);
  needle text := lower(btrim(coalesce(p_query, '')));
  ms constant numeric := 1000;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(item order by closed desc)
      from (
        select
          c.closed_at as closed,
          jsonb_build_object(
            'id', c.id,
            'board', c.board,
            'wager', c.wager,
            'outcome', c.outcome,
            'challenger', jsonb_build_object('username', a.username, 'avatar', public.challenge_avatar(a.id), 'best', c.challenger_best),
            'opponent', jsonb_build_object('username', b.username, 'avatar', public.challenge_avatar(b.id), 'best', c.opponent_best),
            'winner', case when c.winner = a.id then a.username when c.winner = b.id then b.username end,
            'mine', c.challenger = uid or c.opponent = uid,
            'closedAt', floor(extract(epoch from c.closed_at) * ms)
          ) as item
        from public.challenges c
        join public.profiles a on a.id = c.challenger
        join public.profiles b on b.id = c.opponent
        where c.status = 'completed'
          and c.outcome in ('win', 'draw')
          and not coalesce(a.banned, false)
          and not coalesce(b.banned, false)
          and (needle = '' or position(needle in lower(a.username)) > 0 or position(needle in lower(b.username)) > 0)
        order by c.closed_at desc
        limit lim offset skip
      ) listed
    ), '[]'::jsonb),
    'more', skip + lim < shown and (
      select count(*) > skip + lim
      from public.challenges c
      join public.profiles a on a.id = c.challenger
      join public.profiles b on b.id = c.opponent
      where c.status = 'completed'
        and c.outcome in ('win', 'draw')
        and not coalesce(a.banned, false)
        and not coalesce(b.banned, false)
        and (needle = '' or position(needle in lower(a.username)) > 0 or position(needle in lower(b.username)) > 0)
    )
  );
end;
$$;

-- Admin testing only: makes a challenge's current deadline pass now, so the next
-- my_challenges() call by either player expires or settles it.
create or replace function public.admin_challenge_fast_forward(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  update public.challenges
  set accept_by = case when status = 'pending' then now() - interval '1 second' else accept_by end,
      ends_at = case when status = 'active' then now() - interval '1 second' else ends_at end
  where id = p_id;
end;
$$;

revoke all on function public.challenge_board_ok(text) from public, anon, authenticated;
revoke all on function public.challenge_score_ok(text, integer) from public, anon, authenticated;
revoke all on function public.challenge_move_cash(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.challenge_notify(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.challenge_close(uuid) from public, anon, authenticated;
revoke all on function public.challenge_settle_for(uuid) from public, anon, authenticated;
revoke all on function public.challenge_cash(uuid) from public, anon, authenticated;
revoke all on function public.challenge_open_count(uuid) from public, anon, authenticated;
revoke all on function public.challenge_starter_cash() from public, anon, authenticated;
revoke all on function public.challenge_avatar(uuid) from public, anon, authenticated;
revoke all on function public.challenge_send(text, text, integer) from public, anon, authenticated;
revoke all on function public.challenge_cancel(uuid) from public, anon, authenticated;
revoke all on function public.challenge_respond(uuid, boolean) from public, anon, authenticated;
revoke all on function public.submit_challenge_score(text, integer) from public, anon, authenticated;
revoke all on function public.my_challenges() from public, anon, authenticated;
revoke all on function public.challenge_notices_seen(bigint[]) from public, anon, authenticated;
revoke all on function public.challenge_players(text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_challenge_fast_forward(uuid) from public, anon, authenticated;
revoke all on function public.challenge_results(integer, integer, text) from public, anon, authenticated;

grant execute on function public.challenge_send(text, text, integer) to authenticated;
grant execute on function public.challenge_cancel(uuid) to authenticated;
grant execute on function public.challenge_respond(uuid, boolean) to authenticated;
grant execute on function public.submit_challenge_score(text, integer) to authenticated;
grant execute on function public.my_challenges() to authenticated;
grant execute on function public.challenge_notices_seen(bigint[]) to authenticated;
grant execute on function public.challenge_players(text, integer, integer) to authenticated;
grant execute on function public.admin_challenge_fast_forward(uuid) to authenticated;
grant execute on function public.challenge_results(integer, integer, text) to authenticated;
