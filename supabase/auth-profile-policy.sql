-- Run this if you already ran schema.sql before the insert policy was added.

create policy "users can insert their profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

