-- Run once in the Supabase SQL editor, after coins.sql.
-- This does not change existing coin balances or cub saves.
-- After it succeeds, sign in at /admin and the page will show the one line
-- that adds your login to public.admins.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.coin_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  operation_id text not null unique,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists coin_ledger_user_time
  on public.coin_ledger (user_id, created_at desc);

alter table public.admins enable row level security;
alter table public.coin_ledger enable row level security;

revoke all on public.admins from anon, authenticated;
revoke all on public.coin_ledger from anon, authenticated;

grant select on public.coin_ledger to authenticated;

drop policy if exists "read own ledger" on public.coin_ledger;
create policy "read own ledger"
  on public.coin_ledger for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.log_cub_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reason text := nullif(current_setting('cub.cash_reason', true), '');
  op text := nullif(current_setting('cub.operation_id', true), '');
begin
  if new.cub_cash is not distinct from old.cub_cash then
    return new;
  end if;
  insert into public.coin_ledger (user_id, amount, balance_after, reason, operation_id, actor_id)
  values (
    new.id,
    new.cub_cash - old.cub_cash,
    new.cub_cash,
    coalesce(reason, 'balance change'),
    coalesce(op, gen_random_uuid()::text),
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists log_cub_cash on public.profiles;
create trigger log_cub_cash
  after update of cub_cash on public.profiles
  for each row execute function public.log_cub_cash();

create or replace function public.admin_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.admin_guard()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.admins where user_id = uid) then
    raise exception 'Not allowed';
  end if;
  return uid;
end;
$$;

create or replace function public.admin_search(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  needle text;
begin
  perform public.admin_guard();
  needle := lower(btrim(left(replace(replace(coalesce(p_query, ''), '%', ''), '_', ''), 32)));
  return (
    select coalesce(jsonb_agg(found.item order by found.item->>'username'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', u.id,
        'username', coalesce(p.username, names.username),
        'cub_cash', coalesce(p.cub_cash, 100),
        'energy', case
          when coalesce(p.save->>'energy', '') ~ '^[0-9]+(\.[0-9]+)?$'
          then least(100, greatest(0, (p.save->>'energy')::numeric))::integer
          else 0
        end,
        'xp', case
          when coalesce(p.save->>'xp', '') ~ '^[0-9]+(\.[0-9]+)?$'
          then (p.save->>'xp')::numeric
          else 0
        end,
        'eth_address', nullif(u.raw_user_meta_data->>'eth_address', ''),
        'banned', coalesce(p.banned, false),
        'created_at', u.created_at,
        'last_visit', case
          when coalesce(p.save->>'lastVisit', '') ~ '^[0-9]+(\.[0-9]+)?$'
          then trunc((p.save->>'lastVisit')::numeric)::bigint
          else 0
        end
      ) as item
      from auth.users u
      cross join lateral (
        select left(lower(coalesce(nullif(btrim(u.raw_user_meta_data->>'username'), ''), split_part(u.email, '@', 1))), 12) as username
      ) names
      left join public.profiles p on p.id = u.id
      where u.email ilike '%@users.lazycub.life'
        and (
          needle = ''
          or names.username ilike '%' || needle || '%'
          or coalesce(p.username, '') ilike '%' || needle || '%'
        )
      order by coalesce(p.username, names.username)
      limit 25
    ) found
  );
end;
$$;

create or replace function public.admin_history(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  return (
    select coalesce(jsonb_agg(to_jsonb(entries) order by entries.created_at desc), '[]'::jsonb)
    from (
      select
        ledger.amount,
        ledger.balance_after,
        ledger.reason,
        ledger.created_at,
        actor.username as actor
      from public.coin_ledger ledger
      left join public.profiles actor on actor.id = ledger.actor_id
      where ledger.user_id = p_player
      order by ledger.created_at desc
      limit 40
    ) entries
  );
end;
$$;

create or replace function public.admin_adjust_coins(p_player uuid, p_amount integer, p_operation text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  balance integer;
  note text;
begin
  perform public.admin_guard();
  if p_player is null or p_amount is null or p_amount = 0 then
    raise exception 'Enter a coin amount other than zero';
  end if;
  if p_operation is null or char_length(p_operation) < 8 then
    raise exception 'Bad coin request';
  end if;
  if exists (select 1 from public.coin_ledger where operation_id = p_operation) then
    select cub_cash into balance from public.profiles where id = p_player;
    return jsonb_build_object('cubCash', balance, 'duplicate', true);
  end if;
  select cub_cash into balance from public.profiles where id = p_player;
  if balance is null then
    raise exception 'Player not found';
  end if;
  if balance + p_amount < 0 then
    raise exception 'That would make the balance negative';
  end if;
  note := left(coalesce(nullif(trim(p_note), ''), 'Admin adjustment'), 160);
  perform set_config('cub.cash_write', 'allow', true);
  perform set_config('cub.cash_reason', 'Admin: ' || note, true);
  perform set_config('cub.operation_id', p_operation, true);
  update public.profiles
    set cub_cash = cub_cash + p_amount
    where id = p_player
    returning cub_cash into balance;
  return jsonb_build_object('cubCash', balance, 'duplicate', false);
end;
$$;

create or replace function public.admin_fill_energy(p_player uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  energy integer := 100;
begin
  perform public.admin_guard();
  update public.profiles
    set save = jsonb_set(coalesce(save, '{}'::jsonb), '{energy}', to_jsonb(energy), true),
        updated_at = now()
    where id = p_player;
  if not found then
    raise exception 'Player not found';
  end if;
  return energy;
end;
$$;

create or replace function public.admin_set_password(p_player uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.admin_guard();
  if p_password is null or char_length(p_password) < 6 then
    raise exception 'Use at least 6 characters';
  end if;
  update auth.users
    set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        updated_at = now()
    where id = p_player;
  if not found then
    raise exception 'Player not found';
  end if;
end;
$$;

revoke all on function public.log_cub_cash() from public, anon, authenticated;
revoke all on function public.admin_guard() from public, anon, authenticated;
revoke all on function public.admin_is_admin() from public, anon, authenticated;
revoke all on function public.admin_search(text) from public, anon, authenticated;
revoke all on function public.admin_history(uuid) from public, anon, authenticated;
revoke all on function public.admin_adjust_coins(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.admin_fill_energy(uuid) from public, anon, authenticated;
revoke all on function public.admin_set_password(uuid, text) from public, anon, authenticated;

alter table public.profiles add column if not exists banned boolean not null default false;

create or replace function public.block_banned_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'profiles' and tg_op = 'UPDATE' then
    if old.id = auth.uid() and old.banned then
      raise exception 'This account is banned';
    end if;
    if new.banned is distinct from old.banned
      and not exists (select 1 from public.admins where user_id = auth.uid()) then
      raise exception 'Not allowed';
    end if;
    return new;
  end if;
  if auth.uid() is not null and exists (
    select 1 from public.profiles where id = auth.uid() and banned
  ) then
    raise exception 'This account is banned';
  end if;
  return new;
end;
$$;

drop trigger if exists block_banned_player on public.profiles;
create trigger block_banned_player
  before update on public.profiles
  for each row execute function public.block_banned_player();

drop trigger if exists block_banned_player on public.daily_state;
create trigger block_banned_player
  before insert or update on public.daily_state
  for each row execute function public.block_banned_player();

create or replace function public.admin_set_ban(p_player uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  if p_player is null or p_banned is null then
    raise exception 'Choose a player';
  end if;
  if p_player = auth.uid() then
    raise exception 'You cannot ban your own account';
  end if;
  if exists (select 1 from public.admins where user_id = p_player) then
    raise exception 'That account is an admin';
  end if;
  if not exists (select 1 from auth.users where id = p_player) then
    raise exception 'Player not found';
  end if;

  update public.profiles
    set banned = p_banned,
        updated_at = now()
    where id = p_player;
  if not found then
    raise exception 'Player not found';
  end if;

  update auth.users
    set banned_until = case when p_banned then now() + interval '100 years' else null end
    where id = p_player;

  if p_banned then
    begin
      delete from auth.refresh_tokens where user_id = p_player;
    exception when others then
      null;
    end;
    begin
      delete from auth.sessions where user_id = p_player;
    exception when others then
      null;
    end;
  end if;
end;
$$;

revoke all on function public.block_banned_player() from public, anon, authenticated;
revoke all on function public.admin_set_ban(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_ban(uuid, boolean) to authenticated;

grant execute on function public.admin_is_admin() to authenticated;
grant execute on function public.admin_search(text) to authenticated;
grant execute on function public.admin_history(uuid) to authenticated;
grant execute on function public.admin_adjust_coins(uuid, integer, text, text) to authenticated;
grant execute on function public.admin_fill_energy(uuid) to authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;

alter table public.profiles add column if not exists username_changed_at timestamptz;

create or replace function public.update_account_settings(p_username text, p_eth text, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  display_name text := btrim(coalesce(p_username, ''));
  login_name text := lower(display_name);
  new_email text;
  eth text := nullif(btrim(coalesce(p_eth, '')), '');
  meta jsonb;
  current_name text;
  changed_at timestamptz;
  name_changed boolean;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;
  if p_password is null or char_length(p_password) < 1
    or not exists (
      select 1 from auth.users
      where id = uid
        and encrypted_password = extensions.crypt(p_password, encrypted_password)
    ) then
    raise exception 'Password is wrong';
  end if;
  if login_name !~ '^[a-z0-9_]{3,12}$' then
    raise exception 'Use 3 to 12 letters, numbers, or underscores.';
  end if;
  if eth is not null then
    if eth !~* '^0x[0-9a-f]{40}$' then
      raise exception 'Use a full ETH address, starting with 0x.';
    end if;
    eth := '0x' || lower(substring(eth from 3));
  end if;
  new_email := login_name || '@users.lazycub.life';
  if exists (select 1 from auth.users where id <> uid and lower(email) = new_email) then
    raise exception 'That username is taken.';
  end if;
  if exists (select 1 from public.profiles where id <> uid and lower(username) = login_name) then
    raise exception 'That username is taken.';
  end if;

  select username, username_changed_at into current_name, changed_at
  from public.profiles
  where id = uid;
  if current_name is null then
    select nullif(btrim(raw_user_meta_data->>'username'), '') into current_name
    from auth.users
    where id = uid;
  end if;
  name_changed := btrim(coalesce(current_name, '')) is distinct from display_name;
  if name_changed and changed_at is not null and changed_at > now() - interval '7 days' then
    raise exception 'Username can be changed again on %',
      to_char((changed_at + interval '7 days') at time zone 'Europe/London', 'FMDD Mon YYYY');
  end if;

  select coalesce(raw_user_meta_data, '{}'::jsonb) into meta from auth.users where id = uid;
  meta := jsonb_set(meta, '{username}', to_jsonb(display_name), true);
  if eth is null then
    meta := meta - 'eth_address';
  else
    meta := jsonb_set(meta, '{eth_address}', to_jsonb(eth), true);
  end if;

  update auth.users
    set email = new_email,
        raw_user_meta_data = meta,
        updated_at = now()
    where id = uid;

  update auth.identities
    set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(new_email), true),
        updated_at = now()
    where user_id = uid and provider = 'email';

  update public.profiles
    set username = display_name,
        username_changed_at = case when name_changed then now() else username_changed_at end,
        updated_at = now()
    where id = uid;
end;
$$;

revoke all on function public.update_account_settings(text, text, text) from public, anon, authenticated;
grant execute on function public.update_account_settings(text, text, text) to authenticated;

-- Fill in a normal starter cub when an account has no saved cub, or only an empty one.
insert into public.profiles (id, username, save)
select
  u.id,
  names.username,
  jsonb_build_object('version', 1, 'cubCash', 100, 'xp', 0, 'energy', 70, 'lastVisit', floor(extract(epoch from now()) * 1000))
from auth.users u
cross join lateral (
  select left(lower(coalesce(nullif(btrim(u.raw_user_meta_data->>'username'), ''), split_part(u.email, '@', 1))), 12) as username
) names
where u.email ilike '%@users.lazycub.life'
  and names.username ~ '^[a-z0-9_]{3,12}$'
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.username = names.username);

update public.profiles
set save = save || jsonb_build_object(
  'version', 1,
  'cubCash', cub_cash,
  'xp', 0,
  'energy', 70,
  'lastVisit', floor(extract(epoch from now()) * 1000)
)
where coalesce(save->>'version', '') <> '1';

-- LazyCubLife is the admin login. Safe to run again.
insert into public.admins (user_id)
select id from auth.users
where email = 'lazycublife@users.lazycub.life'
on conflict (user_id) do nothing;

-- Synegi signed up as Synegi. Login stays case-insensitive.
update auth.users
set raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{username}', '"Synegi"')
where email = 'synegi@users.lazycub.life';

update public.profiles
set username = 'Synegi'
where lower(username) = 'synegi';

alter table public.profiles add column if not exists activity jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists activity_at timestamptz;

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
  if p_area not in ('home', 'wardrobe', 'flight', 'match', 'dojo', 'archer', 'hoops') then
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
  return allowed;
end;
$$;

create or replace function public.admin_activity(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  stored jsonb;
begin
  perform public.admin_guard();
  select coalesce(activity, '{}'::jsonb) into stored
  from public.profiles
  where id = p_player;
  return coalesce(stored, '{}'::jsonb);
end;
$$;

revoke all on function public.record_activity(text, integer) from public, anon, authenticated;
revoke all on function public.admin_activity(uuid) from public, anon, authenticated;
grant execute on function public.record_activity(text, integer) to authenticated;
grant execute on function public.admin_activity(uuid) to authenticated;
