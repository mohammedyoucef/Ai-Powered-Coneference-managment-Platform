import { NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { requireUser, requireConferenceManager, requireAccountType, errorJson } from '@/lib/server/auth'
import { serializeConference } from '@/lib/server/serialize'

const FIELDS: [string, string][] = [
  ['title', 'title'], ['shortDescription', 'short_description'], ['fullDescription', 'full_description'],
  ['startDate', 'start_date'], ['endDate', 'end_date'], ['submissionDeadline', 'submission_deadline'], ['cameraReadyDeadline', 'camera_ready_deadline'],
  ['venueOrFormat', 'venue_or_format'], ['city', 'city'], ['country', 'country'], ['contactEmail', 'contact_email'],
  ['language', 'language'], ['submissionGuidelines', 'submission_guidelines'], ['category', 'category'], ['conferenceType', 'conference_type'],
  ['visibility', 'visibility'], ['reviewMethod', 'review_method'],
]

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    requireAccountType(user, ['organizer'], 'Only Organizer accounts can edit events.')
    await requireConferenceManager(user, id)
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    for (const [key, col] of FIELDS) {
      if (key in b) { sets.push(`${col}=$${i++}`); vals.push((b[key] as string) || null) }
    }
    if (Array.isArray(b.researchTopics)) { sets.push(`research_topics=$${i++}`); vals.push(JSON.stringify(b.researchTopics)) }
    if (Array.isArray(b.reviewCriteria)) { sets.push(`review_criteria=$${i++}`); vals.push(JSON.stringify(b.reviewCriteria)) }
    if (Array.isArray(b.submissionTypes)) { sets.push(`submission_types=$${i++}`); vals.push(JSON.stringify(b.submissionTypes)) }
    if (Array.isArray(b.eligibilityCriteria)) { sets.push(`eligibility_criteria=$${i++}`); vals.push(JSON.stringify(b.eligibilityCriteria)) }
    if (Array.isArray(b.eligibilityQuestions)) { sets.push(`eligibility_questions=$${i++}`); vals.push(JSON.stringify(b.eligibilityQuestions)) }
    if (Array.isArray(b.requiredDocuments)) { sets.push(`required_documents=$${i++}`); vals.push(JSON.stringify(b.requiredDocuments)) }
    if (typeof b.submissionsEnabled === 'boolean') { sets.push(`submissions_enabled=$${i++}`); vals.push(b.submissionsEnabled) }
    if (typeof b.registrationEnabled === 'boolean') { sets.push(`registration_enabled=$${i++}`); vals.push(b.registrationEnabled) }
    if (b.registrationMode === 'auto' || b.registrationMode === 'approval') { sets.push(`registration_mode=$${i++}`); vals.push(b.registrationMode) }
    if (typeof b.participationFeeCents === 'number' && b.participationFeeCents >= 0) { sets.push(`participation_fee_cents=$${i++}`); vals.push(Math.round(b.participationFeeCents)) }
    if (typeof b.feeCurrency === 'string' && b.feeCurrency) { sets.push(`fee_currency=$${i++}`); vals.push(b.feeCurrency.toUpperCase().slice(0, 8)) }
    if (typeof b.capacity === 'number' || b.capacity === null) { sets.push(`capacity=$${i++}`); vals.push(b.capacity) }
    if ('registrationDeadline' in b) { sets.push(`registration_deadline=$${i++}`); vals.push((b.registrationDeadline as string) || null) }
    if (b.reviewerMode === 'applications' || b.reviewerMode === 'invitations' || b.reviewerMode === 'both') { sets.push(`reviewer_mode=$${i++}`); vals.push(b.reviewerMode) }
    if ('reviewDeadline' in b) { sets.push(`review_deadline=$${i++}`); vals.push((b.reviewDeadline as string) || null) }
    if (typeof b.maxFileSizeMb === 'number') { sets.push(`max_file_size_mb=$${i++}`); vals.push(Math.min(50, Math.max(1, Math.round(b.maxFileSizeMb)))) }
    if (b.branding && typeof b.branding === 'object') { sets.push(`branding=$${i++}`); vals.push(JSON.stringify(b.branding)) }
    if (typeof b.wizardStep === 'number') { sets.push(`wizard_step=$${i++}`); vals.push(b.wizardStep) }
    if (sets.length === 0) return NextResponse.json({ error: 'No changes supplied.' }, { status: 400 })
    if (b.endDate && b.startDate && String(b.endDate) < String(b.startDate)) return NextResponse.json({ error: 'End date must be after the start date.' }, { status: 400 })
    vals.push(id)
    await query(`update conferences set ${sets.join(', ')}, updated_at=now() where id=$${i}`, vals)
    const row = (await query('select * from conferences where id=$1', [id]))[0]
    return NextResponse.json({ conference: serializeConference(row) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    requireAccountType(user, ['organizer'], 'Only Organizer accounts can delete events.')
    await requireConferenceManager(user, id)
    await query('delete from conferences where id=$1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
