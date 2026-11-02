import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, newId, notify, logActivity } from '@/lib/server/db'
import { requireUser, errorJson, HttpError } from '@/lib/server/auth'
import { isEventReviewer } from '@/lib/server/business'
import { access } from '../route'

const Schema = z.object({
  reviewerEmail: z.string().trim().email().optional(),
  reviewerId: z.string().optional(),
  dueDate: z.string().max(20).optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const sub = await queryOne<Record<string, unknown>>('select * from submissions where id=$1', [id])
    if (!sub) throw new HttpError(404, 'Submission not found.')
    const { manager, conf } = await access(user.id, sub)
    if (!manager) throw new HttpError(403, 'Only conference organizers can assign reviewers.')
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success || (!parsed.data.reviewerEmail && !parsed.data.reviewerId)) {
      return NextResponse.json({ error: 'Provide reviewerId or reviewerEmail of a registered user.' }, { status: 400 })
    }
    const reviewer = parsed.data.reviewerId
      ? await queryOne<{ id: string; display_name: string; account_type: string }>('select id, display_name, account_type from users where id=$1', [parsed.data.reviewerId])
      : await queryOne<{ id: string; display_name: string; account_type: string }>('select id, display_name, account_type from users where lower(email)=$1', [parsed.data.reviewerEmail!.toLowerCase()])
    if (!reviewer) return NextResponse.json({ error: 'No registered account uses that email. The person must register as a Reviewer first, then you can invite or assign them.' }, { status: 404 })
    if (reviewer.account_type !== 'reviewer') return NextResponse.json({ error: `That account is registered as ${reviewer.account_type}, not as a Reviewer. Reviewer permissions cannot be granted to a non-Reviewer account.` }, { status: 400 })
    if (reviewer.id === sub.author_id) return NextResponse.json({ error: 'Authors cannot review their own paper.' }, { status: 400 })
    if (!(await isEventReviewer(String(sub.conference_id), reviewer.id))) {
      return NextResponse.json({ error: 'This Reviewer is not yet approved for this event. Approve their reviewer application or invite them to this event and wait for them to accept before assigning papers.' }, { status: 403 })
    }
    const existingAssignment = await queryOne('select id from review_assignments where submission_id=$1 and reviewer_id=$2', [id, reviewer.id])
    if (existingAssignment) return NextResponse.json({ error: 'This Reviewer is already assigned to this submission.' }, { status: 409 })
    const assignmentId = newId('asg')
    await query(
      `insert into review_assignments (id,submission_id,reviewer_id,due_date) values ($1,$2,$3,$4)
       on conflict (submission_id,reviewer_id) do update set status='invited', due_date=excluded.due_date`,
      [assignmentId, id, reviewer.id, parsed.data.dueDate || (conf as Record<string, unknown>).review_deadline || null],
    )
    if (sub.status === 'Submitted' || sub.status === 'Revised Submitted') await query("update submissions set status='Under Review', updated_at=now() where id=$1", [id])
    await notify(reviewer.id, 'review_assignment', 'New review assignment', `You were assigned to review "${String(sub.title)}" for "${String(conf.title)}".`, '/review')
    await logActivity(user.id, conf.organization_id, String(sub.conference_id), 'reviewer_assigned', `${reviewer.display_name} → ${String(sub.title)}`)
    return NextResponse.json({ ok: true, reviewer: { id: reviewer.id, displayName: reviewer.display_name } })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
