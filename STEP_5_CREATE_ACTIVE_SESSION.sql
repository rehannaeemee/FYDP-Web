-- FYDP Evaluation System
-- Step 5: Create FYDP-2023, add the approved assessment weightages,
-- and activate the session only after the active weightages total 100%.
-- Run this file once in Supabase Dashboard -> SQL Editor -> New query.

begin;

-- Only one academic session may be active at a time.
update public.academic_sessions
set is_active = false,
    updated_at = now()
where is_active = true
  and name <> 'FYDP-2023';

insert into public.academic_sessions (
  name,
  is_active,
  results_published,
  published_at
)
values (
  'FYDP-2023',
  false,
  false,
  null
)
on conflict (name) do update
set
  is_active = false,
  updated_at = now();

insert into public.assessments (
  session_id,
  name,
  weightage,
  rubric_total,
  sort_order,
  is_active
)
select
  session_record.id,
  assessment_data.name,
  assessment_data.weightage,
  100,
  assessment_data.sort_order,
  true
from public.academic_sessions as session_record
cross join (
  values
    ('Synopsis Presentation', 12.50::numeric, 1),
    ('Synopsis Document',     12.50::numeric, 2),
    ('Progress Presentation', 25.00::numeric, 3),
    ('Final Presentation',    15.00::numeric, 4),
    ('Poster',                 5.00::numeric, 5),
    ('Thesis',                20.00::numeric, 6),
    ('External Evaluation',   10.00::numeric, 7)
) as assessment_data(name, weightage, sort_order)
where session_record.name = 'FYDP-2023'
on conflict (session_id, name) do update
set
  weightage = excluded.weightage,
  rubric_total = excluded.rubric_total,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- The activation trigger now sees a complete 100% assessment structure.
update public.academic_sessions
set is_active = true,
    updated_at = now()
where name = 'FYDP-2023';

commit;

select
  session_record.name as session_name,
  session_record.is_active,
  sum(assessment.weightage) as active_weightage_total,
  count(*) as active_assessment_count
from public.academic_sessions as session_record
join public.assessments as assessment
  on assessment.session_id = session_record.id
 and assessment.is_active = true
where session_record.name = 'FYDP-2023'
group by session_record.id, session_record.name, session_record.is_active;
