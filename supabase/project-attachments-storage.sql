-- Run this once to support downloadable project attachments and photo thumbnails.

alter table public.projects
  add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-attachments',
  'project-attachments',
  false,
  52428800,
  array[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated can read project attachments" on storage.objects;
drop policy if exists "authenticated can upload project attachments" on storage.objects;
drop policy if exists "authenticated can update project attachments" on storage.objects;
drop policy if exists "authenticated can delete project attachments" on storage.objects;

create policy "authenticated can read project attachments"
on storage.objects
for select
to authenticated
using (bucket_id = 'project-attachments');

create policy "authenticated can upload project attachments"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'project-attachments');

create policy "authenticated can update project attachments"
on storage.objects
for update
to authenticated
using (bucket_id = 'project-attachments')
with check (bucket_id = 'project-attachments');

create policy "authenticated can delete project attachments"
on storage.objects
for delete
to authenticated
using (bucket_id = 'project-attachments');
