-- Run this once if schema.sql was already applied before user deletion
-- references used ON DELETE SET NULL.

alter table public.projects
  drop constraint if exists projects_created_by_fkey,
  add constraint projects_created_by_fkey
    foreign key (created_by)
    references public.profiles(id)
    on delete set null;

alter table public.tasks
  drop constraint if exists tasks_created_by_fkey,
  add constraint tasks_created_by_fkey
    foreign key (created_by)
    references public.profiles(id)
    on delete set null;

alter table public.comments
  drop constraint if exists comments_profile_id_fkey,
  add constraint comments_profile_id_fkey
    foreign key (profile_id)
    references public.profiles(id)
    on delete set null;
