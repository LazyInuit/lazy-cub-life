-- Checks for pvp-challenges.sql. Run after it, in the Supabase SQL editor. Changes nothing:
-- everything runs in one block that always ends with an error, which undoes every test write.
--   Passed:  ERROR: Challenge tests passed. (This error is on purpose so nothing is saved.)
--   Failed:  ERROR: assertion failed: <which check>
-- Uses the first two players with usernames, gives them test Cub Cash, and plays challenges between them.

do $$
declare
  a uuid;
  b uuid;
  a_name text;
  b_name text;
  a0 integer;
  b0 integer;
  r jsonb;
  c1 uuid;
  c2 uuid;
  c3 uuid;
  c4 uuid;
  c5 uuid;
  c6 uuid;
  c7 uuid;
  row_ public.challenges%rowtype;
  n integer;
  total bigint;
  cash integer;
  board text;
  sent_ids uuid[];
  boards text[] := array[
    'flight', 'match', 'dojo', 'archer', 'hoops', 'bubble', 'river',
    'solitaire', 'solitaire-hard', 'solitaire-flipflop', 'solitaire-golf', 'solitaire-spider'
  ];
begin
  select p.id, p.username into a, a_name
  from public.profiles p
  where not coalesce(p.banned, false) and coalesce(p.username, '') <> ''
  order by p.id limit 1;
  select p.id, p.username into b, b_name
  from public.profiles p
  where not coalesce(p.banned, false) and coalesce(p.username, '') <> '' and p.id <> a
  order by p.id limit 1;
  assert a is not null and b is not null, 'two players to test with';

  create function pg_temp.as_player(u uuid) returns void language plpgsql as $f$
  begin
    perform set_config('request.jwt.claim.sub', u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true);
  end;
  $f$;

  -- Test money, and a score each so both can be challenged.
  perform public.challenge_move_cash(a, 3000, 'Admin: challenge test', 'challenge-test-topup-a-' || gen_random_uuid());
  perform public.challenge_move_cash(b, 3000, 'Admin: challenge test', 'challenge-test-topup-b-' || gen_random_uuid());
  insert into public.leaderboard_scores (user_id, game, week_start, score)
  values (a, 'flight', public.eastern_week_start(), 1), (b, 'flight', public.eastern_week_start(), 1)
  on conflict do nothing;
  select cub_cash into a0 from public.profiles where id = a;
  select cub_cash into b0 from public.profiles where id = b;

  -- 1. Sending takes the wager exactly once and holds it.
  perform pg_temp.as_player(a);
  r := public.challenge_send(b_name, 'hoops', 200);
  c1 := (r->>'id')::uuid;
  assert (r->>'cubCash')::integer = a0 - 200, '1: send returns the new balance';
  select cub_cash into cash from public.profiles where id = a;
  assert cash = a0 - 200, '1: send takes the wager';
  select * into row_ from public.challenges where id = c1;
  assert row_.status = 'pending' and row_.held = 200, '1: pending and holding the wager';
  select count(*) into n from public.coin_ledger where operation_id = 'challenge-' || c1 || '-stake-a';
  assert n = 1, '1: one ledger row for the stake';
  begin
    perform public.challenge_move_cash(a, -200, 'Spent: Challenge wager', 'challenge-' || c1 || '-stake-a');
    assert false, '1: a repeated stake must be refused';
  exception when unique_violation then
    null;
  end;
  select count(*) into n from public.challenge_notices where user_id = b and challenge_id = c1 and kind = 'received';
  assert n = 1, '1: the receiver is notified';

  -- Sending rules.
  begin
    perform public.challenge_send(a_name, 'hoops', 100);
    assert false, 'cannot challenge yourself';
  exception when raise_exception then
    null;
  end;
  begin
    perform public.challenge_send(b_name, 'dojo', 75);
    assert false, 'wagers go up in 50s';
  exception when raise_exception then
    null;
  end;
  begin
    perform public.challenge_send(b_name, 'dojo', 550);
    assert false, 'wagers stop at 500';
  exception when raise_exception then
    null;
  end;
  begin
    perform public.challenge_send(b_name, 'not-a-game', 100);
    assert false, 'only real boards';
  exception when raise_exception then
    null;
  end;
  begin
    perform public.challenge_send(b_name, 'hoops', 100);
    assert false, 'one open challenge per pair and board';
  exception when raise_exception then
    null;
  end;

  -- 2. Cancelling a pending challenge refunds it, and it can no longer be accepted.
  r := public.challenge_cancel(c1);
  assert r->>'status' = 'cancelled', '2: cancelled';
  select cub_cash into cash from public.profiles where id = a;
  assert cash = a0, '2: cancel refunds the wager';
  select * into row_ from public.challenges where id = c1;
  assert row_.held = 0, '2: nothing held after cancel';
  perform pg_temp.as_player(b);
  r := public.challenge_respond(c1, true);
  assert r->>'status' = 'cancelled', '2: a cancelled challenge cannot be accepted';
  select cub_cash into cash from public.profiles where id = b;
  assert cash = b0, '2: the receiver paid nothing';

  -- 3. Declining refunds the sender.
  perform pg_temp.as_player(a);
  c2 := (public.challenge_send(b_name, 'dojo', 150)->>'id')::uuid;
  perform pg_temp.as_player(b);
  r := public.challenge_respond(c2, false);
  assert r->>'status' = 'declined', '3: declined';
  select cub_cash into cash from public.profiles where id = a;
  assert cash = a0, '3: decline refunds the sender';
  select count(*) into n from public.challenge_notices where user_id = a and challenge_id = c2 and kind = 'declined';
  assert n = 1, '3: the sender is notified';

  -- 4. A challenge not accepted in 24 hours expires and refunds, whoever calls in next.
  perform pg_temp.as_player(a);
  c3 := (public.challenge_send(b_name, 'archer', 100)->>'id')::uuid;
  update public.challenges set accept_by = now() - interval '1 second' where id = c3;
  perform pg_temp.as_player(b);
  perform public.my_challenges();
  select * into row_ from public.challenges where id = c3;
  assert row_.status = 'expired' and row_.held = 0, '4: expired';
  select cub_cash into cash from public.profiles where id = a;
  assert cash = a0, '4: expiry refunds the sender';
  r := public.challenge_respond(c3, true);
  assert r->>'status' = 'expired', '4: an expired challenge cannot be accepted';
  perform public.my_challenges();
  select count(*) into n from public.coin_ledger where operation_id like 'challenge-' || c3 || '-%';
  assert n = 2, '4: one stake and one refund, however often it is checked';

  -- 5 to 10. Accepting, playing and winning.
  perform pg_temp.as_player(a);
  c4 := (public.challenge_send(b_name, 'flight', 300)->>'id')::uuid;
  perform pg_temp.as_player(b);
  perform public.submit_challenge_score('flight', 999);
  r := public.challenge_respond(c4, true);
  assert r->>'status' = 'active', '5: accepted';
  select cub_cash into cash from public.profiles where id = b;
  assert cash = b0 - 300, '5: accepting takes the matching wager';
  select * into row_ from public.challenges where id = c4;
  assert row_.held = 600, '5: both wagers held';
  assert row_.opponent_best is null, '8: a score from before accepting does not count';
  assert row_.ends_at - row_.accepted_at = interval '24 hours', '7: 24 hours from accepting';

  perform pg_temp.as_player(a);
  r := public.challenge_cancel(c4);
  assert r->>'status' = 'active', '6: an accepted challenge cannot be cancelled';
  select cub_cash into cash from public.profiles where id = a;
  assert cash = a0 - 300, '6: no refund after accepting';

  perform public.submit_challenge_score('flight', 50);
  perform public.submit_challenge_score('flight', 40);
  perform public.submit_challenge_score('flight', 10000000);
  perform public.submit_challenge_score('hoops', 5000);
  perform pg_temp.as_player(b);
  perform public.submit_challenge_score('flight', 70);
  select * into row_ from public.challenges where id = c4;
  assert row_.challenger_best = 50, '9: the best valid score counts, not the latest or an impossible one';
  assert row_.opponent_best = 70, '9: each player keeps their own best';

  update public.challenges set ends_at = now() - interval '1 second' where id = c4;
  perform pg_temp.as_player(a);
  perform public.submit_challenge_score('flight', 500);
  select * into row_ from public.challenges where id = c4;
  assert row_.challenger_best = 50, '8: a score after the 24 hours does not count';

  -- Settled by the loser calling in; the winner does not need to be online.
  perform public.my_challenges();
  select * into row_ from public.challenges where id = c4;
  assert row_.status = 'completed' and row_.winner = b and row_.held = 0, '9: the higher score wins';
  select cub_cash into cash from public.profiles where id = b;
  assert cash = b0 + 300, '10: the winner gets both wagers';
  select cub_cash into cash from public.profiles where id = a;
  assert cash = a0 - 300, '10: the loser keeps nothing back';
  perform public.challenge_close(c4);
  perform pg_temp.as_player(b);
  perform public.my_challenges();
  select count(*) into n from public.coin_ledger where operation_id = 'challenge-' || c4 || '-win';
  assert n = 1, '10, 15: paid exactly once';
  select cub_cash into cash from public.profiles where id = b;
  assert cash = b0 + 300, '15: settling again pays nothing more';
  select count(*) into n from public.challenge_notices where challenge_id = c4 and kind in ('won', 'lost');
  assert n = 2, 'both players hear the result';

  select cub_cash into a0 from public.profiles where id = a;
  select cub_cash into b0 from public.profiles where id = b;

  -- 11. A draw refunds both.
  perform pg_temp.as_player(a);
  c5 := (public.challenge_send(b_name, 'bubble', 100)->>'id')::uuid;
  perform public.submit_challenge_score('bubble', 1000);
  perform pg_temp.as_player(b);
  perform public.challenge_respond(c5, true);
  perform public.submit_challenge_score('bubble', 1000);
  perform pg_temp.as_player(a);
  perform public.submit_challenge_score('bubble', 1000);
  update public.challenges set ends_at = now() - interval '1 second' where id = c5;
  perform public.my_challenges();
  select * into row_ from public.challenges where id = c5;
  assert row_.status = 'completed' and row_.outcome = 'draw' and row_.winner is null, '11: draw';
  select cub_cash into cash from public.profiles where id = a;
  assert cash = a0, '11: draw refunds the sender';
  select cub_cash into cash from public.profiles where id = b;
  assert cash = b0, '11: draw refunds the receiver';

  -- 12. Only one player scores: they win.
  c6 := (public.challenge_send(b_name, 'river', 50)->>'id')::uuid;
  perform pg_temp.as_player(b);
  perform public.challenge_respond(c6, true);
  perform pg_temp.as_player(a);
  perform public.submit_challenge_score('river', 10);
  update public.challenges set ends_at = now() - interval '1 second' where id = c6;
  perform pg_temp.as_player(b);
  perform public.my_challenges();
  select * into row_ from public.challenges where id = c6;
  assert row_.winner = a, '12: the only player who scored wins';
  select cub_cash into cash from public.profiles where id = a;
  assert cash = a0 + 50, '12: and takes both wagers';

  -- 13. Nobody scores: both refunded.
  select cub_cash into a0 from public.profiles where id = a;
  select cub_cash into b0 from public.profiles where id = b;
  perform pg_temp.as_player(a);
  c7 := (public.challenge_send(b_name, 'solitaire-pyramid-hard', 250)->>'id')::uuid;
  perform pg_temp.as_player(b);
  perform public.challenge_respond(c7, true);
  update public.challenges set ends_at = now() - interval '1 second' where id = c7;
  perform public.my_challenges();
  select * into row_ from public.challenges where id = c7;
  assert row_.outcome = 'no_scores' and row_.winner is null, '13: no scores';
  select cub_cash into cash from public.profiles where id = a;
  assert cash = a0, '13: sender refunded';
  select cub_cash into cash from public.profiles where id = b;
  assert cash = b0, '13: receiver refunded';

  -- Every closed test challenge holds nothing, and its money moves add up to zero.
  select count(*) into n from public.challenges where id in (c1, c2, c3, c4, c5, c6, c7) and held <> 0;
  assert n = 0, 'nothing left held';
  select coalesce(sum(l.amount), 0) into total
  from public.coin_ledger l
  where l.operation_id like any (array[
    'challenge-' || c1 || '-%', 'challenge-' || c2 || '-%', 'challenge-' || c3 || '-%',
    'challenge-' || c4 || '-%', 'challenge-' || c5 || '-%', 'challenge-' || c6 || '-%', 'challenge-' || c7 || '-%'
  ]);
  assert total = 0, 'challenge money in equals money out';

  -- At most 10 going at once: sent and still waiting, plus active ones either way.
  perform pg_temp.as_player(a);
  sent_ids := array[]::uuid[];
  foreach board in array boards[1:10] loop
    sent_ids := sent_ids || (public.challenge_send(b_name, board, 50)->>'id')::uuid;
  end loop;
  assert public.challenge_open_count(a) = 10, 'limit: ten sent';
  begin
    perform public.challenge_send(b_name, boards[11], 50);
    assert false, 'limit: an eleventh challenge is refused';
  exception when raise_exception then
    null;
  end;
  perform pg_temp.as_player(b);
  perform public.challenge_respond(sent_ids[1], true);
  assert public.challenge_open_count(a) = 10, 'limit: an accepted challenge still counts for the sender';
  assert public.challenge_open_count(b) = 1, 'limit: and now counts for the receiver';
  c1 := (public.challenge_send(a_name, boards[12], 50)->>'id')::uuid;
  assert public.challenge_open_count(a) = 10, 'limit: a received challenge does not count until accepted';
  perform pg_temp.as_player(a);
  begin
    perform public.challenge_respond(c1, true);
    assert false, 'limit: cannot accept with ten already going';
  exception when raise_exception then
    null;
  end;
  perform public.challenge_cancel(sent_ids[2]);
  r := public.challenge_respond(c1, true);
  assert r->>'status' = 'active', 'limit: room again after one closes';

  -- Close A's open challenges so the money checks below aren't stopped by the limit instead.
  perform pg_temp.as_player(a);
  for c1 in select id from public.challenges where challenger = a and status = 'pending' loop
    perform public.challenge_cancel(c1);
  end loop;
  update public.challenges set ends_at = now() - interval '1 second'
  where status = 'active' and (challenger = a or opponent = a);
  for c1 in select id from public.challenges where status = 'active' and (challenger = a or opponent = a) loop
    perform public.challenge_close(c1);
  end loop;
  assert public.challenge_open_count(a) = 0, 'A has nothing going before the money checks';

  -- Not enough Cub Cash.
  select cub_cash into cash from public.profiles where id = a;
  perform public.challenge_move_cash(a, 40 - cash, 'Admin: challenge test', 'challenge-test-drain-' || gen_random_uuid());
  begin
    perform public.challenge_send(b_name, 'hoops', 50);
    assert false, 'cannot wager more than you have';
  exception when raise_exception then
    null;
  end;

  -- The starting 100 Cub Cash can never be wagered: 140 is not enough for a 50 wager, 150 is.
  perform public.challenge_move_cash(a, 100, 'Admin: challenge test', 'challenge-test-starter-' || gen_random_uuid());
  begin
    perform public.challenge_send(b_name, 'hoops', 50);
    assert false, 'starter cash: 140 cannot wager 50';
  exception when raise_exception then
    null;
  end;
  perform public.challenge_move_cash(a, 10, 'Admin: challenge test', 'challenge-test-starter-' || gen_random_uuid());
  c2 := (public.challenge_send(b_name, 'hoops', 50)->>'id')::uuid;
  select cub_cash into cash from public.profiles where id = a;
  assert cash = 100, 'starter cash: 150 can wager 50, leaving the starting 100';
  perform public.challenge_cancel(c2);
  -- And the same when accepting.
  perform pg_temp.as_player(b);
  c2 := (public.challenge_send(a_name, 'dojo', 100)->>'id')::uuid;
  perform pg_temp.as_player(a);
  begin
    perform public.challenge_respond(c2, true);
    assert false, 'starter cash: 150 cannot accept a 100 wager';
  exception when raise_exception then
    null;
  end;
  perform public.challenge_respond(c2, false);

  -- 16. Normal scores still reach the leaderboards.
  perform public.submit_score('hoops', 4321);
  select count(*) into n from public.leaderboard_scores
  where user_id = a and game = 'hoops' and week_start = public.eastern_week_start() and score >= 4321;
  assert n = 1, '16: leaderboards unchanged';

  -- The screen data and the player list load.
  r := public.my_challenges();
  assert jsonb_typeof(r->'challenges') = 'array' and jsonb_typeof(r->'notices') = 'array', 'my_challenges shape';
  r := public.challenge_players('', 20, 0);
  assert not exists (select 1 from jsonb_array_elements(r->'rows') x where x->>'username' = a_name), 'you are not in your own list';

  -- Community results list played-out challenges, with the winner, and leave out refunded ones.
  r := public.challenge_results(30, 0);
  assert exists (
    select 1 from jsonb_array_elements(r->'rows') x
    where x->>'id' = c4::text and x->>'winner' = b_name and (x->'opponent'->>'best')::integer = 70
  ), 'community results show a finished challenge and its winner';
  assert exists (select 1 from jsonb_array_elements(r->'rows') x where x->>'id' = c5::text and x->>'winner' is null),
    'community results show draws';
  assert not exists (select 1 from jsonb_array_elements(r->'rows') x where x->>'id' in (c1::text, c3::text, c7::text)),
    'cancelled, expired and unplayed challenges are not community results';
  r := public.challenge_results(30, 0, upper(substr(b_name, 1, 3)));
  assert exists (select 1 from jsonb_array_elements(r->'rows') x where x->>'id' = c4::text), 'search finds a player''s results';
  r := public.challenge_results(30, 0, 'no-such-player-xyz');
  assert jsonb_array_length(r->'rows') = 0 and (r->>'more')::boolean = false, 'search with no match is empty';

  -- Both lists show the 100 most recent finished challenges; older ones stay stored.
  -- A loses all 102 of these (only B scores), at 50 each.
  perform public.challenge_move_cash(a, 10000, 'Admin: challenge test', 'challenge-test-topup-a2-' || gen_random_uuid());
  perform public.challenge_move_cash(b, 5000, 'Admin: challenge test', 'challenge-test-topup-b2-' || gen_random_uuid());
  perform pg_temp.as_player(a);
  for c1 in select id from public.challenges where challenger = a and status = 'pending' loop
    perform public.challenge_cancel(c1);
  end loop;
  update public.challenges set ends_at = now() - interval '1 second'
  where status = 'active' and (challenger = a or opponent = a);
  for c1 in select id from public.challenges where status = 'active' and (challenger = a or opponent = a) loop
    perform public.challenge_close(c1);
  end loop;
  for n in 1..102 loop
    perform pg_temp.as_player(a);
    c1 := (public.challenge_send(b_name, 'archer', 50)->>'id')::uuid;
    perform pg_temp.as_player(b);
    perform public.challenge_respond(c1, true);
    perform public.submit_challenge_score('archer', n);
    update public.challenges set ends_at = now() - interval '1 second' where id = c1;
    perform public.challenge_close(c1);
  end loop;
  perform pg_temp.as_player(a);
  r := public.my_challenges();
  assert (select count(*) from jsonb_array_elements(r->'challenges') x where x->>'status' = 'completed') = 100,
    'my results stop at 100';
  r := public.challenge_results(30, 90);
  assert jsonb_array_length(r->'rows') = 10 and (r->>'more')::boolean = false, 'community results stop at 100';
  r := public.challenge_results(30, 100);
  assert jsonb_array_length(r->'rows') = 0, 'nothing past 100';
  assert (select count(*) from public.challenges where challenger = a and status = 'completed') >= 102,
    'older challenges are still stored';

  raise exception 'Challenge tests passed. (This error is on purpose so nothing is saved.)';
end;
$$;
