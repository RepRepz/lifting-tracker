-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Creates the key/value table the app saves its state into.

create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- The app uses the public anon key with no login, so these policies let
-- anyone holding the anon key read/write. Fine for a personal tracker,
-- but note the data is effectively public (see README).
create policy "anon can read" on public.app_state
  for select to anon using (true);

create policy "anon can insert" on public.app_state
  for insert to anon with check (true);

create policy "anon can update" on public.app_state
  for update to anon using (true) with check (true);
