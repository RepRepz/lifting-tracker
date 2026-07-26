begin;

-- Make the repository sufficient to recreate every intended end-user RLS rule.
-- Mutations that need more authority remain available only through narrow RPCs.

drop policy if exists "users insert own" on public.user_state;
create policy "users insert own" on public.user_state for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users update own" on public.user_state;
create policy "users update own" on public.user_state for update to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read own history" on public.user_state_history;
create policy "read own history" on public.user_state_history for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "gm_owner_delete" on public.group_members;
create policy "gm_owner_delete" on public.group_members for delete to authenticated
using (exists (
  select 1 from public.groups g
  where g.id = group_members.group_id and g.created_by = auth.uid()
));

drop policy if exists "leave group" on public.group_members;
create policy "leave group" on public.group_members for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "remove own reaction" on public.reactions;
create policy "remove own reaction" on public.reactions for delete to authenticated
using (reactor_id = auth.uid());

commit;
