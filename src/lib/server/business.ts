import { query, queryOne, notify } from './db'
import { HttpError, orgRole, isPlatformAdmin, type DbConference } from './auth'
import type { DbUser } from './db'

type Row = Record<string, unknown>

export const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' ? (() => { try { return (JSON.parse(v) as unknown[]).map(String) } catch { return [] } })() : []

export async function isConferenceManager(user: DbUser, conf: DbConference): Promise<boolean> {
  if (isPlatformAdmin(user)) return true
  const role = await orgRole(user, conf.organization_id)
  return role === 'owner' || role === 'admin'
}

export async function requireEventManager(user: DbUser, confId: string): Promise<DbConference & Row> {
  const conf = await queryOne<DbConference & Row>('select * from conferences where id=$1', [confId])
  if (!conf) throw new HttpError(404, 'Event not found.')
  if (!(await isConferenceManager(user, conf))) throw new HttpError(403, 'Only organizers managing this event can do this.')
  return conf
}

/** Reviewer accounts approved for an event (approved application or accepted invitation). */
export async function eligibleReviewerIds(confId: string): Promise<string[]> {
  const rows = await query<{ reviewer_id: string }>(
    `select distinct ra.reviewer_id as reviewer_id from reviewer_applications ra join users u on u.id=ra.reviewer_id
       where ra.conference_id=$1 and ra.status='approved' and u.account_type='reviewer'
     union
     select distinct ri.reviewer_id as reviewer_id from reviewer_invitations ri join users u on u.id=ri.reviewer_id
       where ri.conference_id=$1 and ri.status='accepted' and ri.reviewer_id is not null and u.account_type='reviewer'`,
    [confId],
  ).catch(() => [] as { reviewer_id: string }[])
  return rows.map((r) => String(r.reviewer_id))
}

const OPEN_PAPER_STATES = ['Submitted', 'Revised Submitted', 'Under Review']

/**
 * Assign all currently open papers of an event to a reviewer who just
 * became eligible (application approved / invitation accepted). Without
 * this, an approved reviewer saw an empty Review page until an organizer
 * manually assigned every paper one by one.
 */
export async function autoAssignOpenPapers(confId: string, reviewerId: string): Promise<number> {
  const conf = await queryOne<{ title: string; review_deadline: string | null }>('select title, review_deadline from conferences where id=$1', [confId]).catch(() => null)
  const papers = await query<{ id: string; title: string }>(
    `select id, title from submissions where conference_id=$1 and status = any($2::text[]) and decision_released=false and author_id<>$3
       and id not in (select submission_id from review_assignments where reviewer_id=$3)`,
    [confId, OPEN_PAPER_STATES, reviewerId],
  ).catch(() => [] as { id: string; title: string }[])
  for (const p of papers) {
    await query(
      `insert into review_assignments (id,submission_id,reviewer_id,due_date) values ($1,$2,$3,$4)
       on conflict (submission_id,reviewer_id) do nothing`,
      [`asg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`, p.id, reviewerId, conf?.review_deadline || null],
    ).catch(() => {})
  }
  if (papers.length > 0 && conf) {
    await notify(reviewerId, 'review_assignment', 'Papers assigned for review', `${papers.length} paper(s) from "${String(conf.title)}" are now in your Review page.`, '/review')
  }
  return papers.length
}

/** Assign a newly submitted paper to every reviewer approved for the event. */
export async function autoAssignPaper(confId: string, submissionId: string, title: string, authorId: string): Promise<number> {
  const reviewers = (await eligibleReviewerIds(confId)).filter((rid) => rid !== authorId)
  if (reviewers.length === 0) return 0
  const conf = await queryOne<{ review_deadline: string | null }>('select review_deadline from conferences where id=$1', [confId]).catch(() => null)
  let created = 0
  for (const rid of reviewers) {
    const res = await query(
      `insert into review_assignments (id,submission_id,reviewer_id,due_date) values ($1,$2,$3,$4)
       on conflict (submission_id,reviewer_id) do nothing returning id`,
      [`asg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`, submissionId, rid, conf?.review_deadline || null],
    ).catch(() => [] as unknown[])
    if (Array.isArray(res) && res.length > 0) {
      created += 1
      await notify(rid, 'review_assignment', 'New review assignment', `You were assigned to review "${title}". It is now in your Review page.`, '/review')
    }
  }
  if (created > 0) {
    await query("update submissions set status='Under Review', updated_at=now() where id=$1 and status in ('Submitted','Revised Submitted')", [submissionId]).catch(() => {})
  }
  return created
}

/** Where organizers manage an event's people (reviewer approvals live here). */
export async function participantsLink(confId: string): Promise<string> {
  const row = await queryOne<{ org_slug: string; conf_slug: string }>(
    'select o.slug as org_slug, c.slug as conf_slug from conferences c join organizations o on o.id=c.organization_id where c.id=$1',
    [confId],
  ).catch(() => null)
  return row ? `/organizations/${row.org_slug}/conferences/${row.conf_slug}/participants` : '/dashboard'
}

/** Organizers who manage the event's organization (notification recipients). */
export async function eventManagers(orgId: string): Promise<string[]> {
  const rows = await query<{ user_id: string }>("select user_id from organization_members where organization_id=$1 and role in ('owner','admin')", [orgId])
  return rows.map((r) => r.user_id)
}

/**
 * Event-level reviewer eligibility: an approved reviewer application OR an
 * accepted reviewer invitation for THIS event. Applying alone grants nothing;
 * a submission assignment additionally requires this eligibility.
 */
export async function isEventReviewer(confId: string, reviewerId: string): Promise<boolean> {
  const row = await queryOne(
    `select 1 as ok where
       exists (select 1 from reviewer_applications where conference_id=$1 and reviewer_id=$2 and status='approved')
       or exists (select 1 from reviewer_invitations where conference_id=$1 and reviewer_id=$2 and status='accepted')`,
    [confId, reviewerId],
  ).catch(() => null)
  return Boolean(row)
}

export function serializeVisitorApplication(r: Row) {
  return {
    id: String(r.id), conferenceId: String(r.conference_id), visitorId: String(r.visitor_id),
    visitorName: (r.visitor_name as string) || undefined, visitorEmail: (r.visitor_email as string) || undefined,
    conferenceTitle: (r.conference_title as string) || undefined,
    status: String(r.status) as 'draft' | 'pending_payment' | 'pending_review' | 'approved' | 'rejected' | 'waitlisted' | 'cancelled', answers: (r.answers && typeof r.answers === 'object' ? r.answers : {}) as Record<string, string>,
    documentName: (r.document_name as string) || undefined, documentAvailable: Boolean(r.document_path),
    paymentStatus: String(r.payment_status || 'not_required') as 'not_required' | 'unconfigured' | 'pending' | 'succeeded' | 'failed' | 'refunded', organizerNote: (r.organizer_note as string) || undefined,
    createdAt: r.created_at ? new Date(String(r.created_at)).toISOString() : new Date().toISOString(),
    updatedAt: r.updated_at ? new Date(String(r.updated_at)).toISOString() : new Date().toISOString(),
  }
}

export function serializeReviewerApplication(r: Row) {
  return {
    id: String(r.id), conferenceId: String(r.conference_id), reviewerId: String(r.reviewer_id),
    reviewerName: (r.reviewer_name as string) || undefined, reviewerEmail: (r.reviewer_email as string) || undefined,
    conferenceTitle: (r.conference_title as string) || undefined,
    message: (r.message as string) || undefined, status: String(r.status) as 'pending' | 'approved' | 'rejected' | 'withdrawn',
    createdAt: r.created_at ? new Date(String(r.created_at)).toISOString() : new Date().toISOString(),
  }
}

export function serializeReviewerInvitation(r: Row) {
  return {
    id: String(r.id), conferenceId: String(r.conference_id), reviewerId: (r.reviewer_id as string) || undefined,
    email: String(r.email), conferenceTitle: (r.conference_title as string) || undefined, status: String(r.status) as 'invited' | 'accepted' | 'declined' | 'revoked',
    createdAt: r.created_at ? new Date(String(r.created_at)).toISOString() : new Date().toISOString(),
  }
}

export type ScreeningAssessment = {
  criteriaEvaluated: { criterion: string; evidence: string | null; met: boolean | null }[]
  missingInformation: string[]
  concerns: string[]
  explanation: string
  note: string
}

/**
 * Deterministic, evidence-only eligibility screening used when no Meta model
 * key is configured (the provider's labeled fallback pattern). It only quotes
 * the applicant's own answers: a criterion counts as evidenced when one of its
 * content words appears in the answers. Nothing is invented; documents that
 * were not text-extracted are reported as not analyzed.
 */
export function screenApplication(args: {
  criteria: string[]
  questions: string[]
  answers: Record<string, string>
  documentName?: string | null
  hasDocument: boolean
  aiConfigured: boolean
}): { recommendation: 'appears_to_meet' | 'additional_info_needed' | 'may_not_meet' | 'unable_to_determine'; source: 'fallback' | 'unavailable'; assessment: ScreeningAssessment } {
  const { criteria, questions, answers, documentName, hasDocument, aiConfigured } = args
  const answerText = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n')
  const note = aiConfigured
    ? 'Deterministic criteria check (structured evidence extraction). The organizer makes the final decision.'
    : 'AI screening unavailable (no model key configured): this is a deterministic criteria/evidence check over the submitted answers only. The organizer makes the final decision.'
  if (criteria.length === 0) {
    return {
      recommendation: 'unable_to_determine', source: aiConfigured ? 'fallback' : 'unavailable',
      assessment: { criteriaEvaluated: [], missingInformation: ['The organizer has not configured eligibility criteria for this event.'], concerns: [], explanation: 'No eligibility criteria are configured, so eligibility cannot be assessed. Review the application manually.', note },
    }
  }
  const stop = new Set(['the', 'and', 'or', 'of', 'a', 'an', 'to', 'in', 'for', 'with', 'must', 'be', 'is', 'are', 'have', 'has', 'at', 'least'])
  const evaluated = criteria.map((criterion) => {
    const words = criterion.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !stop.has(w))
    const hit = words.find((w) => answerText.toLowerCase().includes(w))
    const evidenceLine = hit ? answerText.split('\n').find((l) => l.toLowerCase().includes(hit)) ?? null : null
    return { criterion, evidence: evidenceLine ? evidenceLine.slice(0, 300) : null, met: hit ? true : null }
  })
  const missing: string[] = []
  for (const q of questions) {
    if (!String(answers[q] ?? '').trim()) missing.push(`No answer to required question: "${q}"`)
  }
  const unevidenced = evaluated.filter((e) => !e.evidence).map((e) => e.criterion)
  if (unevidenced.length) missing.push(...unevidenced.map((c) => `No evidence found in the answers for criterion: "${c}"`))
  if (!hasDocument && documentName) missing.push('A supporting document was named but no file was stored.')
  const concerns: string[] = []
  if (!hasDocument) concerns.push('No supporting document was uploaded, so document contents were not analyzed.')
  const evidencedCount = evaluated.filter((e) => e.evidence).length
  let recommendation: 'appears_to_meet' | 'additional_info_needed' | 'may_not_meet' | 'unable_to_determine'
  if (missing.length === 0 && evidencedCount === evaluated.length) recommendation = 'appears_to_meet'
  else if (evidencedCount === 0 && questions.some((q) => !String(answers[q] ?? '').trim())) recommendation = 'may_not_meet'
  else if (evidencedCount === 0) recommendation = 'unable_to_determine'
  else recommendation = 'additional_info_needed'
  return {
    recommendation, source: aiConfigured ? 'fallback' : 'unavailable',
    assessment: {
      criteriaEvaluated: evaluated, missingInformation: missing, concerns,
      explanation: recommendation === 'appears_to_meet'
        ? 'Every configured criterion has matching evidence in the submitted answers. This is advisory only.'
        : `Evidence was found for ${evidencedCount} of ${evaluated.length} configured criteria. This is advisory only; the organizer decides.`,
      note,
    },
  }
}

export function paymentProviderConfigured(): boolean {
  // A real provider is only "configured" when its server credentials exist.
  // Without them payments stay in the honest `unconfigured` state.
  return Boolean(process.env.PAYMENT_PROVIDER && (process.env.PAYMENT_PROVIDER_SECRET || process.env.STRIPE_SECRET_KEY))
}
