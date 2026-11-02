import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, newId, notify } from '@/lib/server/db'
import { requireUser, errorJson } from '@/lib/server/auth'
import { requireEventManager } from '@/lib/server/business'

const Schema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  invitedRole: z.enum(['visitor', 'researcher']),
})

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    await requireEventManager(user, id)
    const rows = await query('select * from event_invitations where conference_id=$1 order by created_at desc', [id])
    return NextResponse.json({
      invitations: rows.map((r) => ({
        id: String(r.id), conferenceId: String(r.conference_id), email: String(r.email),
        invitedRole: String(r.invited_role), status: String(r.status),
        createdAt: r.created_at ? new Date(String(r.created_at)).toISOString() : new Date().toISOString(),
      })),
    })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

/** Invite a Visitor/Researcher by email — the access mechanism for private events. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const conf = await requireEventManager(user, id)
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Enter a valid email and role.' }, { status: 400 })
    const email = parsed.data.email.toLowerCase()
    const target = await queryOne<{ id: string; account_type: string }>('select id, account_type from users where lower(email)=$1', [email])
    if (target && target.account_type !== parsed.data.invitedRole) {
      return NextResponse.json({ error: `The account for ${email} is registered as ${target.account_type}, not ${parsed.data.invitedRole}.` }, { status: 400 })
    }
    const existing = await queryOne<{ id: string }>('select id from event_invitations where conference_id=$1 and lower(email)=$2 and invited_role=$3', [id, email, parsed.data.invitedRole])
    if (existing) return NextResponse.json({ error: 'That person has already been invited to this event in this role.' }, { status: 409 })
    const invId = newId('einv')
    await query('insert into event_invitations (id,conference_id,email,user_id,invited_role,invited_by) values ($1,$2,$3,$4,$5,$6)',
      [invId, id, email, target?.id || null, parsed.data.invitedRole, user.id])
    if (target) {
      await notify(target.id, 'event_invitation', 'Event invitation', `You were invited to "${String(conf.title)}" as a ${parsed.data.invitedRole}. The event is now visible to you.`, '/events')
    }
    return NextResponse.json({
      ok: true, id: invId,
      message: target
        ? `${email} was invited and notified in-app. They can now see this event and ${parsed.data.invitedRole === 'visitor' ? 'apply to attend' : 'submit a paper'}.`
        : `Invitation recorded for ${email}. It takes effect when they register with that email. No email was sent (provider not configured).`,
    }, { status: 201 })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
