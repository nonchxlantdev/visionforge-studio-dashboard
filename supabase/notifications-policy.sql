do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'authenticated can create notifications'
  ) then
    create policy "authenticated can create notifications"
    on public.notifications
    for insert
    to authenticated
    with check (true);
  end if;
end $$;
