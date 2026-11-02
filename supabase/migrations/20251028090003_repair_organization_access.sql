-- Repair organizations created before the atomic creation function existed.
-- An organization without its creator membership is invisible under RLS.

insert into public.organization_members (organization_id, user_id, role)
select o.id, o.created_by, 'owner'
from public.organizations o
where o.created_by is not null
  and not exists (
    select 1
    from public.organization_members m
    where m.organization_id = o.id
  )
on conflict (organization_id, user_id) do nothing;

-- Use distinct parameter names so the RLS helper cannot be confused with
-- table columns when policies evaluate membership.
create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin_or_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;
