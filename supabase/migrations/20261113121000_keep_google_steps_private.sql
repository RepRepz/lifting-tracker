-- Imported Fitbit totals belong in the owner's Steps tab, not group feeds.
drop policy if exists steps_select on public.steps;
create policy steps_select on public.steps for select to authenticated using (
  auth.uid() = user_id or (
    source = 'apple'
    and private.pro_active(auth.uid())
    and private.pro_active(user_id)
    and private.shares_group_with(user_id)
  )
);
