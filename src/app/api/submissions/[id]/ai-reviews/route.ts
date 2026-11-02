import { NextResponse } from 'next/server'
import { query, queryOne, newId } from '@/lib/server/db'
import { requireUser, errorJson, HttpError } from '@/lib/server/auth'
import { access } from '../route'

/** Persist an AI review produced by /api/ai/review (advisory only). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const sub = await queryOne<Record<string, unknown>>('select * from submissions where id=$1', [id])
    if (!sub) throw new HttpError(404, 'Submission not found.')
    const { manager, reviewer } = await access(user.id, sub)
    if (!manager && !reviewer) throw new HttpError(403, 'You cannot add an AI review to this paper.')
    const body = (await req.json().catch(() => ({}))) as { review?: unknown; source?: string; label?: string; model?: string }
    if (!body.review || typeof body.review !== 'object') return NextResponse.json({ error: 'review payload required.' }, { status: 400 })
    const reviewId = newId('airev')
    const payload = { ...(body.review as Record<string, unknown>), label: body.label || '', confidence: (body.review as Record<string, unknown>).confidence || 'medium' }
    await query('insert into ai_reviews (id,submission_id,created_by,payload,source,model) values ($1,$2,$3,$4,$5,$6)',
      [reviewId, id, user.id, JSON.stringify(payload), body.source === 'meta' ? 'meta' : 'fallback', body.model || null])
    return NextResponse.json({ ok: true, id: reviewId }, { status: 201 })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
