begin;

-- Catch losses the size of the August 20 incident (99 log rows suddenly becoming
-- 72), while continuing to permit normal one-at-a-time deletes. The optimistic
-- client version check is the first line of defense; this trigger is the last one.
create or replace function private.version_and_guard_user_state()
returns trigger language plpgsql security definer
set search_path=public,private,pg_temp
as $$
declare
  old_log integer := coalesce(jsonb_array_length(coalesce(old.value->'log','[]'::jsonb)),0);
  new_log integer := coalesce(jsonb_array_length(coalesce(new.value->'log','[]'::jsonb)),0);
  old_bw integer := coalesce(jsonb_array_length(coalesce(old.value->'bodyweight','[]'::jsonb)),0);
  new_bw integer := coalesce(jsonb_array_length(coalesce(new.value->'bodyweight','[]'::jsonb)),0);
  old_cardio integer := coalesce(jsonb_array_length(coalesce(old.value->'cardio','[]'::jsonb)),0);
  new_cardio integer := coalesce(jsonb_array_length(coalesce(new.value->'cardio','[]'::jsonb)),0);
  old_exercises integer := coalesce(jsonb_array_length(coalesce(old.value->'exercises','[]'::jsonb)),0);
  new_exercises integer := coalesce(jsonb_array_length(coalesce(new.value->'exercises','[]'::jsonb)),0);
  old_bytes integer := pg_column_size(old.value);
  new_bytes integer := pg_column_size(new.value);
begin
  if old.value is not distinct from new.value then return new; end if;

  if (old_log >= 10 and old_log-new_log >= 3 and new_log < old_log * 0.85)
     or (old_bw >= 5 and old_bw-new_bw >= 2 and new_bw < old_bw * 0.80)
     or (old_cardio >= 3 and old_cardio-new_cardio >= 2 and new_cardio < old_cardio * 0.75)
     or (old_exercises >= 20 and old_exercises-new_exercises >= 3 and new_exercises < old_exercises * 0.90)
     or (old_bytes >= 5000 and old_bytes-new_bytes >= 1500 and new_bytes < old_bytes * 0.75) then
    raise exception using errcode='P0001',message='STATE_SHRINK_BLOCKED';
  end if;

  insert into private.user_state_versions(user_id,value,log_rows,weighins,cardio,bytes)
  values(old.user_id,old.value,old_log,old_bw,old_cardio,old_bytes);

  delete from private.user_state_versions v
  where v.user_id=old.user_id and (
    v.captured_at < now()-interval '90 days'
    or v.id in (
      select id from private.user_state_versions
      where user_id=old.user_id order by captured_at desc offset 500
    )
  );
  return new;
end;
$$;

commit;
