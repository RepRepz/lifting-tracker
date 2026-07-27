begin;

-- Add the new standard movement to every existing library. New accounts receive it
-- from the frontend seed library; this data migration covers accounts already saved.
with standard_exercise as (
  select jsonb_build_object(
    'name','Dumbbell Overhead Triceps Extension',
    'muscle','Triceps','muscles',jsonb_build_array('Triceps'),'muscles2','[]'::jsonb,
    'type','Weighted','barbell',false,'machine',false
  ) as item
)
update public.user_state s
set value = jsonb_set(
  jsonb_set(s.value,'{exercises}',
    coalesce(s.value->'exercises','[]'::jsonb) ||
    case when exists (
      select 1 from jsonb_array_elements(coalesce(s.value->'exercises','[]'::jsonb)) e
      where e->>'name'='Dumbbell Overhead Triceps Extension'
    ) then '[]'::jsonb else jsonb_build_array((select item from standard_exercise)) end,
    true),
  '{libraryV}','12'::jsonb,true
);

-- Dimi uses adjustable dumbbells and requested a separately tracked custom movement.
update public.user_state s
set value=jsonb_set(s.value,'{exercises}',
  coalesce(s.value->'exercises','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'name','Dumbbell Overhead Triceps Extension (Adjustables)',
    'muscle','Triceps','muscles',jsonb_build_array('Triceps'),'muscles2','[]'::jsonb,
    'type','Weighted','barbell',false,'machine',false
  )),true)
where s.user_id=(select user_id from public.profiles where username='dimi')
  and not exists (
    select 1 from jsonb_array_elements(coalesce(s.value->'exercises','[]'::jsonb)) e
    where e->>'name'='Dumbbell Overhead Triceps Extension (Adjustables)'
  );

commit;
