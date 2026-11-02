import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, notify, logActivity } from '@/lib/server/db'
import { requireUser, errorJson, HttpError } from '@/lib/server/auth'
import { access } from '../route'

const Schema = z.object({
  decision: z.enum(['Accepted', 'Rejected', 'Revision Requested', 'Under Review', 'Submitted']),
  note: z.string().max(5000).optional(),
  release: z.boolean().default(false),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const sub = await queryOne<Record<string, unknown>>('select * from submissions where id=$1', [id])
    if (!sub) throw new HttpError(404, 'Submission not found.')
    const { manager, conf } = await access(user.id, sub)
    if (!manager) throw new HttpError(403, 'Only conference organizers/chairs can record decisions.')
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid decision.' }, { status: 400 })
    const d = parsed.data
    const nextStatus = d.release && d.decision === 'Accepted' && conf.lifecycle === 'camera_ready' ? 'Camera-Ready Requested' : d.decision
    await query('update submissions set status=$1, decision_note=$2, decision_released=$3, updated_at=now() where id=$4',
      [nextStatus, d.note || null, d.release || Boolean(sub.decision_released), id])
    if (d.release && sub.author_id) {
      const type = d.decision === 'Revision Requested' ? 'revision_requested' : 'decision_released'
      const title = d.decision === 'Revision Requested' ? 'Revision requested' : `Decision: ${d.decision}`
      await notify(String(sub.author_id), type, title, `"${String(sub.title)}" — ${d.decision}${d.note ? `. ${d.note}` : ''}`, '/submissions')
    }
    await logActivity(user.id, conf.organization_id, String(sub.conference_id), 'decision_recorded', `${String(sub.title)}: ${d.decision}${d.release ? ' (released)' : ''}`)
    return NextResponse.json({ ok: true, status: nextStatus, released: d.release })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
