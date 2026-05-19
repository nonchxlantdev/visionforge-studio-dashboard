-- Vision Forge Studio starter schema
-- Run this in the Supabase SQL editor after creating the project.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legal_name text,
  display_name text,
  email text,
  phone text,
  work_phone text,
  gender text,
  dob date,
  home_address text,
  photo_url text,
  role text not null default 'User',
  status text not null default 'Active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid references public.groups(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  primary key (group_id, profile_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'active',
  start_date date,
  deadline date,
  color text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  type text,
  description text,
  status text not null default 'not-started',
  priority text not null default 'Medium',
  deadline date,
  attachments jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_assignees (
  task_id uuid references public.tasks(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  primary key (task_id, profile_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  detail text,
  target_type text,
  target_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;

-- Development-friendly policies. Tighten these before production launch.
create policy "authenticated can read profiles" on public.profiles for select to authenticated using (true);
create policy "users can insert their profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "users can update their profile" on public.profiles for update to authenticated using (auth.uid() = id);

create policy "authenticated can manage groups" on public.groups for all to authenticated using (true) with check (true);
create policy "authenticated can manage group members" on public.group_members for all to authenticated using (true) with check (true);
create policy "authenticated can manage projects" on public.projects for all to authenticated using (true) with check (true);
create policy "authenticated can manage tasks" on public.tasks for all to authenticated using (true) with check (true);
create policy "authenticated can manage assignees" on public.task_assignees for all to authenticated using (true) with check (true);
create policy "authenticated can manage comments" on public.comments for all to authenticated using (true) with check (true);
create policy "users can read their notifications" on public.notifications for select to authenticated using (profile_id = auth.uid());
create policy "users can update their notifications" on public.notifications for update to authenticated using (profile_id = auth.uid());
