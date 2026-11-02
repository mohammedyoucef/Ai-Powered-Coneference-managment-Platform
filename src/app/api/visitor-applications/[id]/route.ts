import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, notify } from '@/lib/server/db'
import { requireUser, errorJson, HttpError } from '@/lib/server/auth'
import { isConferenceManager, serializeVisitorApplication } from '@/lib/server/business'
import { getConferenceRow } from '@/lib/server/auth'

const DecisionSchema = z.object({
  status: z.enum(['approved', 'rejected', 'waitlisted', 'pending_review', 'cancelled']),
  note: z.string().trim().max(2000).optional(),
})

async function load(id: string) {
  const app = await queryOne<Record<string, unknown>>(
    `select va.*, u.display_name as visitor_name, u.email as visitor_email, c.title as conference_title from visitor_applications va join users u on u.id=va.visitor_id join conferences c on c.id=va.conference_id where va.id=$1`, [id])
  if (!app) throw new HttpError(404, 'Visitor application not found.')
  return app
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const app = await load(id)
    const conf = await getConferenceRow(String(app.conference_id))
    const manager = conf ? await isConferenceManager(user, conf) : false
    if (!manager && String(app.visitor_id) !== user.id) throw new HttpError(403, 'You cannot view this application.')
    return NextResponse.json({ application: serializeVisitorApplication(app), isManager: manager })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

/** Organizer decision (approve/reject/waitlist/reopen) or visitor cancellation. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const app = await load(id)
    const conf = await getConferenceRow(String(app.conference_id))
    if (!conf) throw new HttpError(404, 'Event not found.')
    const manager = await isConferenceManager(user, conf)
    const parsed = DecisionSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'Provide a valid application status.' }, { status: 400 })
    const next = parsed.data.status

    if (!manager) {
      // Visitors may only cancel their own application.
      if (String(app.visitor_id) !== user.id || next !== 'cancelled') throw new HttpError(403, 'Only the event organizer can decide applications. You can only cancel your own.')
      if (['approved', 'rejected'].includes(String(app.status))) throw new HttpError(409, `A ${String(app.status)} application can no longer be cancelled here.`)
      await query("update visitor_applications set status='cancelled', updated_at=now() where id=$1", [id])
      return NextResponse.json({ application: serializeVisitorApplication({ ...app, status: 'cancelled' }) })
    }

    if (String(app.status) === 'cancelled' && next !== 'pending_review') throw new HttpError(409, 'This application was cancelled by the visitor.')
    if (next === 'approved') {
      const fee = Number((conf as Record<string, unknown>).participation_fee_cents || 0)
      // Payment and admission are separate: unpaid paid registrations cannot be approved.
      if (fee > 0 && String(app.payment_status) !== 'succeeded') {
        throw new HttpError(400, `Payment has not been verified for this application (payment status: ${String(app.payment_status)}). Admission can only be approved after verified payment.${String(app.payment_status) === 'unconfigured' ? ' No payment provider is configured, so payment cannot be collected or faked.' : ''}`)
      }
      if ((conf as Record<string, unknown>).capacity) {
        const approved = await queryOne<{ n: string }>("select count(*)::text as n from visitor_applications where conference_id=$1 and status='approved' and id<>$2", [String(app.conference_id), id])
        if (Number(approved?.n || 0) >= Number((conf as Record<string, unknown>).capacity)) throw new HttpError(409, 'This event has reached its attendee capacity. Waitlist the applicant instead.')
      }
    }
    await query('update visitor_applications set status=$1, organizer_note=$2, updated_at=now() where id=$3', [next, parsed.data.note || null, id])
    if (next !== 'pending_review') {
      await notify(String(app.visitor_id), 'application_decision', `Application ${next}`,
        `Your application for "${String(conf.title)}" is now ${next}.${parsed.data.note ? ` Organizer note: ${parsed.data.note}` : ''}`, '/dashboard')
    }
    const row = await load(id)
    return NextResponse.json({ application: serializeVisitorApplication(row) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
