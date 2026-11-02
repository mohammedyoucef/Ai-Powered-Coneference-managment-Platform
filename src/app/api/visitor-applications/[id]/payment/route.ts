import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { requireUser, getConferenceRow, errorJson, HttpError } from '@/lib/server/auth'
import { isConferenceManager, paymentProviderConfigured } from '@/lib/server/business'

async function loadOwned(id: string, userId: string, managerOk: (confId: string) => Promise<boolean>) {
  const app = await queryOne<Record<string, unknown>>('select * from visitor_applications where id=$1', [id])
  if (!app) throw new HttpError(404, 'Visitor application not found.')
  if (String(app.visitor_id) !== userId && !(await managerOk(String(app.conference_id)))) throw new HttpError(403, 'You cannot view this payment.')
  return app
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const app = await loadOwned(id, user.id, async (confId) => {
      const conf = await getConferenceRow(confId)
      return conf ? isConferenceManager(user, conf) : false
    })
    const rows = await query('select * from payments where visitor_application_id=$1 order by created_at desc', [id])
    return NextResponse.json({
      paymentStatus: String(app.payment_status),
      paymentConfigured: paymentProviderConfigured(),
      payments: rows.map((p) => ({
        id: String(p.id), visitorApplicationId: String(p.visitor_application_id), conferenceId: String(p.conference_id),
        userId: String(p.user_id), amountCents: Number(p.amount_cents), currency: String(p.currency),
        status: String(p.status), provider: (p.provider as string) || undefined,
        createdAt: p.created_at ? new Date(String(p.created_at)).toISOString() : new Date().toISOString(),
      })),
    })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

/**
 * Payment initiation. No real provider is bundled: without provider
 * credentials this honestly reports the unconfigured state and never marks
 * anything as paid. A deployment with a provider must verify payment via
 * signed webhooks before setting payment_status='succeeded'.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const app = await queryOne<Record<string, unknown>>('select * from visitor_applications where id=$1', [id])
    if (!app) throw new HttpError(404, 'Visitor application not found.')
    if (String(app.visitor_id) !== user.id) throw new HttpError(403, 'Only the applicant can pay for this application.')
    if (String(app.payment_status) === 'succeeded') return NextResponse.json({ error: 'This application is already paid.' }, { status: 409 })
    if (String(app.payment_status) === 'not_required') return NextResponse.json({ error: 'This event is free; no payment is required.' }, { status: 400 })
    if (!paymentProviderConfigured()) {
      return NextResponse.json({
        error: 'Payments are not configured for this deployment (no payment provider credentials). No payment was taken and nothing is marked as paid. The organizer must configure a real payment provider before paid admission can proceed.',
        paymentStatus: 'unconfigured',
        paymentConfigured: false,
      }, { status: 503 })
    }
    // A configured provider integration must create a checkout session here
    // and confirm via webhook. No provider SDK is bundled with this repo.
    return NextResponse.json({ error: 'Payment provider is configured by environment, but no checkout integration is installed in this build. No payment was taken.' }, { status: 501 })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
