-- FYDP Evaluation System
-- Step 3: Register the two approved Administrator profiles.
-- Run this file once in Supabase Dashboard -> SQL Editor -> New query.

insert into public.profiles (
  email,
  full_name,
  role,
  approved,
  password_login_allowed
)
values
  (
    'rehan.naeem.tahir@gmail.com',
    'Rehan Naeem',
    'administrator',
    true,
    false
  ),
  (
    'adeem.aslam@uet.edu.pk',
    'Adeem Aslam',
    'administrator',
    true,
    false
  )
on conflict (email) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  approved = true,
  password_login_allowed = false,
  updated_at = now();

select
  full_name,
  email,
  role,
  approved,
  case
    when auth_user_id is null then 'Ready for first OTP sign-in'
    else 'Linked to Supabase Auth'
  end as account_status
from public.profiles
where email in (
  'rehan.naeem.tahir@gmail.com',
  'adeem.aslam@uet.edu.pk'
)
order by full_name;
