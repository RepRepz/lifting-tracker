begin;

-- Give every existing account an immediate immutable rollback point. Future successful
-- updates are captured by trg_version_and_guard_user_state before the row changes.
insert into private.user_state_versions(user_id,value,log_rows,weighins,cardio,bytes)
select s.user_id,s.value,
  coalesce(jsonb_array_length(coalesce(s.value->'log','[]'::jsonb)),0),
  coalesce(jsonb_array_length(coalesce(s.value->'bodyweight','[]'::jsonb)),0),
  coalesce(jsonb_array_length(coalesce(s.value->'cardio','[]'::jsonb)),0),
  pg_column_size(s.value)
from public.user_state s
where not exists (
  select 1 from private.user_state_versions v where v.user_id=s.user_id
);

commit;
