-- Business logic for the four account types (003_business_logic)
-- Idempotent: safe on existing databases and on re-runs. Applied in order by
-- scripts/migrate.mjs and by ensureSchema() at runtime.

-- ---------- Users: visitor type + per-type profile ----------
alter table users add column if not exists profile jsonb not null default '{}';
alter table users add column if not exists terms_accepted_at timestamptz;

do $$
begin
  alter table users drop constraint if exists users_account_type_check;
exception when others then null;
end $$;
alter table users add constraint users_account_type_check
  check (account_type in ('organizer','reviewer','researcher','visitor'));

-- ---------- Conferences: independent configuration dimensions ----------
alter table conferences add column if not exists submissions_enabled boolean not null default true;
alter table conferences add column if not exists registration_enabled boolean not null default true;
alter table conferences add column if not exists registration_mode text not null default 'approval';
alter table conferences add column if not exists participation_fee_cents integer not null default 0;
alter table conferences add column if not exists fee_currency text not null default 'USD';
alter table conferences add column if not exists capacity integer;
alter table conferences add column if not exists registration_deadline date;
alter table conferences add column if not exists eligibility_criteria jsonb not null default '[]';
alter table conferences add column if not exists eligibility_questions jsonb not null default '[]';
alter table conferences add column if not exists required_documents jsonb not null default '[]';
alter table conferences add column if not exists reviewer_mode text not null default 'both';
alter table conferences add column if not exists review_deadline date;
alter table conferences add column if not exists max_file_size_mb integer not null default 10;

do $$
begin
  alter table conferences drop constraint if exists conferences_registration_mode_check;
  alter table conferences drop constraint if exists conferences_reviewer_mode_check;
exception when others then null;
end $$;
alter table conferences add constraint conferences_registration_mode_check
  check (registration_mode in ('auto','approval'));
alter table conferences add constraint conferences_reviewer_mode_check
  check (reviewer_mode in ('applications','invitations','both'));
do $$
begin
  alter table conferences drop constraint if exists conferences_fee_nonnegative;
exception when others then null;
end $$;
alter table conferences add constraint conferences_fee_nonnegative
  check (participation_fee_cents >= 0);

do $$
begin
  alter table conferences drop constraint if exists conferences_lifecycle_check;
exception when others then null;
end $$;
alter table conferences add constraint conferences_lifecycle_check
  check (lifecycle in ('draft','published','cfp_open','submissions_open','under_review','decisions_released','camera_ready','completed','archived'));

-- ---------- Submissions: revision lifecycle ----------
do $$
begin
  alter table submissions drop constraint if exists submissions_status_check;
exception when others then null;
end $$;
alter table submissions add constraint submissions_status_check
  check (status in ('Draft','Submitted','Under Review','Revision Requested','Revised Submitted','Accepted','Rejected','Camera-Ready Requested','Camera-Ready Submitted'));

create table if not exists submission_files (
  id text primary key,
  submission_id text not null references submissions(id) on delete cascade,
  kind text not null check (kind in ('manuscript','supplementary','revision','camera')),
  file_name text not null,
  file_path text,
  file_size bigint not null default 0,
  uploaded_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists submission_files_sub_idx on submission_files(submission_id);

-- One review per assignment (drafts upsert against it).
create unique index if not exists reviews_assignment_unique on reviews(assignment_id) where assignment_id is not null;

-- ---------- Reviewer event-level applications & invitations ----------
create table if not exists reviewer_applications (
  id text primary key,
  conference_id text not null references conferences(id) on delete cascade,
  reviewer_id text not null references users(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  decided_by text references users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conference_id, reviewer_id)
);
create index if not exists reviewer_apps_conf_idx on reviewer_applications(conference_id, status);
create index if not exists reviewer_apps_user_idx on reviewer_applications(reviewer_id);

create table if not exists reviewer_invitations (
  id text primary key,
  conference_id text not null references conferences(id) on delete cascade,
  reviewer_id text references users(id) on delete cascade,
  email text not null,
  status text not null default 'invited' check (status in ('invited','accepted','declined','revoked')),
  invited_by text references users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (conference_id, email)
);
create index if not exists reviewer_inv_user_idx on reviewer_invitations(reviewer_id, status);
create index if not exists reviewer_inv_email_idx on reviewer_invitations(lower(email), status);

-- ---------- Private-event access invitations (visitor / researcher) ----------
create table if not exists event_invitations (
  id text primary key,
  conference_id text not null references conferences(id) on delete cascade,
  email text not null,
  user_id text references users(id) on delete cascade,
  invited_role text not null check (invited_role in ('visitor','researcher')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (conference_id, email, invited_role)
);
create index if not exists event_inv_email_idx on event_invitations(lower(email), status);

-- ---------- Visitor applications, payments, AI screening ----------
create table if not exists visitor_applications (
  id text primary key,
  conference_id text not null references conferences(id) on delete cascade,
  visitor_id text not null references users(id) on delete cascade,
  status text not null default 'pending_review'
    check (status in ('draft','pending_payment','pending_review','approved','rejected','waitlisted','cancelled')),
  answers jsonb not null default '{}',
  document_name text,
  document_path text,
  document_size bigint not null default 0,
  payment_status text not null default 'not_required'
    check (payment_status in ('not_required','unconfigured','pending','succeeded','failed','refunded')),
  organizer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conference_id, visitor_id)
);
create index if not exists visitor_apps_conf_idx on visitor_applications(conference_id, status);
create index if not exists visitor_apps_user_idx on visitor_applications(visitor_id);

create table if not exists payments (
  id text primary key,
  visitor_application_id text not null references visitor_applications(id) on delete cascade,
  conference_id text not null references conferences(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded','unconfigured')),
  provider text,
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_app_idx on payments(visitor_application_id);

create table if not exists ai_screenings (
  id text primary key,
  visitor_application_id text not null references visitor_applications(id) on delete cascade,
  conference_id text not null references conferences(id) on delete cascade,
  created_by text references users(id) on delete set null,
  source text not null default 'fallback' check (source in ('meta','fallback','unavailable')),
  model text,
  recommendation text not null
    check (recommendation in ('appears_to_meet','additional_info_needed','may_not_meet','unable_to_determine')),
  assessment jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ai_screenings_app_idx on ai_screenings(visitor_application_id, created_at desc);

-- ---------- Event announcements ----------
create table if not exists event_announcements (
  id text primary key,
  conference_id text not null references conferences(id) on delete cascade,
  title text not null,
  body text,
  audience text not null default 'all' check (audience in ('all','visitors','researchers','reviewers')),
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_conf_idx on event_announcements(conference_id, created_at desc);
