-- Run this once to remove all Supabase users except the owner account.
-- Run supabase/user-delete-constraints.sql first if the database still has
-- profile foreign keys without ON DELETE SET NULL.

delete from auth.users
where lower(email) <> 'glenrickmspain@hotmail.com';

delete from public.profiles
where lower(email) <> 'glenrickmspain@hotmail.com';

update public.profiles
set
  legal_name = coalesce(nullif(legal_name, ''), 'Glenrick Spain'),
  display_name = coalesce(nullif(display_name, ''), 'Glenrick Spain'),
  role = 'Admin',
  status = 'Active'
where lower(email) = 'glenrickmspain@hotmail.com';
