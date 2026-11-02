-- Allow organization creator to become first owner
drop policy if exists "Creator can insert self as owner" on public.organization_members;
create policy "Creator can insert self as owner" on public.organization_members
  for insert with check (
    auth.role() = 'authenticated'
    and user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.created_by = auth.uid()
    )
    and not exists (
      select 1 from public.organization_members m
      where m.organization_id = organization_id
    )
  );

-- Allow users to view their own memberships (prevents recursion when discovering orgs)
drop policy if exists "Users can view their own memberships" on public.organization_members;
create policy "Users can view their own memberships" on public.organization_members
  for select using (user_id = auth.uid());
