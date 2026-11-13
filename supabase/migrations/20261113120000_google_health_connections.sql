-- Google Health OAuth credentials are server-only. No browser role receives table access.
create table if not exists public.google_health_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_tokens text,
  state_nonce text,
  state_expires_at timestamptz,
  connected_at timestamptz,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.google_health_connections enable row level security;
revoke all on public.google_health_connections from anon, authenticated;

-- Label imported rows without changing the existing one-row-per-user/day behavior.
alter table public.steps add column if not exists source text not null default 'apple'
  check (source in ('apple','google'));

create index if not exists google_health_connections_state_nonce_idx
  on public.google_health_connections(state_nonce) where state_nonce is not null;

-- If an Apple Shortcut is reconnected later, its writes become the active source.
create or replace function private.log_steps(p_token uuid,p_day date,p_count integer)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid;
begin
  if p_count is null or p_count<0 or p_count>=1000000 then return 'bad count'; end if;
  select t.user_id into uid from public.step_tokens t where t.token=p_token;
  if uid is null or not private.pro_active(uid) then return 'bad token'; end if;
  if p_day is null or p_day<current_date-15 or p_day>current_date+1 then return 'bad date'; end if;
  insert into public.steps(user_id,day,count,source,updated_at) values(uid,p_day,p_count,'apple',now())
  on conflict(user_id,day) do update set count=excluded.count,source='apple',updated_at=now();
  return 'ok';
end;
$$;
