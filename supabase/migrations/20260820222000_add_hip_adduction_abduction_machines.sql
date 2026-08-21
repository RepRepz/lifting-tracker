begin;

-- Canonical names used by equipment makers and exercise references:
-- adduction = thighs move inward; abduction = thighs move outward.
with normalized as (
  select s.user_id,
    (select coalesce(jsonb_agg(
      case
        when lower(trim(e->>'exercise')) in ('inner thigh','inner thigh machine','hip adductor machine','adductor machine','seated hip adduction machine','hip adduction')
          then jsonb_set(e,'{exercise}',to_jsonb('Hip Adduction Machine'::text),true)
        when lower(trim(e->>'exercise')) in ('outer thigh','outer thigh machine','hip abductor machine','abductor machine','seated hip abduction machine','hip abduction')
          then jsonb_set(e,'{exercise}',to_jsonb('Hip Abduction Machine'::text),true)
        else e
      end order by ord
    ),'[]'::jsonb) from jsonb_array_elements(coalesce(s.value->'log','[]'::jsonb)) with ordinality q(e,ord)) as log,
    (select coalesce(jsonb_agg(e order by ord) filter (where lower(trim(e->>'name')) not in (
      'inner thigh','inner thigh machine','hip adductor machine','adductor machine','seated hip adduction machine','hip adduction',
      'outer thigh','outer thigh machine','hip abductor machine','abductor machine','seated hip abduction machine','hip abduction'
    )),'[]'::jsonb) from jsonb_array_elements(coalesce(s.value->'exercises','[]'::jsonb)) with ordinality q(e,ord)) as exercises
  from public.user_state s
), completed as (
  select n.user_id,n.log,n.exercises
    || case when exists(select 1 from jsonb_array_elements(n.exercises) e where lower(e->>'name')='hip adduction machine') then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('name','Hip Adduction Machine','muscle','Legs','muscles',jsonb_build_array('Legs'),'muscles2','[]'::jsonb,'type','Weighted','barbell',false,'machine',true)) end
    || case when exists(select 1 from jsonb_array_elements(n.exercises) e where lower(e->>'name')='hip abduction machine') then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('name','Hip Abduction Machine','muscle','Legs','muscles',jsonb_build_array('Legs'),'muscles2','[]'::jsonb,'type','Weighted','barbell',false,'machine',true)) end as exercises
  from normalized n
)
update public.user_state s
set value=jsonb_set(jsonb_set(jsonb_set(s.value,'{log}',c.log,true),'{exercises}',c.exercises,true),'{libraryV}','14'::jsonb,true)
from completed c where c.user_id=s.user_id;

-- Dimi supplied this inner-thigh session in chat. Deterministic IDs and the exact
-- exercise/date/set check make the migration safe to re-run without duplicating it.
update public.user_state s
set value=jsonb_set(s.value,'{log}',coalesce(s.value->'log','[]'::jsonb) || jsonb_build_array(
  jsonb_build_object('id',1787256000001,'date','2026-08-20','exercise','Hip Adduction Machine','set',1,'weight',120,'reps',13,'effort','','notes',''),
  jsonb_build_object('id',1787256000002,'date','2026-08-20','exercise','Hip Adduction Machine','set',2,'weight',150,'reps',10,'effort','','notes',''),
  jsonb_build_object('id',1787256000003,'date','2026-08-20','exercise','Hip Adduction Machine','set',3,'weight',150,'reps',10,'effort','','notes','')
),true)
where s.user_id=(select user_id from public.profiles where lower(username)='dimi')
and not exists (
  select 1 from jsonb_array_elements(coalesce(s.value->'log','[]'::jsonb)) e
  where e->>'date'='2026-08-20' and e->>'exercise'='Hip Adduction Machine' and e->>'set' in ('1','2','3')
);

commit;
