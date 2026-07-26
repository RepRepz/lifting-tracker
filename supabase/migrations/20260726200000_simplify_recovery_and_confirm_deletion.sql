begin;

-- Keep exactly one unused recovery code per account. Older extras are invalidated.
delete from private.backup_codes b
using (
  select id from (
    select id, row_number() over (partition by user_id order by created_at desc, id desc) as position
    from private.backup_codes where used_at is null
  ) ranked where position > 1
) extras
where b.id = extras.id;

create or replace function private.generate_backup_codes()
returns table(code text) language plpgsql security definer
set search_path = public, private, extensions, pg_temp
as $$
declare raw text;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  delete from private.backup_codes where user_id = auth.uid();
  raw := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  insert into private.backup_codes(user_id, code_hash)
  values (auth.uid(), extensions.crypt(raw, extensions.gen_salt('bf')));
  code := substr(raw,1,4)||'-'||substr(raw,5,4)||'-'||substr(raw,9,4)||'-'||substr(raw,13,4);
  return next;
end;
$$;

-- Snapshots continue to be written by the database trigger, but are no longer
-- downloadable or restorable through the end-user API.
revoke all on public.user_state_history from anon, authenticated;
drop policy if exists "read own history" on public.user_state_history;
drop function if exists public.list_state_history();

-- Direct deletion is removed. A short-lived email token handled by the server-side
-- account-deletion function is now the only self-service deletion path.
drop function if exists public.delete_my_account();
drop function if exists private.delete_my_account();

create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists account_deletion_requests_expires_idx
  on public.account_deletion_requests(expires_at);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;

commit;
