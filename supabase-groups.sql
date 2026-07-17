-- Run once in the Supabase SQL Editor to add friend groups.
-- Groups are joined by invite code; members of the same group can view
-- each other's tracker data (read-only). Writing stays owner-only.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- Helper functions run with elevated rights so RLS policies can use them
-- without infinite recursion.
create or replace function public.my_group_ids() returns setof uuid
language sql security definer set search_path = public stable as
$$ select group_id from group_members where user_id = auth.uid() $$;

create or replace function public.shares_group_with(target uuid) returns boolean
language sql security definer set search_path = public stable as
$$ select exists(
     select 1 from group_members a
     join group_members b on a.group_id = b.group_id
     where a.user_id = auth.uid() and b.user_id = target) $$;

drop policy if exists "members read their groups" on public.groups;
create policy "members read their groups" on public.groups
  for select to authenticated using (id in (select public.my_group_ids()));

drop policy if exists "read fellow members" on public.group_members;
create policy "read fellow members" on public.group_members
  for select to authenticated using (group_id in (select public.my_group_ids()));

drop policy if exists "leave group" on public.group_members;
create policy "leave group" on public.group_members
  for delete to authenticated using (user_id = auth.uid());

-- Creating and joining go through functions so invite codes stay secret
-- (nobody can list codes; you must know one to join).
create or replace function public.create_group(p_name text)
returns table(group_id uuid, invite_code text)
language plpgsql security definer set search_path = public as $$
declare gid uuid; code text; uname text;
begin
  if p_name is null or length(trim(p_name)) < 1 or length(p_name) > 40 then
    raise exception 'Group name must be 1-40 characters';
  end if;
  code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  select coalesce(raw_user_meta_data->>'username', 'user') into uname
    from auth.users where id = auth.uid();
  insert into groups(name, invite_code, created_by)
    values (trim(p_name), code, auth.uid()) returning id into gid;
  insert into group_members(group_id, user_id, username)
    values (gid, auth.uid(), uname);
  return query select gid, code;
end $$;

create or replace function public.join_group(p_code text)
returns table(group_id uuid, group_name text)
language plpgsql security definer set search_path = public as $$
declare g record; uname text;
begin
  select id, name into g from groups where groups.invite_code = upper(trim(p_code));
  if g.id is null then
    raise exception 'No group found with that invite code';
  end if;
  select coalesce(raw_user_meta_data->>'username', 'user') into uname
    from auth.users where id = auth.uid();
  insert into group_members(group_id, user_id, username)
    values (g.id, auth.uid(), uname)
    on conflict do nothing;
  return query select g.id, g.name;
end $$;

revoke execute on function public.create_group(text) from public, anon;
revoke execute on function public.join_group(text) from public, anon;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.my_group_ids() to authenticated;
grant execute on function public.shares_group_with(uuid) to authenticated;

-- Let groupmates READ each other's tracker data (writes stay owner-only).
drop policy if exists "users read own" on public.user_state;
drop policy if exists "users read own or groupmates" on public.user_state;
create policy "users read own or groupmates" on public.user_state
  for select to authenticated
  using (auth.uid() = user_id or public.shares_group_with(user_id));

notify pgrst, 'reload schema';
