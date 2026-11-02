import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, newId, notify } from '@/lib/server/db'
import { requireUser, requireAccountType, getConferenceRow, canAccessConference, errorJson, HttpError } from '@/lib/server/auth'
import { isConferenceManager, serializeReviewerApplication, eventManagers, participantsLink } from '@/lib/server/business'

const Schema = z.object({ message: z.string().trim().max(2000).optional() })

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const conf = await getConferenceRow(id)
    if (!conf) throw new HttpError(404, 'Event not found.')
    const manager = await isConferenceManager(user, conf)
    const rows = manager
      ? await query(`select ra.*, u.display_name as reviewer_name, u.email as reviewer_email, c.title as conference_title from reviewer_applications ra join users u on u.id=ra.reviewer_id join conferences c on c.id=ra.conference_id where ra.conference_id=$1 order by ra.created_at desc`, [id])
      : await query(`select ra.*, u.display_name as reviewer_name, u.email as reviewer_email, c.title as conference_title from reviewer_applications ra join users u on u.id=ra.reviewer_id join conferences c on c.id=ra.conference_id where ra.conference_id=$1 and ra.reviewer_id=$2 order by ra.created_at desc`, [id, user.id])
    return NextResponse.json({ applications: rows.map(serializeReviewerApplication) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

/** A Reviewer applies to review this event. Approval is separate and required before any paper access. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    requireAccountType(user, ['reviewer'], 'Only Reviewer accounts can apply to review an event.')
    const conf = await getConferenceRow(id) as (NonNullable<Awaited<ReturnType<typeof getConferenceRow>>> & Record<string, unknown>) | null
    if (!conf) throw new HttpError(404, 'Event not found.')
    if (!(await canAccessConference(user, conf))) throw new HttpError(403, 'You do not have access to this event. Private events require an invitation.')
    if (conf.reviewer_mode === 'invitations') throw new HttpError(403, 'This event does not accept reviewer applications; reviewers are invited by the organizer.')
    if (['draft', 'completed', 'archived'].includes(String(conf.lifecycle))) throw new HttpError(403, 'This event is not accepting reviewer applications.')
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    const existing = await queryOne<{ id: string; status: string }>('select id, status from reviewer_applications where conference_id=$1 and reviewer_id=$2', [id, user.id])
    if (existing && existing.status !== 'withdrawn' && existing.status !== 'rejected') {
      return NextResponse.json({ error: `You already have a reviewer application for this event (status: ${existing.status}).` }, { status: 409 })
    }
    const appId = existing?.id || newId('rapp')
    if (existing) {
      await query("update reviewer_applications set status='pending', message=$1, decided_by=null, decided_at=null, updated_at=now() where id=$2", [parsed.success ? parsed.data.message || null : null, appId])
    } else {
      await query('insert into reviewer_applications (id,conference_id,reviewer_id,message) values ($1,$2,$3,$4)', [appId, id, user.id, parsed.success ? parsed.data.message || null : null])
    }
    const manageLink = await participantsLink(id)
    for (const m of await eventManagers(conf.organization_id)) {
      if (m !== user.id) await notify(m, 'reviewer_application', 'New reviewer application', `${user.display_name} applied to review "${String(conf.title)}". Open to accept or reject it.`, manageLink)
    }
    const row = (await query(`select ra.*, u.display_name as reviewer_name, u.email as reviewer_email, c.title as conference_title from reviewer_applications ra join users u on u.id=ra.reviewer_id join conferences c on c.id=ra.conference_id where ra.id=$1`, [appId]))[0]
    return NextResponse.json({ application: serializeReviewerApplication(row) }, { status: 201 })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
