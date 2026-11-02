import { NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { requireUser, requireConferenceManager, requireAccountType, errorJson, HttpError } from '@/lib/server/auth'

const ORDER = ['draft', 'published', 'cfp_open', 'submissions_open', 'under_review', 'decisions_released', 'camera_ready', 'completed', 'archived']
const ALLOWED: Record<string, string[]> = {
  draft: ['published', 'cfp_open', 'archived'],
  published: ['cfp_open', 'submissions_open', 'draft', 'archived'],
  cfp_open: ['submissions_open', 'published', 'archived'],
  submissions_open: ['under_review', 'cfp_open', 'archived'],
  under_review: ['decisions_released', 'submissions_open', 'archived'],
  decisions_released: ['camera_ready', 'completed', 'under_review', 'archived'],
  camera_ready: ['completed', 'decisions_released', 'archived'],
  completed: ['camera_ready', 'archived'],
  archived: ['draft'],
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    requireAccountType(user, ['organizer'], 'Only Organizer accounts can change the event lifecycle.')
    const conf = await requireConferenceManager(user, id)
    const { lifecycle } = (await req.json().catch(() => ({}))) as { lifecycle?: string }
    if (!lifecycle || !ORDER.includes(lifecycle)) throw new HttpError(400, 'Invalid lifecycle state.')
    const allowed = ALLOWED[String(conf.lifecycle)] || []
    if (!allowed.includes(lifecycle)) {
      throw new HttpError(400, `Cannot move from ${String(conf.lifecycle)} to ${lifecycle}. Allowed: ${allowed.join(', ') || 'none'}.`)
    }
    if (lifecycle !== 'draft') {
      const published = await query('select conference_id from website_configs where conference_id=$1 and is_published=true', [id])
      if (!published.length && lifecycle !== 'published') {
        // Publishing the lifecycle implies the site should exist; allow but warn via activity only for published transition without site.
      }
    }
    await query('update conferences set lifecycle=$1, updated_at=now() where id=$2', [lifecycle, id])
    if (lifecycle === 'decisions_released') {
      const authors = await query<{ author_id: string }>("select distinct author_id from submissions where conference_id=$1 and author_id is not null and status in ('Accepted','Rejected')", [id])
      const { notify } = await import('@/lib/server/db')
      for (const a of authors) await notify(a.author_id, 'decision_released', 'Decisions released', `"${String(conf.title)}" decisions are now available.`, '/submissions')
    }
    return NextResponse.json({ ok: true, lifecycle })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
