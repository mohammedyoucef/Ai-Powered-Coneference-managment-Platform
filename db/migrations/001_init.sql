-- Confexa PostgreSQL schema (001_init)
-- Apply with: npm run db:migrate   (requires DATABASE_URL)
-- Or paste into psql / your hosted Postgres (Supabase SQL editor works too).

create extension if not exists pgcrypto;

create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  affiliation text,
  bio text,
  platform_role text not null default 'user' check (platform_role in ('user','platform_admin')),
  account_type text not null default 'researcher' check (account_type in ('researcher','reviewer','organizer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_email_lower_idx on users (lower(email));

create table if not exists sessions (
  id text primary key,
  token_hash text not null unique,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);

create table if not exists password_resets (
  id text primary key,
  token_hash text not null unique,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text,
  type text,
  website_url text,
  contact_email text,
  logo_url text,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_members (
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists org_members_user_idx on organization_members(user_id);

create table if not exists invitations (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','admin','member')),
  token_hash text,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by text references users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invitations_email_idx on invitations(lower(email), status);

create table if not exists conferences (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  created_by text references users(id) on delete set null,
  title text not null,
  slug text not null,
  short_description text,
  full_description text,
  research_topics jsonb not null default '[]',
  start_date date,
  end_date date,
  submission_deadline date,
  camera_ready_deadline date,
  venue_or_format text,
  city text,
  country text,
  contact_email text,
  language text,
  submission_guidelines text,
  lifecycle text not null default 'draft' check (lifecycle in ('draft','published','cfp_open','submissions_open','under_review','decisions_released','camera_ready','completed')),
  category text,
  conference_type text,
  visibility text not null default 'public' check (visibility in ('public','private')),
  review_method text not null default 'double_blind' check (review_method in ('single_blind','double_blind')),
  review_criteria jsonb not null default '["Novelty","Technical quality","Clarity","Completeness"]',
  submission_types jsonb not null default '["Full paper"]',
  branding jsonb not null default '{}',
  wizard_step int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
create index if not exists conferences_org_idx on conferences(organization_id);
create index if not exists conferences_lifecycle_idx on conferences(lifecycle);

create table if not exists website_configs (
  conference_id text not null references conferences(id) on delete cascade,
  is_published boolean not null default false,
  config jsonb not null,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (conference_id, is_published)
);

create table if not exists submissions (
  id text primary key,
  conference_id text not null references conferences(id) on delete cascade,
  author_id text references users(id) on delete set null,
  title text not null,
  abstract text not null default '',
  authors jsonb not null default '[]',
  topics jsonb not null default '[]',
  submitted_by text not null default '',
  submission_type text,
  status text not null default 'Submitted' check (status in ('Submitted','Under Review','Accepted','Rejected','Camera-Ready Requested','Camera-Ready Submitted')),
  file_name text not null default '',
  file_size bigint not null default 0,
  file_path text,
  file_mime text,
  camera_file_name text,
  camera_file_path text,
  page_count int,
  extracted_text text,
  extraction_note text,
  decision_note text,
  decision_released boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists submissions_conf_idx on submissions(conference_id);
create index if not exists submissions_author_idx on submissions(author_id);

create table if not exists review_assignments (
  id text primary key,
  submission_id text not null references submissions(id) on delete cascade,
  reviewer_id text not null references users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','completed','declined')),
  due_date date,
  created_at timestamptz not null default now(),
  unique (submission_id, reviewer_id)
);
create index if not exists assignments_reviewer_idx on review_assignments(reviewer_id);

create table if not exists reviews (
  id text primary key,
  submission_id text not null references submissions(id) on delete cascade,
  assignment_id text references review_assignments(id) on delete set null,
  reviewer_id text references users(id) on delete set null,
  reviewer_name text not null default '',
  overall_score int not null default 5 check (overall_score between 1 and 10),
  criteria_scores jsonb not null default '{}',
  recommendation text not null default 'Borderline',
  comments text not null default '',
  confidential_comments text,
  status text not null default 'submitted' check (status in ('draft','submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reviews_sub_idx on reviews(submission_id);

create table if not exists ai_reviews (
  id text primary key,
  submission_id text not null references submissions(id) on delete cascade,
  created_by text references users(id) on delete set null,
  payload jsonb not null,
  source text not null default 'fallback',
  model text,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  email_status text not null default 'not_configured' check (email_status in ('not_configured','queued','sent')),
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id, is_read);

create table if not exists activity_log (
  id text primary key,
  user_id text references users(id) on delete set null,
  organization_id text references organizations(id) on delete cascade,
  conference_id text references conferences(id) on delete cascade,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);
create index if not exists activity_conf_idx on activity_log(conference_id, created_at desc);
