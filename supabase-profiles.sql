-- Run once in the Supabase SQL Editor to add per-user profiles.
-- Each signed-in user gets their own private row; RLS guarantees
-- nobody can read or write anyone else's data.

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

drop policy if exists "users read own" on public.user_state;
drop policy if exists "users insert own" on public.user_state;
drop policy if exists "users update own" on public.user_state;

create policy "users read own" on public.user_state
  for select to authenticated using (auth.uid() = user_id);

create policy "users insert own" on public.user_state
  for insert to authenticated with check (auth.uid() = user_id);

create policy "users update own" on public.user_state
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Old shared table from before profiles: block all writes, but keep it
-- readable so the app can offer a one-time import of the old data.
drop policy if exists "anon can insert" on public.app_state;
drop policy if exists "anon can update" on public.app_state;
drop policy if exists "anon can read" on public.app_state;
drop policy if exists "legacy read for import" on public.app_state;

create policy "legacy read for import" on public.app_state
  for select to anon, authenticated using (true);
