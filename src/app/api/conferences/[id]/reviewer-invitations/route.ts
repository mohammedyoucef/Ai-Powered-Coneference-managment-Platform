import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, newId, notify } from '@/lib/server/db'
import { requireUser, errorJson } from '@/lib/server/auth'
import { requireEventManager, serializeReviewerInvitation } from '@/lib/server/business'

const Schema = z.object({ email: z.string().trim().email('Enter a valid email address.') })

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    await requireEventManager(user, id)
    const rows = await query(`select ri.*, c.title as conference_title from reviewer_invitations ri join conferences c on c.id=ri.conference_id where ri.conference_id=$1 order by ri.created_at desc`, [id])
    return NextResponse.json({ invitations: rows.map(serializeReviewerInvitation) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

/**
 * Organizer invites a Reviewer by email (spec §2A):
 * validate format → account must exist → account type must be Reviewer →
 * create an event-specific invitation. Never grants access to other events.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const conf = await requireEventManager(user, id)
    if (conf.reviewer_mode === 'applications') return NextResponse.json({ error: 'This event is configured to accept reviewer applications only, not direct invitations.' }, { status: 403 })
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Enter a valid email address.' }, { status: 400 })
    const email = parsed.data.email.toLowerCase()
    const target = await queryOne<{ id: string; display_name: string; account_type: string }>('select id, display_name, account_type from users where lower(email)=$1', [email])
    if (!target) {
      return NextResponse.json({ error: `No account uses ${email}. That person must register as a Reviewer first — invitations can only be sent to registered Reviewer accounts.` }, { status: 404 })
    }
    if (target.account_type !== 'reviewer') {
      return NextResponse.json({ error: `The account for ${email} is registered as ${target.account_type}, not as a Reviewer. Reviewer permissions cannot be granted automatically to another account type.` }, { status: 400 })
    }
    const existing = await queryOne<{ id: string; status: string }>('select id, status from reviewer_invitations where conference_id=$1 and lower(email)=$2', [id, email])
    if (existing && existing.status !== 'declined' && existing.status !== 'revoked') {
      return NextResponse.json({ error: `This Reviewer already has an invitation for this event (status: ${existing.status}). Duplicate invitations are prevented.` }, { status: 409 })
    }
    const approvedApp = await queryOne('select id from reviewer_applications where conference_id=$1 and reviewer_id=$2 and status=$3', [id, target.id, 'approved'])
    if (approvedApp) return NextResponse.json({ error: 'This Reviewer is already approved for this event through their application.' }, { status: 409 })
    const invId = existing?.id || newId('rinv')
    if (existing) {
      await query("update reviewer_invitations set status='invited', reviewer_id=$1, invited_by=$2, responded_at=null where id=$3", [target.id, user.id, invId])
    } else {
      await query('insert into reviewer_invitations (id,conference_id,reviewer_id,email,invited_by) values ($1,$2,$3,$4,$5)', [invId, id, target.id, email, user.id])
    }
    await notify(target.id, 'reviewer_invitation', 'Reviewer invitation', `You were invited to review for "${String(conf.title)}". Accept or decline it in your reviewer workspace.`, '/review')
    const row = (await query(`select ri.*, c.title as conference_title from reviewer_invitations ri join conferences c on c.id=ri.conference_id where ri.id=$1`, [invId]))[0]
    return NextResponse.json({ invitation: serializeReviewerInvitation(row), message: `Invitation sent to ${target.display_name} (${email}). It applies only to this event.` }, { status: 201 })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
