begin;

-- Every save is tied to the exact cloud version the device loaded. PostgreSQL takes
-- the row lock and re-checks the timestamp atomically, so two devices cannot both
-- overwrite the same version. The server, not the browser, chooses the next timestamp.
create or replace function public.save_user_state(
  p_value jsonb,
  p_expected_updated_at timestamptz default null
)
returns table(updated_at timestamptz)
language plpgsql security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_updated_at timestamptz := clock_timestamp();
  v_rows integer := 0;
begin
  if v_user is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;
  if p_value is null or jsonb_typeof(p_value)<>'object' then
    raise exception using errcode='22023',message='INVALID_USER_STATE';
  end if;

  if p_expected_updated_at is null then
    begin
      insert into public.user_state(user_id,value,updated_at)
      values(v_user,p_value,v_updated_at);
    exception when unique_violation then
      raise exception using errcode='P0001',message='STATE_CONFLICT';
    end;
  else
    update public.user_state s
    set value=p_value,updated_at=v_updated_at
    where s.user_id=v_user and s.updated_at=p_expected_updated_at;
    get diagnostics v_rows=row_count;
    if v_rows<>1 then
      raise exception using errcode='P0001',message='STATE_CONFLICT';
    end if;
  end if;

  return query select v_updated_at;
end;
$$;

revoke all on function public.save_user_state(jsonb,timestamptz) from public,anon;
grant execute on function public.save_user_state(jsonb,timestamptz) to authenticated;

commit;
