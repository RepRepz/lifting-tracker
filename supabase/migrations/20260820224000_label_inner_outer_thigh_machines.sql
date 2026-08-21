begin;

-- Keep the correct anatomical terms while making the direction unmissable in every
-- picker, history row, and chart. Dimi's supplied sets remain on the inner-thigh move.
with normalized as (
  select s.user_id,
    (select coalesce(jsonb_agg(
      case
        when lower(trim(e->>'exercise')) in ('inner thigh','inner thigh machine','hip adductor machine','adductor machine','seated hip adduction machine','hip adduction','hip adduction machine','hip adduction machine (inner thigh)')
          then jsonb_set(e,'{exercise}',to_jsonb('Hip Adduction Machine (Inner Thigh)'::text),true)
        when lower(trim(e->>'exercise')) in ('outer thigh','outer thigh machine','hip abductor machine','abductor machine','seated hip abduction machine','hip abduction','hip abduction machine','hip abduction machine (outer thigh)')
          then jsonb_set(e,'{exercise}',to_jsonb('Hip Abduction Machine (Outer Thigh)'::text),true)
        else e
      end order by ord
    ),'[]'::jsonb) from jsonb_array_elements(coalesce(s.value->'log','[]'::jsonb)) with ordinality q(e,ord)) as log,
    (select coalesce(jsonb_agg(e order by ord) filter (where lower(trim(e->>'name')) not in (
      'inner thigh','inner thigh machine','hip adductor machine','adductor machine','seated hip adduction machine','hip adduction','hip adduction machine','hip adduction machine (inner thigh)',
      'outer thigh','outer thigh machine','hip abductor machine','abductor machine','seated hip abduction machine','hip abduction','hip abduction machine','hip abduction machine (outer thigh)'
    )),'[]'::jsonb) from jsonb_array_elements(coalesce(s.value->'exercises','[]'::jsonb)) with ordinality q(e,ord)) as exercises
  from public.user_state s
), completed as (
  select n.user_id,n.log,n.exercises
    || jsonb_build_array(jsonb_build_object('name','Hip Adduction Machine (Inner Thigh)','muscle','Legs','muscles',jsonb_build_array('Legs'),'muscles2','[]'::jsonb,'type','Weighted','barbell',false,'machine',true))
    || jsonb_build_array(jsonb_build_object('name','Hip Abduction Machine (Outer Thigh)','muscle','Legs','muscles',jsonb_build_array('Legs'),'muscles2','[]'::jsonb,'type','Weighted','barbell',false,'machine',true)) as exercises
  from normalized n
)
update public.user_state s
set value=jsonb_set(jsonb_set(jsonb_set(s.value,'{log}',c.log,true),'{exercises}',c.exercises,true),'{libraryV}','15'::jsonb,true)
from completed c where c.user_id=s.user_id;

commit;
