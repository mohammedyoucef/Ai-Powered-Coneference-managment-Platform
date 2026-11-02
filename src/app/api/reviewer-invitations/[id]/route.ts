import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, notify } from '@/lib/server/db'
import { requireUser, requireAccountType, errorJson, HttpError } from '@/lib/server/auth'
import { serializeReviewerInvitation, eventManagers, participantsLink, autoAssignOpenPapers } from '@/lib/server/business'

const Schema = z.object({ status: z.enum(['accepted', 'declined']) })

/** The invited Reviewer accepts or declines an event invitation. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    requireAccountType(user, ['reviewer'], 'Only Reviewer accounts can respond to reviewer invitations.')
    const inv = await queryOne<Record<string, unknown>>('select * from reviewer_invitations where id=$1', [id])
    if (!inv) throw new HttpError(404, 'Invitation not found.')
    if (String(inv.reviewer_id || '') !== user.id && String(inv.email).toLowerCase() !== user.email.toLowerCase()) {
      throw new HttpError(403, 'This invitation belongs to a different Reviewer.')
    }
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'status must be accepted or declined.' }, { status: 400 })
    if (String(inv.status) !== 'invited') return NextResponse.json({ error: `This invitation was already ${String(inv.status)}.` }, { status: 409 })
    await query('update reviewer_invitations set status=$1, reviewer_id=$2, responded_at=now() where id=$3', [parsed.data.status, user.id, id])
    if (parsed.data.status === 'accepted') {
      await autoAssignOpenPapers(String(inv.conference_id), user.id).catch(() => 0)
    }
    const conf = await queryOne<{ title: string; organization_id: string }>('select title, organization_id from conferences where id=$1', [String(inv.conference_id)])
    if (conf) {
      const manageLink = await participantsLink(String(inv.conference_id))
      for (const m of await eventManagers(conf.organization_id)) {
        await notify(m, 'reviewer_invitation_response', `Reviewer invitation ${parsed.data.status}`, `${user.display_name} ${parsed.data.status} the invitation to review "${conf.title}".`, manageLink)
      }
    }
    const row = (await query(`select ri.*, c.title as conference_title from reviewer_invitations ri join conferences c on c.id=ri.conference_id where ri.id=$1`, [id]))[0]
    return NextResponse.json({ invitation: serializeReviewerInvitation(row) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
