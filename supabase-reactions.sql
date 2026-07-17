-- Run once in the Supabase SQL Editor: adds 💪 reactions on group feed items.

create table if not exists public.reactions (
  group_id uuid not null references public.groups(id) on delete cascade,
  event_key text not null,
  reactor_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reactor_name text not null,
  emoji text not null default '💪',
  created_at timestamptz not null default now(),
  primary key (group_id, event_key, reactor_id)
);

alter table public.reactions enable row level security;

drop policy if exists "read group reactions" on public.reactions;
create policy "read group reactions" on public.reactions
  for select to authenticated
  using (group_id in (select public.my_group_ids()));

drop policy if exists "react in my groups" on public.reactions;
create policy "react in my groups" on public.reactions
  for insert to authenticated
  with check (reactor_id = auth.uid() and group_id in (select public.my_group_ids()));

drop policy if exists "remove own reaction" on public.reactions;
create policy "remove own reaction" on public.reactions
  for delete to authenticated
  using (reactor_id = auth.uid());

notify pgrst, 'reload schema';
