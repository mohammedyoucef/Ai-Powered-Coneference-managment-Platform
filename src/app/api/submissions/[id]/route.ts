import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { requireUser, getConferenceRow, orgRole, isPlatformAdmin, errorJson, HttpError } from '@/lib/server/auth'
import { serializeSubmission } from '@/lib/server/serialize'
import { deleteSubmissionFile } from '@/lib/server/files'

type Row = Record<string, unknown>

async function loadSub(id: string): Promise<Row> {
  const sub = await queryOne<Row>('select * from submissions where id=$1', [id])
  if (!sub) throw new HttpError(404, 'Submission not found.')
  return sub
}

export async function access(userId: string, sub: Row) {
  const conf = await getConferenceRow(String(sub.conference_id))
  if (!conf) throw new HttpError(404, 'Conference not found.')
  const userRow = await queryOne<{ platform_role: string }>('select platform_role from users where id=$1', [userId])
  const admin = userRow?.platform_role === 'platform_admin'
  const fakeUser = { id: userId, platform_role: admin ? 'platform_admin' : 'user' } as never
  const role = admin ? 'owner' : await orgRole(fakeUser, conf.organization_id).catch(() => null)
  const manager = admin || role === 'owner' || role === 'admin'
  const assigned = await queryOne('select id from review_assignments where submission_id=$1 and reviewer_id=$2', [String(sub.id), userId])
  return { conf, manager, author: sub.author_id === userId, reviewer: Boolean(assigned) }
}

/** Author edit (before decision / deadline) or manager update. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const sub = await loadSub(id)
    const { conf, manager, author } = await access(user.id, sub)
    if (!manager && !author) throw new HttpError(403, 'You cannot edit this submission.')
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (!manager && author) {
      if (sub.decision_released) throw new HttpError(403, 'Decisions have been released; this submission can no longer be edited.')
      if (conf.submission_deadline && Date.now() > new Date(`${String(conf.submission_deadline).slice(0, 10)}T23:59:59`).getTime() && ['Accepted', 'Camera-Ready Requested'].includes(String(sub.status)) === false) {
        // Editing metadata after deadline is only blocked for the initial submission phase.
        if (conf.lifecycle === 'submissions_open' || conf.lifecycle === 'cfp_open') throw new HttpError(403, 'The submission deadline has passed.')
      }
    }
    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    const map: [string, string][] = [['title', 'title'], ['abstract', 'abstract'], ['status', 'status'], ['decisionNote', 'decision_note']]
    for (const [k, col] of map) if (k in b) {
      if (k === 'status' && !manager) throw new HttpError(403, 'Only organizers can change submission status.')
      sets.push(`${col}=$${i++}`); vals.push(String(b[k] || '') || null)
    }
    if (Array.isArray(b.authors)) { sets.push(`authors=$${i++}`); vals.push(JSON.stringify(b.authors)) }
    if (Array.isArray(b.topics)) { sets.push(`topics=$${i++}`); vals.push(JSON.stringify(b.topics)) }
    if (sets.length === 0) return NextResponse.json({ error: 'No changes supplied.' }, { status: 400 })
    vals.push(id)
    await query(`update submissions set ${sets.join(', ')}, updated_at=now() where id=$${i}`, vals)
    const row = (await query(
      `select s.*, (select u.display_name from review_assignments a join users u on u.id=a.reviewer_id where a.submission_id=s.id order by a.created_at limit 1) as assigned_reviewer_name,
              (select a.reviewer_id from review_assignments a where a.submission_id=s.id order by a.created_at limit 1) as assigned_reviewer_id from submissions s where s.id=$1`, [id]))[0]
    return NextResponse.json({ submission: serializeSubmission(row) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const sub = await loadSub(id)
    const { manager, author } = await access(user.id, sub)
    if (!manager && !author) throw new HttpError(403, 'You cannot delete this submission.')
    await deleteSubmissionFile(sub.file_path as string)
    await deleteSubmissionFile(sub.camera_file_path as string)
    await query('delete from submissions where id=$1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
