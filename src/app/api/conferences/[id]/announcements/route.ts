import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, newId, notify } from '@/lib/server/db'
import { requireUser, getCurrentUser, getConferenceRow, canAccessConference, errorJson, HttpError } from '@/lib/server/auth'
import { isConferenceManager } from '@/lib/server/business'

const Schema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().max(5000).optional(),
  audience: z.enum(['all', 'visitors', 'researchers', 'reviewers']).default('all'),
})

function serialize(r: Record<string, unknown>) {
  return {
    id: String(r.id), conferenceId: String(r.conference_id), title: String(r.title),
    body: (r.body as string) || undefined, audience: String(r.audience),
    createdAt: r.created_at ? new Date(String(r.created_at)).toISOString() : new Date().toISOString(),
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getCurrentUser()
    const conf = await getConferenceRow(id)
    if (!conf) throw new HttpError(404, 'Event not found.')
    if (!(await canAccessConference(user, conf))) throw new HttpError(403, 'You do not have access to this event.')
    const rows = await query('select * from event_announcements where conference_id=$1 order by created_at desc limit 50', [id])
    return NextResponse.json({ announcements: rows.map(serialize) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

/** Organizer publishes an announcement and notifies the relevant participants. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const conf = await getConferenceRow(id)
    if (!conf) throw new HttpError(404, 'Event not found.')
    if (!(await isConferenceManager(user, conf))) throw new HttpError(403, 'Only organizers managing this event can publish announcements.')
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'Announcement title (3+ chars) is required.' }, { status: 400 })
    const annId = newId('ann')
    await query('insert into event_announcements (id,conference_id,title,body,audience,created_by) values ($1,$2,$3,$4,$5,$6)',
      [annId, id, parsed.data.title, parsed.data.body || null, parsed.data.audience, user.id])
    const recipients = new Set<string>()
    if (parsed.data.audience === 'all' || parsed.data.audience === 'visitors') {
      (await query<{ visitor_id: string }>("select visitor_id from visitor_applications where conference_id=$1 and status='approved'", [id])).forEach((r) => recipients.add(r.visitor_id))
    }
    if (parsed.data.audience === 'all' || parsed.data.audience === 'researchers') {
      (await query<{ author_id: string }>('select distinct author_id from submissions where conference_id=$1 and author_id is not null', [id])).forEach((r) => recipients.add(r.author_id))
    }
    if (parsed.data.audience === 'all' || parsed.data.audience === 'reviewers') {
      (await query<{ reviewer_id: string }>('select reviewer_id from review_assignments ra join submissions s on s.id=ra.submission_id where s.conference_id=$1', [id])).forEach((r) => recipients.add(r.reviewer_id))
    }
    recipients.delete(user.id)
    for (const uid of recipients) await notify(uid, 'event_announcement', parsed.data.title, parsed.data.body || `"${String(conf.title)}" published an update.`, '/dashboard')
    const row = (await query('select * from event_announcements where id=$1', [annId]))[0]
    return NextResponse.json({ announcement: serialize(row), notified: recipients.size }, { status: 201 })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
