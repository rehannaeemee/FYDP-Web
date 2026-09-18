-- FYDP Evaluation System
-- Step 2: Core Supabase database schema and security policies
-- Run this entire file once in Supabase Dashboard -> SQL Editor -> New query.

begin;

create extension if not exists citext;

do $$ begin
  create type public.app_role as enum ('administrator', 'coordinator', 'evaluator');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.submission_mode as enum ('collective', 'separate');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.entry_mode as enum ('common', 'per_student', 'common_with_overrides');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.attendance_status as enum ('assigned', 'present', 'absent');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.submission_status as enum ('draft', 'submitted');
exception when duplicate_object then null;
end $$;

create table if not exists public.schema_versions (
  version integer primary key,
  applied_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email citext not null unique,
  full_name text not null,
  role public.app_role not null,
  approved boolean not null default false,
  password_login_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academic_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default false,
  results_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publication_time_consistency check (
    (results_published and published_at is not null)
    or (not results_published and published_at is null)
  )
);

create unique index if not exists one_active_academic_session
  on public.academic_sessions (is_active)
  where is_active;

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.academic_sessions(id) on delete restrict,
  name text not null,
  weightage numeric(5,2) not null check (weightage >= 0 and weightage <= 100),
  rubric_total integer not null check (rubric_total > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  opens_at timestamptz,
  deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, name),
  constraint valid_assessment_window check (
    opens_at is null or deadline is null or opens_at <= deadline
  )
);

create table if not exists public.rubric_versions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete restrict,
  version_number integer not null default 1 check (version_number > 0),
  total_max_marks integer not null check (total_max_marks > 0),
  is_finalized boolean not null default false,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assessment_id, version_number),
  constraint finalized_time_consistency check (
    (is_finalized and finalized_at is not null)
    or (not is_finalized and finalized_at is null)
  )
);

create table if not exists public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_version_id uuid not null references public.rubric_versions(id) on delete restrict,
  title text not null,
  description text,
  max_mark integer not null check (max_mark > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (rubric_version_id, title)
);

create table if not exists public.rubric_levels (
  id uuid primary key default gen_random_uuid(),
  criterion_id uuid not null references public.rubric_criteria(id) on delete restrict,
  label text not null,
  description text,
  minimum_mark integer not null check (minimum_mark >= 0),
  maximum_mark integer not null check (maximum_mark >= minimum_mark),
  suggested_mark integer not null,
  sort_order integer not null default 0,
  unique (criterion_id, label),
  constraint suggested_mark_in_range check (
    suggested_mark between minimum_mark and maximum_mark
  )
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.academic_sessions(id) on delete restrict,
  group_number text not null,
  project_title text not null,
  specialization text,
  supervisor_name text,
  co_supervisor_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, group_number)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  registration_number citext not null unique,
  student_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_assessments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  assessment_id uuid not null references public.assessments(id) on delete restrict,
  rubric_version_id uuid not null references public.rubric_versions(id) on delete restrict,
  submission_mode public.submission_mode,
  mode_confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, assessment_id),
  constraint submission_mode_confirmation check (
    (submission_mode is null and mode_confirmed_at is null)
    or (submission_mode is not null and mode_confirmed_at is not null)
  )
);

create table if not exists public.evaluator_assignments (
  id uuid primary key default gen_random_uuid(),
  group_assessment_id uuid not null references public.group_assessments(id) on delete restrict,
  evaluator_profile_id uuid not null references public.profiles(id) on delete restrict,
  attendance public.attendance_status not null default 'assigned',
  method_agreed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_assessment_id, evaluator_profile_id)
);

create table if not exists public.evaluation_submissions (
  id uuid primary key default gen_random_uuid(),
  group_assessment_id uuid not null references public.group_assessments(id) on delete restrict,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  entry_mode public.entry_mode not null,
  status public.submission_status not null default 'draft',
  submitted_at timestamptz,
  evaluator_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_assessment_id, submitted_by),
  constraint submitted_time_consistency check (
    (status = 'submitted' and submitted_at is not null)
    or (status = 'draft' and submitted_at is null)
  )
);

create table if not exists public.submission_scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.evaluation_submissions(id) on delete restrict,
  criterion_id uuid not null references public.rubric_criteria(id) on delete restrict,
  student_id uuid references public.students(id) on delete restrict,
  performance_level_id uuid references public.rubric_levels(id) on delete set null,
  score integer not null check (score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists one_common_score_per_criterion
  on public.submission_scores (submission_id, criterion_id)
  where student_id is null;

create unique index if not exists one_student_score_per_criterion
  on public.submission_scores (submission_id, criterion_id, student_id)
  where student_id is not null;

create table if not exists public.student_assessment_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.academic_sessions(id) on delete restrict,
  group_assessment_id uuid not null references public.group_assessments(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  raw_score numeric(8,2) not null check (raw_score >= 0),
  rubric_total integer not null check (rubric_total > 0),
  assessment_weightage numeric(5,2) not null check (assessment_weightage >= 0),
  weighted_contribution numeric(8,2) not null check (weighted_contribution >= 0),
  calculated_at timestamptz not null default now(),
  unique (group_assessment_id, student_id)
);

create table if not exists public.student_final_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.academic_sessions(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  final_overall_result numeric(8,2) not null check (final_overall_result >= 0),
  calculated_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.profiles
  where auth_user_id = auth.uid()
    and approved = true
  limit 1;
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where auth_user_id = auth.uid()
    and approved = true
  limit 1;
$$;

create or replace function public.is_administrator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'administrator', false);
$$;

create or replace function public.is_coordinator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'coordinator', false);
$$;

create or replace function public.is_evaluator_assigned(target_group_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.evaluator_assignments ea
    where ea.group_assessment_id = target_group_assessment
      and ea.evaluator_profile_id = public.current_profile_id()
  );
$$;

create or replace function public.can_access_group(target_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_administrator()
    or public.is_coordinator()
    or exists (
      select 1
      from public.group_assessments ga
      join public.evaluator_assignments ea
        on ea.group_assessment_id = ga.id
      where ga.group_id = target_group
        and ea.evaluator_profile_id = public.current_profile_id()
    );
$$;

create or replace function public.link_approved_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.profiles
  set auth_user_id = new.id,
      updated_at = now()
  where email = new.email
    and approved = true
    and auth_user_id is null;
  return new;
end;
$$;

create or replace function public.validate_rubric_finalization()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  criteria_total integer;
  assessment_total integer;
begin
  if new.is_finalized and not old.is_finalized then
    select coalesce(sum(max_mark), 0)
      into criteria_total
    from public.rubric_criteria
    where rubric_version_id = new.id
      and is_active = true;

    select rubric_total
      into assessment_total
    from public.assessments
    where id = new.assessment_id;

    if criteria_total <> new.total_max_marks
       or new.total_max_marks <> assessment_total then
      raise exception 'Rubric criteria total, rubric version total and assessment rubric total must match.';
    end if;

    new.finalized_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.validate_session_activation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_weightage numeric(7,2);
begin
  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    select coalesce(sum(weightage), 0)
      into active_weightage
    from public.assessments
    where session_id = new.id
      and is_active = true;

    if active_weightage <> 100 then
      raise exception 'Active assessment weightages must total exactly 100 before activating a session. Current total: %', active_weightage;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_published_session()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  session_published boolean;
  target_assessment_id uuid;
begin
  target_assessment_id := case when tg_op = 'DELETE' then old.id else new.id end;

  select s.results_published
    into session_published
  from public.assessments a
  join public.academic_sessions s on s.id = a.session_id
  where a.id = target_assessment_id;

  if session_published then
    raise exception 'Published-session assessment and rubric configuration is locked.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.validate_submission_score()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  criterion_max integer;
  level_min integer;
  level_max integer;
begin
  select max_mark into criterion_max
  from public.rubric_criteria
  where id = new.criterion_id;

  if criterion_max is null or new.score > criterion_max then
    raise exception 'Score must be between zero and the criterion maximum.';
  end if;

  if new.performance_level_id is not null then
    select minimum_mark, maximum_mark
      into level_min, level_max
    from public.rubric_levels
    where id = new.performance_level_id
      and criterion_id = new.criterion_id;

    if level_min is null or new.score not between level_min and level_max then
      raise exception 'Score must remain within the selected performance-level range.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_submitted_evaluation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'submitted' and not public.is_administrator() then
    raise exception 'Submitted evaluations are locked.';
  end if;

  if new.status = 'submitted' and old.status = 'draft' then
    new.submitted_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists link_profile_after_auth_signup on auth.users;
create trigger link_profile_after_auth_signup
after insert on auth.users
for each row execute function public.link_approved_profile();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists sessions_updated_at on public.academic_sessions;
create trigger sessions_updated_at before update on public.academic_sessions
for each row execute function public.set_updated_at();

drop trigger if exists assessments_updated_at on public.assessments;
create trigger assessments_updated_at before update on public.assessments
for each row execute function public.set_updated_at();

drop trigger if exists groups_updated_at on public.groups;
create trigger groups_updated_at before update on public.groups
for each row execute function public.set_updated_at();

drop trigger if exists students_updated_at on public.students;
create trigger students_updated_at before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists group_assessments_updated_at on public.group_assessments;
create trigger group_assessments_updated_at before update on public.group_assessments
for each row execute function public.set_updated_at();

drop trigger if exists assignments_updated_at on public.evaluator_assignments;
create trigger assignments_updated_at before update on public.evaluator_assignments
for each row execute function public.set_updated_at();

drop trigger if exists submissions_updated_at on public.evaluation_submissions;
create trigger submissions_updated_at before update on public.evaluation_submissions
for each row execute function public.set_updated_at();

drop trigger if exists scores_updated_at on public.submission_scores;
create trigger scores_updated_at before update on public.submission_scores
for each row execute function public.set_updated_at();

drop trigger if exists validate_rubric_before_finalizing on public.rubric_versions;
create trigger validate_rubric_before_finalizing
before update of is_finalized on public.rubric_versions
for each row execute function public.validate_rubric_finalization();

drop trigger if exists validate_session_before_activation on public.academic_sessions;
create trigger validate_session_before_activation
before insert or update of is_active on public.academic_sessions
for each row execute function public.validate_session_activation();

drop trigger if exists lock_published_assessments on public.assessments;
create trigger lock_published_assessments
before update or delete on public.assessments
for each row execute function public.protect_published_session();

drop trigger if exists validate_score_range on public.submission_scores;
create trigger validate_score_range
before insert or update on public.submission_scores
for each row execute function public.validate_submission_score();

drop trigger if exists lock_submitted_evaluations on public.evaluation_submissions;
create trigger lock_submitted_evaluations
before update on public.evaluation_submissions
for each row execute function public.protect_submitted_evaluation();

alter table public.profiles enable row level security;
alter table public.schema_versions enable row level security;
alter table public.academic_sessions enable row level security;
alter table public.assessments enable row level security;
alter table public.rubric_versions enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.rubric_levels enable row level security;
alter table public.groups enable row level security;
alter table public.students enable row level security;
alter table public.group_assessments enable row level security;
alter table public.evaluator_assignments enable row level security;
alter table public.evaluation_submissions enable row level security;
alter table public.submission_scores enable row level security;
alter table public.student_assessment_results enable row level security;
alter table public.student_final_results enable row level security;

drop policy if exists schema_versions_admin_only on public.schema_versions;
create policy schema_versions_admin_only on public.schema_versions
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_admin on public.profiles
for select to authenticated
using (auth_user_id = auth.uid() or public.is_administrator());

drop policy if exists profiles_admin_manage on public.profiles;
create policy profiles_admin_manage on public.profiles
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists sessions_authenticated_read on public.academic_sessions;
create policy sessions_authenticated_read on public.academic_sessions
for select to authenticated using (true);

drop policy if exists sessions_admin_manage on public.academic_sessions;
create policy sessions_admin_manage on public.academic_sessions
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists assessments_authenticated_read on public.assessments;
create policy assessments_authenticated_read on public.assessments
for select to authenticated using (true);

drop policy if exists assessments_admin_manage on public.assessments;
create policy assessments_admin_manage on public.assessments
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists rubric_versions_authenticated_read on public.rubric_versions;
create policy rubric_versions_authenticated_read on public.rubric_versions
for select to authenticated using (true);

drop policy if exists rubric_versions_admin_manage on public.rubric_versions;
create policy rubric_versions_admin_manage on public.rubric_versions
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists rubric_criteria_authenticated_read on public.rubric_criteria;
create policy rubric_criteria_authenticated_read on public.rubric_criteria
for select to authenticated using (true);

drop policy if exists rubric_criteria_admin_manage on public.rubric_criteria;
create policy rubric_criteria_admin_manage on public.rubric_criteria
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists rubric_levels_authenticated_read on public.rubric_levels;
create policy rubric_levels_authenticated_read on public.rubric_levels
for select to authenticated using (true);

drop policy if exists rubric_levels_admin_manage on public.rubric_levels;
create policy rubric_levels_admin_manage on public.rubric_levels
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists groups_authorized_read on public.groups;
create policy groups_authorized_read on public.groups
for select to authenticated
using (public.can_access_group(id));

drop policy if exists groups_admin_manage on public.groups;
create policy groups_admin_manage on public.groups
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists students_authorized_read on public.students;
create policy students_authorized_read on public.students
for select to authenticated
using (public.can_access_group(group_id));

drop policy if exists students_admin_manage on public.students;
create policy students_admin_manage on public.students
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists group_assessments_authorized_read on public.group_assessments;
create policy group_assessments_authorized_read on public.group_assessments
for select to authenticated
using (
  public.is_administrator()
  or public.is_coordinator()
  or public.is_evaluator_assigned(id)
);

drop policy if exists group_assessments_admin_manage on public.group_assessments;
create policy group_assessments_admin_manage on public.group_assessments
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists assignments_authorized_read on public.evaluator_assignments;
create policy assignments_authorized_read on public.evaluator_assignments
for select to authenticated
using (
  public.is_administrator()
  or public.is_coordinator()
  or public.is_evaluator_assigned(group_assessment_id)
);

drop policy if exists assignments_panel_update on public.evaluator_assignments;
create policy assignments_panel_update on public.evaluator_assignments
for update to authenticated
using (public.is_evaluator_assigned(group_assessment_id) or public.is_administrator())
with check (public.is_evaluator_assigned(group_assessment_id) or public.is_administrator());

drop policy if exists assignments_admin_insert_delete on public.evaluator_assignments;
create policy assignments_admin_insert_delete on public.evaluator_assignments
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists submissions_authorized_read on public.evaluation_submissions;
create policy submissions_authorized_read on public.evaluation_submissions
for select to authenticated
using (
  public.is_administrator()
  or submitted_by = public.current_profile_id()
);

drop policy if exists submissions_evaluator_insert on public.evaluation_submissions;
create policy submissions_evaluator_insert on public.evaluation_submissions
for insert to authenticated
with check (
  submitted_by = public.current_profile_id()
  and public.is_evaluator_assigned(group_assessment_id)
);

drop policy if exists submissions_evaluator_update on public.evaluation_submissions;
create policy submissions_evaluator_update on public.evaluation_submissions
for update to authenticated
using (
  submitted_by = public.current_profile_id()
  and status = 'draft'
)
with check (submitted_by = public.current_profile_id());

drop policy if exists submissions_admin_manage on public.evaluation_submissions;
create policy submissions_admin_manage on public.evaluation_submissions
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists scores_authorized_read on public.submission_scores;
create policy scores_authorized_read on public.submission_scores
for select to authenticated
using (
  public.is_administrator()
  or exists (
    select 1
    from public.evaluation_submissions es
    where es.id = submission_id
      and es.submitted_by = public.current_profile_id()
  )
);

drop policy if exists scores_evaluator_insert on public.submission_scores;
create policy scores_evaluator_insert on public.submission_scores
for insert to authenticated
with check (
  exists (
    select 1
    from public.evaluation_submissions es
    where es.id = submission_id
      and es.submitted_by = public.current_profile_id()
      and es.status = 'draft'
  )
);

drop policy if exists scores_evaluator_update_delete on public.submission_scores;
create policy scores_evaluator_update_delete on public.submission_scores
for all to authenticated
using (
  public.is_administrator()
  or exists (
    select 1
    from public.evaluation_submissions es
    where es.id = submission_id
      and es.submitted_by = public.current_profile_id()
      and es.status = 'draft'
  )
)
with check (
  public.is_administrator()
  or exists (
    select 1
    from public.evaluation_submissions es
    where es.id = submission_id
      and es.submitted_by = public.current_profile_id()
      and es.status = 'draft'
  )
);

drop policy if exists assessment_results_admin_only on public.student_assessment_results;
create policy assessment_results_admin_only on public.student_assessment_results
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

drop policy if exists final_results_admin_only on public.student_final_results;
create policy final_results_admin_only on public.student_final_results
for all to authenticated
using (public.is_administrator())
with check (public.is_administrator());

create or replace view public.public_results
with (security_barrier = true)
as
select
  se.name as academic_session,
  st.student_name,
  st.registration_number,
  g.group_number,
  g.project_title,
  a.name as assessment_name,
  ar.raw_score,
  ar.rubric_total,
  ar.assessment_weightage,
  ar.weighted_contribution,
  fr.final_overall_result
from public.student_assessment_results ar
join public.academic_sessions se on se.id = ar.session_id
join public.students st on st.id = ar.student_id
join public.groups g on g.id = st.group_id
join public.group_assessments ga on ga.id = ar.group_assessment_id
join public.assessments a on a.id = ga.assessment_id
join public.student_final_results fr
  on fr.session_id = ar.session_id
 and fr.student_id = ar.student_id
where se.results_published = true;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on public.public_results from public, anon, authenticated;
grant select on public.public_results to anon, authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_administrator() to authenticated;
grant execute on function public.is_coordinator() to authenticated;
grant execute on function public.is_evaluator_assigned(uuid) to authenticated;
grant execute on function public.can_access_group(uuid) to authenticated;

insert into public.schema_versions (version)
values (1)
on conflict (version) do nothing;

commit;

select
  'FYDP Supabase schema installed successfully' as status,
  version,
  applied_at
from public.schema_versions
where version = 1;
