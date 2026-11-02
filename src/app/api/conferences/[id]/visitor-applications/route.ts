import { NextResponse } from 'next/server'
import { query, queryOne, newId, notify } from '@/lib/server/db'
import { requireUser, requireAccountType, getConferenceRow, canAccessConference, errorJson, HttpError } from '@/lib/server/auth'
import { isConferenceManager, serializeVisitorApplication, eventManagers, paymentProviderConfigured } from '@/lib/server/business'
import { arr } from '@/lib/server/business'
import { saveSubmissionFile, validatePdfBytes } from '@/lib/server/files'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const conf = await getConferenceRow(id)
    if (!conf) throw new HttpError(404, 'Event not found.')
    const manager = await isConferenceManager(user, conf)
    const rows = manager
      ? await query(`select va.*, u.display_name as visitor_name, u.email as visitor_email, c.title as conference_title from visitor_applications va join users u on u.id=va.visitor_id join conferences c on c.id=va.conference_id where va.conference_id=$1 order by va.created_at desc`, [id])
      : await query(`select va.*, u.display_name as visitor_name, u.email as visitor_email, c.title as conference_title from visitor_applications va join users u on u.id=va.visitor_id join conferences c on c.id=va.conference_id where va.conference_id=$1 and va.visitor_id=$2 order by va.created_at desc`, [id, user.id])
    return NextResponse.json({ applications: rows.map(serializeVisitorApplication) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

/**
 * Visitor applies to attend. Accepts JSON or multipart (with a supporting
 * document file). Statuses: pending_payment (paid, unpaid) → pending_review →
 * approved / rejected / waitlisted. Payment stays separate from admission.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    requireAccountType(user, ['visitor'], 'Only Visitor accounts can apply to attend an event. Researchers submit papers instead; Reviewers and Organizers cannot register as attendees with this account.')
    const conf = (await getConferenceRow(id)) as (NonNullable<Awaited<ReturnType<typeof getConferenceRow>>> & Record<string, unknown>) | null
    if (!conf) throw new HttpError(404, 'Event not found.')
    if (!(await canAccessConference(user, conf))) throw new HttpError(403, 'You do not have access to this event. Private events require an invitation from the organizer.')
    if (conf.registration_enabled === false) throw new HttpError(403, 'Attendee registration is disabled for this event.')
    if (['draft', 'completed', 'archived'].includes(String(conf.lifecycle))) throw new HttpError(403, 'Registration is not open for this event.')
    const regDeadline = (conf.registration_deadline as string) || (conf.start_date as string) || null
    if (regDeadline && Date.now() > new Date(`${String(regDeadline).slice(0, 10)}T23:59:59`).getTime()) {
      throw new HttpError(403, 'The registration deadline for this event has passed.')
    }
    if (conf.capacity) {
      const approved = await queryOne<{ n: string }>("select count(*)::text as n from visitor_applications where conference_id=$1 and status='approved'", [id])
      if (Number(approved?.n || 0) >= Number(conf.capacity)) throw new HttpError(409, 'This event has reached its attendee capacity.')
    }
    const questions = arr(conf.eligibility_questions)
    const requiredDocs = arr(conf.required_documents)

    let answers: Record<string, string> = {}
    let documentName: string | null = null
    let documentPath: string | null = null
    let documentSize = 0
    const contentType = req.headers.get('content-type') || ''
    const appId = newId('vapp')
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      try { answers = JSON.parse(String(form.get('answers') || '{}')) as Record<string, string> } catch { answers = {} }
      for (const q of questions) {
        const v = form.get(`answer:${q}`)
        if (typeof v === 'string') answers[q] = v
      }
      const file = form.get('document')
      if (file instanceof File && file.size > 0) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const invalid = validatePdfBytes(file.name, bytes)
        if (invalid) throw new HttpError(400, `Supporting document: ${invalid}`)
        documentName = file.name
        documentSize = bytes.length
        documentPath = await saveSubmissionFile(appId, 'camera', bytes) // stored server-side, never public
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as { answers?: Record<string, string> }
      answers = body.answers && typeof body.answers === 'object' ? Object.fromEntries(Object.entries(body.answers).map(([k, v]) => [k, String(v).slice(0, 4000)])) : {}
    }
    for (const q of questions) {
      if (!String(answers[q] ?? '').trim()) throw new HttpError(400, `Please answer the required question: "${q}"`)
    }
    if (requiredDocs.length > 0 && !documentPath) {
      throw new HttpError(400, `A supporting document is required for this event (${requiredDocs.join(', ')}). Upload it with your application.`)
    }
    const existing = await queryOne<{ id: string; status: string }>('select id, status from visitor_applications where conference_id=$1 and visitor_id=$2', [id, user.id])
    if (existing && !['cancelled', 'rejected'].includes(String(existing.status))) {
      return NextResponse.json({ error: `You already have an application for this event (status: ${existing.status}).` }, { status: 409 })
    }

    const fee = Number(conf.participation_fee_cents || 0)
    const paid = fee > 0
    const providerReady = paymentProviderConfigured()
    const paymentStatus = !paid ? 'not_required' : providerReady ? 'pending' : 'unconfigured'
    const status = paid ? 'pending_payment' : conf.registration_mode === 'auto' ? 'approved' : 'pending_review'

    const finalId = existing?.id || appId
    if (existing) {
      await query('update visitor_applications set status=$1, answers=$2, document_name=$3, document_path=$4, document_size=$5, payment_status=$6, organizer_note=null, updated_at=now() where id=$7',
        [status, JSON.stringify(answers), documentName, documentPath, documentSize, paymentStatus, finalId])
    } else {
      await query('insert into visitor_applications (id,conference_id,visitor_id,status,answers,document_name,document_path,document_size,payment_status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [finalId, id, user.id, status, JSON.stringify(answers), documentName, documentPath, documentSize, paymentStatus])
    }
    if (paid) {
      await query('insert into payments (id,visitor_application_id,conference_id,user_id,amount_cents,currency,status,provider) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [newId('pay'), finalId, id, user.id, fee, String(conf.fee_currency || 'USD'), providerReady ? 'pending' : 'unconfigured', providerReady ? String(process.env.PAYMENT_PROVIDER) : null])
    }
    for (const m of await eventManagers(conf.organization_id)) {
      if (m !== user.id) await notify(m, 'visitor_application', 'New visitor application', `${user.display_name} applied to attend "${String(conf.title)}".`, '/dashboard')
    }
    await notify(user.id, 'application_received', 'Application received',
      paid
        ? `Your application for "${String(conf.title)}" is pending payment (${fee / 100} ${String(conf.fee_currency || 'USD')}). ${providerReady ? 'Complete payment to continue.' : 'Payment is not configured for this event yet, so no payment can be taken.'}`
        : status === 'approved'
          ? `Your registration for "${String(conf.title)}" was automatically approved.`
          : `Your application for "${String(conf.title)}" is pending organizer review.`, '/dashboard')
    const row = (await query(`select va.*, u.display_name as visitor_name, u.email as visitor_email, c.title as conference_title from visitor_applications va join users u on u.id=va.visitor_id join conferences c on c.id=va.conference_id where va.id=$1`, [finalId]))[0]
    return NextResponse.json({ application: serializeVisitorApplication(row), paymentConfigured: providerReady }, { status: 201 })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
