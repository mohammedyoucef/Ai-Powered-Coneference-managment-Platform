import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, newId, notify, logActivity } from '@/lib/server/db'
import { requireUser, requireAccountType, errorJson, HttpError } from '@/lib/server/auth'
import { access } from '../route'

const Schema = z.object({
  overallScore: z.number().int().min(1).max(10),
  criteriaScores: z.record(z.string(), z.number().min(1).max(5)).optional(),
  recommendation: z.enum(['Accept', 'Weak Accept', 'Borderline', 'Weak Reject', 'Reject']),
  comments: z.string().trim().min(5).max(10000),
  confidentialComments: z.string().max(5000).optional(),
  draft: z.boolean().optional(),
  status: z.enum(['draft', 'submitted']).optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const sub = await queryOne<Record<string, unknown>>('select * from submissions where id=$1', [id])
    if (!sub) throw new HttpError(404, 'Submission not found.')
    const { reviewer, conf } = await access(user.id, sub)
    requireAccountType(user, ['reviewer'], 'Only Reviewer accounts can submit reviews.')
    if (!reviewer) throw new HttpError(403, 'Only reviewers assigned to this paper can review it. Unassigned submissions are not accessible.')
    if (sub.author_id === user.id) throw new HttpError(403, 'Authors cannot review their own paper.')
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid review.' }, { status: 400 })
    const assignment = await queryOne<{ id: string }>('select id from review_assignments where submission_id=$1 and reviewer_id=$2', [id, user.id])
    if (!assignment) throw new HttpError(403, 'No assignment exists for this paper.')
    const d = parsed.data
    const isDraft = d.draft === true || d.status === 'draft'
    const reviewStatus = isDraft ? 'draft' : 'submitted'
    const existing = await queryOne<{ id: string }>('select id from reviews where assignment_id=$1', [assignment.id])
    const reviewId = existing?.id || newId('rev')
    await query(
      `insert into reviews (id,submission_id,assignment_id,reviewer_id,reviewer_name,overall_score,criteria_scores,recommendation,comments,confidential_comments,status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (assignment_id) where assignment_id is not null do update set overall_score=excluded.overall_score, criteria_scores=excluded.criteria_scores, recommendation=excluded.recommendation, comments=excluded.comments, confidential_comments=excluded.confidential_comments, status=excluded.status, updated_at=now()`,
      [reviewId, id, assignment.id, user.id, user.display_name, d.overallScore, JSON.stringify(d.criteriaScores || {}), d.recommendation, d.comments, d.confidentialComments || null, reviewStatus],
    )
    if (!isDraft) {
      await query("update review_assignments set status='completed' where id=$1", [assignment.id])
      if (sub.status === 'Submitted' || sub.status === 'Revised Submitted') await query("update submissions set status='Under Review', updated_at=now() where id=$1", [id])
      const managers = await query<{ user_id: string }>("select user_id from organization_members where organization_id=$1 and role in ('owner','admin')", [conf.organization_id])
      for (const m of managers) {
        if (m.user_id !== user.id) await notify(m.user_id, 'review_completed', 'Review completed', `${user.display_name} reviewed "${String(sub.title)}".`, '/submissions')
      }
      await logActivity(user.id, conf.organization_id, String(sub.conference_id), 'review_submitted', String(sub.title))
    }
    return NextResponse.json({ ok: true, reviewId, status: reviewStatus }, { status: 201 })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
