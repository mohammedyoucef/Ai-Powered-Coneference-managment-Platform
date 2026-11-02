# Confexa

AI-powered academic conference management platform: real accounts, organizations & teams, a guided conference wizard, an AI conference-website builder, public published sites, PDF submissions, peer review (with double-blind support), decisions & camera-ready, notifications, and role-specific dashboards — all persisted in **PostgreSQL** with **server-side authorization**.

## Quick start

Requirements: Node.js 20+, PostgreSQL 14+ (or Docker).

```bash
npm install
docker compose up -d db          # local PostgreSQL 17 (or use your own DATABASE_URL)
cp .env.example .env.local       # set DATABASE_URL (see below)
npm run db:migrate               # applies db/migrations/*.sql
npm run dev                      # http://localhost:3000
```

`.env.local` (never commit it):

```
DATABASE_URL=postgres://confexa:confexa_dev_password@localhost:5432/confexa
DATABASE_SSL=false               # true for hosted Postgres that requires TLS
PLATFORM_ADMIN_EMAILS=           # optional; the FIRST registered user becomes platform admin
```

The first registered account becomes **Platform Administrator** (documented bootstrap; afterwards promote others from `/admin`, or list emails in `PLATFORM_ADMIN_EMAILS`). Without Docker, any PostgreSQL works — including a Supabase **Postgres connection string** (Project Settings → Database → Connection string) as `DATABASE_URL` with `DATABASE_SSL=true`. The legacy `supabase/migrations/*` SQL is the earlier Supabase experiment and is **not** used by the runtime; the supported schema is `db/migrations/001_init.sql`.

## Workflow

1. **Register / sign in** (`/register`, `/login`, password reset at `/forgot-password` — in non-production without SMTP the reset link is shown locally and explicitly labeled *not emailed*).
2. **Create an organization** and invite members by email (existing users join immediately; unknown emails create a pending invitation claimed automatically at registration). Roles: owner / admin / member.
3. **Create a conference** with the six-step wizard (basic info → dates & venue → branding → research scope → review configuration → review & create). The wizard auto-saves progress in your browser; the created conference is a server-side draft you can resume editing any time. AI can draft the fields from plain language.
4. **Generate the website with AI** (Meta model via your Profile key, `/api/ai/*`), edit sections/images, preview, and **publish** — the draft and the immutable published snapshot are separate rows in PostgreSQL; `/events/[slug]` renders the published snapshot for anyone.
5. **Move the lifecycle**: Draft → Published / Call for Papers → Submissions Open → Under Review → Decisions Released → Camera-Ready → Completed (organizer-controlled, validated transitions).
6. **Authors submit PDFs** (≤10 MB, `%PDF` validated, stored server-side under `CONFEXA_UPLOAD_DIR`/`data/uploads/`, never publicly served — downloads go through an authorized route). Deadlines and lifecycle are enforced on the server.
7. **Assign reviewers** by registered email, track progress, reviewers submit criteria-based reviews (double-blind anonymizes authors for reviewers), organizers record & release decisions, authors upload camera-ready versions.
8. **Notifications** are in-app (PostgreSQL). Email is only sent when `SMTP_HOST` is configured; otherwise notifications are honestly labeled `not_configured` and nothing claims to have been emailed.

## Roles & permissions (enforced server-side)

- **Platform administrator** — `/admin`: platform counts, user/organization/conference overview, promote/demote admins. Separation: platform admins are not automatically organization content editors except for oversight access granted in code paths that call `requirePlatformAdmin`.
- **Organization owner/admin** — manage the org, members, conferences, website publishing, submissions, assignments, and decisions.
- **Organization member** — can view org conferences; management actions require owner/admin.
- **Organizer account** — the only primary type that can create organizations/events. Event management additionally requires org owner/admin.
- **Reviewer account** — applies to events or accepts per-event invitations; sees only assigned papers (anonymized under double-blind) and submits draft/submitted reviews for them. Applying never grants paper access by itself.
- **Researcher account** — submits papers, tracks status, sees reviews/decisions only after release, uploads revisions and camera-ready versions when permitted.
- **Visitor account** — applies to attend events (documents, eligibility answers), tracks application/payment/admission separately, and cannot access submissions or review tools.

Primary account types are fixed at registration and enforced by every API route; changing type via a profile payload is rejected.

Every API route checks the PostgreSQL session (httpOnly cookie; only a SHA-256 hash of the session token is stored) and membership/assignment in SQL. Hiding UI elements is never used as security. Passwords are hashed with scrypt; reset tokens are single-use, hashed, and expire in 1 hour.

## AI

- Provider in `src/lib/ai/provider.ts`, used only by server routes (`/api/ai/*`, all requiring sign-in). Bring your own Meta key on the **Profile** page (model `muse-wonder-1.0`, `https://api.meta.ai/v1/responses`), or set `MODEL_API_KEY`. Keys are never stored server-side.
- All model output is validated with Zod; facts are locked to the conference record; the AI never invents speakers/sponsors/statistics. Without a key (or on Meta failure), a deterministic fallback runs and is **labeled** as such everywhere.
- The **AI reviewer** is advisory: score + feedback, never decides. Human reviewers can import it as an editable starting point; AI image generation failures surface Meta's real error and fall back to labeled stock photos.
- Uploaded/AI section images are still kept in browser IndexedDB by the website editor (media IDs inside the saved config); stock/AI-generated remote URLs render anywhere. This is a known limitation, documented rather than hidden.

## Development

```bash
npm run lint
npm run typecheck
npm run build
npm run start
```

Data model (`db/migrations/001_init.sql` + `003_business_logic.sql`): `users` (primary account type: organizer / reviewer / researcher / **visitor**, per-type `profile`), `sessions`, `password_resets`, `organizations`, `organization_members`, `invitations`, `conferences` (independent visibility, submissions, registration/fee, eligibility, and reviewer-mode configuration), `website_configs` (draft + published snapshot), `submissions`, `submission_files`, `review_assignments`, `reviews`, `ai_reviews`, `reviewer_applications`, `reviewer_invitations`, `event_invitations`, `visitor_applications`, `payments`, `ai_screenings`, `event_announcements`, `notifications`, `activity_log` — with foreign keys, uniqueness (org slug, conference slug per org, one assignment per reviewer/paper, one application per person/event), and check constraints on lifecycle/review/application states.

**Business logic:** see `docs/BUSINESS_LOGIC.md` for the four-role permission matrix, workflow state machines, and payment/AI-screening honesty rules. End-to-end scenario verification (A–G): `BASE_URL=http://localhost:3000 node scripts/e2e-business.mjs` against a running app.

End-to-end coverage (register → org → conference → lifecycle → website publish → public visibility → submit → assignment → blind review → decision release → camera-ready → dashboards → unauthorized-access checks) was verified against a real PostgreSQL instance via API tests and browser checks.

## Migration from the old demo

The pre-production demo stored everything in `localStorage`/IndexedDB. That data is **not** auto-imported (it had no accounts or ownership); create an account and use **Create sample workspace** on the dashboard to seed an equivalent real workspace, or recreate your organization/conference — they will now persist server-side for every authorized user and device.
