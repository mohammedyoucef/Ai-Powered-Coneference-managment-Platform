# Confexa business logic

One platform, four primary account types, connected through real
Organizations → Events → Applications / Submissions → Reviews → Decisions,
Payments (where configured), and Notifications. All rules below are enforced
in API routes against PostgreSQL — never only in the UI.

## Role matrix

| | Organizer | Reviewer | Researcher | Visitor |
|---|---|---|---|---|
| **Dashboard** | Orgs, events by lifecycle, new visitor applications, submissions, outstanding reviews, deadlines, activity | Pending invitations, event applications, active assignments, pending/completed reviews, deadlines | Totals by status, under review, accepted/rejected, revision requests, decisions, deadlines, searchable submissions table | Pending/approved/waitlisted applications, upcoming events, payment status, notifications |
| **Can** | Create orgs & events; configure visibility, fees, submissions, registration, reviewer mode; publish/unpublish/archive via lifecycle; invite reviewers by email; approve reviewer applications; assign papers; decide & release; review visitor applications; run AI screening; announce | Apply to review eligible events; accept/decline invitations; access **assigned** papers only; download assigned files; save draft reviews; submit reviews | Create profile; browse public events; submit papers (deadline + file rules server-enforced); track status; see feedback only after release; upload revisions & camera-ready when permitted | Browse public events; apply to attend; answer eligibility questions; upload documents; track application/payment/admission; cancel own application |
| **Cannot** | Submit papers as a researcher, review as an assigned reviewer (needs a Reviewer account), register as attendee | Create orgs/events; submit papers; see unassigned papers or others' confidential reviews; decide | Create orgs/events; use review tools; see others' papers; see feedback before release | Create orgs/events; submit papers; access submissions, files, or review tools |
| **Data** | `organizations`, `organization_members`, `conferences`, `website_configs`, `event_announcements` | `reviewer_applications`, `reviewer_invitations`, `review_assignments`, `reviews` | `submissions`, `submission_files`, `reviews` (released), `notifications` | `visitor_applications`, `payments`, `ai_screenings` (organizer-only), `notifications` |

The primary account type is chosen at registration and is **fixed**:
`PATCH /api/auth/me` rejects type changes, so permissions cannot be gained by
editing a payload. Organization membership (owner/admin/member) is a second,
separate layer: managing an event additionally requires being an owner/admin
of its organization.

## Key workflows

- **Reviewer onboarding (two gates).** Gate 1 (event level): an approved
  `reviewer_applications` row *or* an accepted `reviewer_invitations` row for
  that event. Inviting by email validates format → account exists → account
  type is Reviewer (404 explains "must register as a Reviewer first", 400 if
  another type) and prevents duplicates. Gate 2 (paper level):
  `review_assignments` — only then can the reviewer open/download/review the
  paper. Assignments to non-reviewers, self-review, and duplicates are
  rejected.
- **Papers.** `Submitted → Under Review → Revision Requested → Revised
  Submitted → Under Review → Accepted / Rejected` (+ camera-ready states).
  Reviews have drafts (`status=draft`, one per assignment) that do not
  complete the assignment. Recommendations never auto-decide; only an
  organizer records and releases the decision. Authors see reviews only after
  release; confidential comments and (double-blind) reviewer identities are
  stripped server-side.
- **Visitors.** `draft → pending_payment → pending_review → approved /
  rejected / waitlisted / cancelled`. Payment state is separate from
  admission; approving an unpaid paid-registration is rejected.
- **AI eligibility screening** stores a structured assessment
  (criteria evaluated, evidence quoted from the applicant's own answers,
  missing information, concerns, recommendation) linked to the application.
  It never changes the application status. Without a model key the labeled
  deterministic fallback runs and says AI was unavailable; document contents
  are reported as not analyzed unless actually extracted.
- **Payments.** No payment provider SDK is bundled. Without
  `PAYMENT_PROVIDER` + `PAYMENT_PROVIDER_SECRET` (or `STRIPE_SECRET_KEY`)
  payments stay `unconfigured`, the payment endpoint returns 503, and nothing
  is ever marked paid. A real deployment must confirm payment via signed
  provider webhooks before setting `payment_status='succeeded'`. No card data
  is ever accepted or stored.
- **Private events** never appear in `/api/events` or bootstrap for
  non-participants. Access is granted by organization membership, an
  `event_invitations` row (visitor/researcher, issued by email), a reviewer
  invitation/application, a submission, or a visitor application.

## Scenario coverage

`scripts/e2e-business.mjs` verifies A–G end to end over HTTP with four
separate accounts (registration gates, publish visibility, reviewer
application/invitation rules, submission, blind feedback release, revision
round-trip, visitor screening + decision, private-event invitations, and
cross-role denials):

```bash
npm run db:migrate
npm run build && npm run start        # or npm run dev
BASE_URL=http://localhost:3000 node scripts/e2e-business.mjs
```

## Schema

`db/migrations/003_business_logic.sql` (idempotent) adds: `users.profile`,
expanded account types, conference configuration columns (submissions /
registration / fees / eligibility / reviewer mode / deadlines),
`submission_files`, `reviewer_applications`, `reviewer_invitations`,
`event_invitations`, `visitor_applications`, `payments`, `ai_screenings`,
`event_announcements`, and the revision submission states.

## Environment

Same as README (PostgreSQL via `DATABASE_URL`). Optional: `MODEL_API_KEY`
(Meta AI), `SMTP_HOST` (email; otherwise notifications are in-app only and
labeled `not_configured`), `PAYMENT_PROVIDER` + `PAYMENT_PROVIDER_SECRET`
(payment state only — a checkout integration is still required to collect
money; see above).
