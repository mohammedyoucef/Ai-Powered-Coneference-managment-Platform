-- Atomic creation functions for organizations and conferences.
-- These functions perform the related writes as the authenticated user,
-- while keeping the first-owner flow out of client-managed RLS operations.

create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_description text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_organization public.organizations;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(p_name), '') is null or nullif(trim(p_slug), '') is null then
    raise exception 'Organization name and slug are required';
  end if;

  insert into public.organizations (name, slug, description, created_by)
  values (trim(p_name), trim(p_slug), p_description, current_user_id)
  returning * into new_organization;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization.id, current_user_id, 'owner');

  return new_organization;
exception
  when unique_violation then
    raise exception 'An organization with this slug already exists';
end;
$$;

revoke all on function public.create_organization(text, text, text) from public;
grant execute on function public.create_organization(text, text, text) to authenticated;

create or replace function public.create_conference(
  p_organization_id uuid,
  p_title text,
  p_slug text,
  p_description text default null,
  p_status text default 'draft',
  p_visibility text default 'private'
)
returns public.conferences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_conference public.conferences;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.organization_members
    where organization_id = p_organization_id
      and user_id = current_user_id
      and role in ('owner', 'admin')
  ) then
    raise exception 'Not authorized';
  end if;

  if exists (
    select 1 from public.conferences where organization_id = p_organization_id
  ) then
    raise exception 'This organization already has a conference (limit: 1 per organization)';
  end if;

  insert into public.conferences (
    organization_id, title, slug, description, status, visibility, created_by
  )
  values (
    p_organization_id, trim(p_title), trim(p_slug), p_description, p_status, p_visibility, current_user_id
  )
  returning * into new_conference;

  return new_conference;
exception
  when unique_violation then
    raise exception 'A conference with this slug already exists';
end;
$$;

revoke all on function public.create_conference(uuid, text, text, text, text, text) from public;
grant execute on function public.create_conference(uuid, text, text, text, text, text) to authenticated;
