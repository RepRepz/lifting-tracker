begin;

-- Add the standard concentration curl machine to every existing exercise library.
-- New accounts receive the same movement from the frontend seed library.
with standard_exercise as (
  select jsonb_build_object(
    'name','Concentration Curl Machine',
    'muscle','Biceps','muscles',jsonb_build_array('Biceps'),'muscles2','[]'::jsonb,
    'type','Weighted','barbell',false,'machine',true
  ) as item
)
update public.user_state s
set value = jsonb_set(
  jsonb_set(
    s.value,
    '{exercises}',
    coalesce(s.value->'exercises','[]'::jsonb) ||
      case when exists (
        select 1
        from jsonb_array_elements(coalesce(s.value->'exercises','[]'::jsonb)) e
        where lower(e->>'name') = lower('Concentration Curl Machine')
      ) then '[]'::jsonb
      else jsonb_build_array((select item from standard_exercise))
      end,
    true
  ),
  '{libraryV}',
  '13'::jsonb,
  true
);

commit;
