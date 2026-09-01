begin;

-- Machine High Row is a shared plate-loaded movement. Replace any same-named custom
-- entry with the canonical definition while leaving every associated log row intact.
with canonical as (
  select jsonb_build_object(
    'name','Machine High Row',
    'muscle','Back',
    'muscles',jsonb_build_array('Back'),
    'muscles2',jsonb_build_array('Biceps'),
    'type','Weighted',
    'barbell',true,
    'machine',true,
    'regions',jsonb_build_object(
      'Back',jsonb_build_array(
        jsonb_build_object('name','Lats','weight',0.45),
        jsonb_build_object('name','Mid/lower traps & rhomboids','weight',0.50),
        jsonb_build_object('name','Upper traps','weight',0.05)
      ),
      'Biceps',jsonb_build_array(
        jsonb_build_object('name','Long head','weight',0.30),
        jsonb_build_object('name','Short head','weight',0.30),
        jsonb_build_object('name','Brachialis','weight',0.25),
        jsonb_build_object('name','Brachioradialis','weight',0.15)
      )
    )
  ) as item
), rebuilt as (
  select s.user_id,
    coalesce((
      select jsonb_agg(e order by ord)
      from jsonb_array_elements(coalesce(s.value->'exercises','[]'::jsonb)) with ordinality q(e,ord)
      where lower(trim(e->>'name')) <> 'machine high row'
    ),'[]'::jsonb) || jsonb_build_array(c.item) as exercises
  from public.user_state s cross join canonical c
)
update public.user_state s
set value=jsonb_set(jsonb_set(s.value,'{exercises}',r.exercises,true),'{libraryV}','20'::jsonb,true),
    updated_at=clock_timestamp()
from rebuilt r
where r.user_id=s.user_id;

-- Dimi logged the plate load per side. The app stores the total added plate weight:
-- (45+25+10) x 2 = 160 lb and (45+45) x 2 = 180 lb.
update public.user_state s
set value=jsonb_set(s.value,'{log}',coalesce(s.value->'log','[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('id',1788300000001,'date','2026-09-01','exercise','Machine High Row','set',1,'weight',160,'reps',9,'effort','','notes',''),
      jsonb_build_object('id',1788300000002,'date','2026-09-01','exercise','Machine High Row','set',2,'weight',160,'reps',9,'effort','','notes',''),
      jsonb_build_object('id',1788300000003,'date','2026-09-01','exercise','Machine High Row','set',3,'weight',180,'reps',7,'effort','','notes','')
    ),true),
    updated_at=clock_timestamp()
where s.user_id=(select user_id from public.profiles where lower(username)='dimi')
  and not exists (
    select 1 from jsonb_array_elements(coalesce(s.value->'log','[]'::jsonb)) e
    where e->>'id' in ('1788300000001','1788300000002','1788300000003')
      or (e->>'date'='2026-09-01' and e->>'exercise'='Machine High Row' and e->>'set' in ('1','2','3'))
  );

commit;
