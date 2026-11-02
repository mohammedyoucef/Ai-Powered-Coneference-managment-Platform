-- Repair organizations created before the atomic creation function was deployed.
-- This migration is separate from the original repair migration so it also
-- runs for projects that have already applied the earlier migrations.

insert into public.organization_members (organization_id, user_id, role)
select o.id, o.created_by, 'owner'
from public.organizations o
where o.created_by is not null
  and not exists (
    select 1
    from public.organization_members m
    where m.organization_id = o.id
      and m.user_id = o.created_by
  )
on conflict (organization_id, user_id) do nothing;
