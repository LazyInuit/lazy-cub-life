-- Safe to run again. Needs admin.sql. Run player-profile.sql after this so visits show them.
-- Special characters (such as the Pharaoh) are whole-cub looks only selected players may wear.
-- Admins allow or remove them per player from the admin page. Players read only their own list.
-- The save's specialCharacter is the player's choice; it is only drawn while this table allows it.

create table if not exists public.special_characters (
  user_id uuid not null references auth.users (id) on delete cascade,
  character text not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, character)
);

-- No policies: only the functions below read or change it.
alter table public.special_characters enable row level security;
revoke all on table public.special_characters from public, anon, authenticated;

create or replace function public.my_special_characters()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(sc.character order by sc.character), '[]'::jsonb)
  from public.special_characters sc
  where sc.user_id = auth.uid();
$$;

create or replace function public.admin_special_characters(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  return (
    select coalesce(jsonb_agg(sc.character order by sc.character), '[]'::jsonb)
    from public.special_characters sc
    where sc.user_id = p_player
  );
end;
$$;

-- Must match SPECIAL_CHARACTER_IDS in src/game/types.ts.
create or replace function public.admin_set_special_character(p_player uuid, p_character text, p_allowed boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := public.admin_guard();
begin
  if p_character is null or p_character not in ('pharaoh') then
    raise exception 'Unknown special character';
  end if;
  if not exists (select 1 from public.profiles where id = p_player) then
    raise exception 'Player not found';
  end if;
  if p_allowed then
    insert into public.special_characters (user_id, character, granted_by)
    values (p_player, p_character, admin_id)
    on conflict (user_id, character) do nothing;
  else
    delete from public.special_characters
    where user_id = p_player and character = p_character;
  end if;
  return public.admin_special_characters(p_player);
end;
$$;

revoke all on function public.my_special_characters() from public, anon, authenticated;
revoke all on function public.admin_special_characters(uuid) from public, anon, authenticated;
revoke all on function public.admin_set_special_character(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.my_special_characters() to authenticated;
grant execute on function public.admin_special_characters(uuid) to authenticated;
grant execute on function public.admin_set_special_character(uuid, text, boolean) to authenticated;
