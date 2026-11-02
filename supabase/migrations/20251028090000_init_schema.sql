-- Confexa initial schema and RLS
-- Apply with Supabase CLI or SQL Editor

-- Extensions
create extension if not exists "pgcrypto";

-- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer
set search_path = public, pg_temp;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- organizations
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
  before update on public.organizations
  for each row execute procedure public.set_updated_at();

create index if not exists idx_organizations_slug on public.organizations(slug);

-- organization_members
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists idx_organization_members_user_id on public.organization_members(user_id);
create index if not exists idx_organization_members_org_id on public.organization_members(organization_id);

-- conferences
create table if not exists public.conferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  slug text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','published')),
  visibility text not null default 'private' check (visibility in ('public','unlisted','private')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, slug)
);

drop trigger if exists set_conferences_updated_at on public.conferences;
create trigger set_conferences_updated_at
  before update on public.conferences
  for each row execute procedure public.set_updated_at();

create index if not exists idx_conferences_org_id on public.conferences(organization_id);
create index if not exists idx_conferences_slug on public.conferences(slug);

-- Profile creation safety: only allow insert for self via trigger; block direct arbitrary inserts where possible
-- Create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer
set search_path = public, pg_temp;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.conferences enable row level security;

-- Helper: check membership
create or replace function public.is_org_member(org_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid()
  );
$$ language sql stable security definer
set search_path = public, pg_temp;

create or replace function public.is_org_admin_or_owner(org_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid() and role in ('owner','admin')
  );
$$ language sql stable security definer
set search_path = public, pg_temp;

-- profiles policies
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- organizations policies
drop policy if exists "Members can view their organizations" on public.organizations;
create policy "Members can view their organizations" on public.organizations
  for select using (
    created_by = auth.uid()
    or public.is_org_member(id)
  );

drop policy if exists "Authenticated users can create organizations" on public.organizations;
create policy "Authenticated users can create organizations" on public.organizations
  for insert with check (auth.role() = 'authenticated' and created_by = auth.uid());

drop policy if exists "Owners/admins can update organizations" on public.organizations;
create policy "Owners/admins can update organizations" on public.organizations
  for update using (public.is_org_admin_or_owner(id));

-- organization_members policies
drop policy if exists "Members can view org members" on public.organization_members;
create policy "Members can view org members" on public.organization_members
  for select using (public.is_org_member(organization_id) or user_id = auth.uid());

drop policy if exists "Owners/admins can manage members" on public.organization_members;
create policy "Owners/admins can manage members" on public.organization_members
  for insert with check (public.is_org_admin_or_owner(organization_id) and role in ('owner','admin'));

drop policy if exists "Owners/admins can update members" on public.organization_members;
create policy "Owners/admins can update members" on public.organization_members
  for update using (public.is_org_admin_or_owner(organization_id));

drop policy if exists "Owners/admins can delete members" on public.organization_members;
create policy "Owners/admins can delete members" on public.organization_members
  for delete using (public.is_org_admin_or_owner(organization_id));

-- Prevent self-escalation: users cannot insert membership for themselves unless via controlled flow
-- (enforced by requiring is_org_admin_or_owner and role constraints; creation of first owner done via transaction in app)

-- conferences policies
drop policy if exists "Members can view org conferences" on public.conferences;
create policy "Members can view org conferences" on public.conferences
  for select using (public.is_org_member(organization_id));

drop policy if exists "Public can view published public conferences" on public.conferences;
create policy "Public can view published public conferences" on public.conferences
  for select using (status = 'published' and visibility = 'public');

drop policy if exists "Owners/admins can create conferences" on public.conferences;
create policy "Owners/admins can create conferences" on public.conferences
  for insert with check (public.is_org_admin_or_owner(organization_id) and created_by = auth.uid());

drop policy if exists "Owners/admins can update conferences" on public.conferences;
create policy "Owners/admins can update conferences" on public.conferences
  for update using (public.is_org_admin_or_owner(organization_id));

drop policy if exists "Owners/admins can delete conferences" on public.conferences;
create policy "Owners/admins can delete conferences" on public.conferences
  for delete using (public.is_org_admin_or_owner(organization_id));
