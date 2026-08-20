begin;

-- Force all browser writes through save_user_state. This also retires cached copies
-- of the legacy app's unconditional upsert path: they can read their own state but
-- cannot replace it. The current app keeps unsent data locally and merges after reload.
revoke insert,update on public.user_state from authenticated;
grant select on public.user_state to authenticated;

commit;
